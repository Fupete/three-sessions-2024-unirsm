//TEST CLOTH + 3D MODEL

import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

let scene, animation, onWindowResize, controls, onMouseMove
let groundGeom
let groundMate, clothMaterial, mirrorMate
let world, groundBody
let noise3D
let cloth, clothParticles, constraints = []
let flowField

export function sketch() {

    let mouse = new THREE.Vector2()
    onMouseMove = (event) => {
        mouse.x = (event.clientX / window.innerWidth) * 2 - 1
        mouse.y = -(event.clientY / window.innerHeight) * 2 + 1
    };
    window.addEventListener('mousemove', onMouseMove);

    const p = {
        // cloth
        clothWidth: 10,
        clothHeight: 10,
        clothResolution: 24,
        // view
        lookAtCenter: new THREE.Vector3(0, 4, 0),
        cameraPosition: new THREE.Vector3(0, 0, - 20),
        autoRotate: false,
        autoRotateSpeed: -1 + Math.random() * 2,
        camera: 35,
        // world
        background: new THREE.Color(0x000000),
        clothMass: 1,
        gravity: 2,
        wind: true,
        windStrength: 3 + Math.random() * 3,
        floor: -2,
    };

    // other parameters
    let near = 0.2, far = 1000;
    let shadowMapWidth = 2048, shadowMapHeight = 2048;
    let paused = false;

    // CAMERA
    let camera = new THREE.PerspectiveCamera(p.camera, window.innerWidth / window.innerHeight, near, far)
    camera.position.copy(p.cameraPosition)
    camera.lookAt(p.lookAtCenter)

    // WINDOW RESIZE
    onWindowResize = () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    };
    window.addEventListener('resize', onWindowResize);

    // SCENE
    scene = new THREE.Scene()
    scene.background = p.background
    scene.fog = new THREE.Fog(scene.background, 15, 80)
    world = new CANNON.World({
        gravity: new CANNON.Vec3(0, p.gravity, 0)
    });
    world.solver.iterations = 10

    // MATERIALS
    groundMate = new THREE.MeshStandardMaterial({
        color: p.background,
        roughness: 1,
        metalness: 0,
        fog: true,
    })

    // Static ground plane
    groundGeom = new THREE.PlaneGeometry(20, 20)
    let ground = new THREE.Mesh(groundGeom, groundMate)
    ground.position.set(0, p.floor, 0)
    ground.rotation.x = - Math.PI / 2
    ground.scale.set(100, 100, 100)
    ground.castShadow = false
    ground.receiveShadow = true
    scene.add(ground)
    groundBody = new CANNON.Body({
        position: new CANNON.Vec3(0, p.floor - 1, 0),
        mass: 0,
        shape: new CANNON.Plane(),
    });
    groundBody.quaternion.setFromAxisAngle(new CANNON.Vec3(1, 0, 0), -Math.PI / 2);
    groundBody.quaternion.setFromEuler(-Math.PI / 2, 0, 0);
    world.addBody(groundBody);
    ground.position.copy(groundBody.position);
    ground.quaternion.copy(groundBody.quaternion);

    // CONTROLS
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enablePan = false;
    controls.enableDamping = true;
    controls.dampingFactor = 0.05;
    controls.minDistance = 5;
    controls.maxDistance = 40;
    controls.maxPolarAngle = Math.PI / 2 + 0.2;
    controls.minPolarAngle = Math.PI / 2 - 0.4;
    controls.autoRotate = p.autoRotate;
    controls.autoRotateSpeed = p.autoRotateSpeed;
    controls.target = p.lookAtCenter;

    // CLOTH
    const cWidth = p.clothWidth;
    const cHeight = p.clothHeight;
    const Nx = p.clothResolution;
    const Ny = p.clothResolution;
    const clothGeometry = new THREE.PlaneGeometry(cWidth, cHeight, Nx, Ny);
    mirrorMate = new THREE.MeshPhongMaterial({
        color: 0x444444,
        envMap: cubeTextures[0].texture,
        side: THREE.DoubleSide,
        flatShading: true,
        // combine: THREE.addOperation,
        reflectivity: 1,
        specular: 0x999999,
        fog: true
    });

    cloth = new THREE.Mesh(clothGeometry, mirrorMate);
    cloth.castShadow = true;
    scene.add(cloth);

    const restDistanceX = cWidth / Nx;
    const restDistanceY = cHeight / Ny;
    clothParticles = [];
    const mass = (p.clothMass / Nx) * Ny;

    const connectParticles = (x1, y1, x2, y2) => {
        const particleA = clothParticles[x1][y1];
        const particleB = clothParticles[x2][y2];
        const distance = particleA.position.distanceTo(particleB.position);
        const constraint = new CANNON.DistanceConstraint(particleA, particleB, distance);
        world.addConstraint(constraint);
        constraints.push(constraint);
    };

    for (let x = 0; x <= Nx; x++) {
        clothParticles.push([]);
        for (let y = 0; y <= Ny; y++) {
            const hangingPosition = new CANNON.Vec3(
                (x - Nx * 0.5) * restDistanceX,
                p.floor,
                (y - Ny * 0.5) * restDistanceY
            );

            const particle = new CANNON.Body({
                mass: mass,
                position: hangingPosition,
                shape: new CANNON.Particle(),
                velocity: new CANNON.Vec3(0, 0, 0),
                linearDamping: 0.5,
            });

            clothParticles[x].push(particle);
            world.addBody(particle);
        }
    }

    // Constrains
    for (let x = 0; x <= Nx; x++) {
        for (let y = 0; y <= Ny; y++) {
            if (x < Nx && y < Ny) {
                connectParticles(x, y, x, y + 1);
                connectParticles(x, y, x + 1, y);
                // Aggiungi vincoli diagonali
                connectParticles(x, y, x + 1, y + 1);
                if (y > 0) {
                    connectParticles(x, y, x + 1, y - 1);
                }
            } else if (x === Nx && y < Ny) {
                connectParticles(x, y, x, y + 1);
            } else if (x < Nx && y === Ny) {
                connectParticles(x, y, x + 1, y);
            }
        }
    }

    // Aggiungi le corde elastiche
    const anchorDistance = 2;
    const anchorPoints = [
        new CANNON.Vec3(-1, p.floor + anchorDistance, -1),
        new CANNON.Vec3(1, p.floor + anchorDistance, -1),
        new CANNON.Vec3(-1, p.floor + anchorDistance, 1),
        new CANNON.Vec3(1, p.floor + anchorDistance, 1)
    ];

    const anchorBodies = [];
    anchorPoints.forEach((point) => {
        const anchorBody = new CANNON.Body({
            mass: 0,
            position: point,
            shape: new CANNON.Particle(),
        });
        anchorBodies.push(anchorBody);
        world.addBody(anchorBody);
    });

    const centerX = Math.floor(Nx / 2)
    const centerY = Math.floor(Ny / 2)
    const cornerParticles = [
        clothParticles[centerX - 1][centerY - 1],
        clothParticles[centerX + 1][centerY - 1],
        clothParticles[centerX - 1][centerY + 1],
        clothParticles[centerX + 1][centerY + 1]
    ];

    cornerParticles.forEach((particle, index) => {
        const anchorBody = anchorBodies[index];
        const constraint = new CANNON.DistanceConstraint(particle, anchorBody, anchorDistance);
        world.addConstraint(constraint);
        constraints.push(constraint);
    });

    // Initialize the vertices of the cloth
    const vertices = [];
    for (let x = 0; x <= Nx; x++) {
        for (let y = 0; y <= Ny; y++) {
            vertices.push(new THREE.Vector3());
        }
    }
    clothGeometry.setAttribute('position', new THREE.BufferAttribute(new Float32Array(vertices.length * 3), 3));

    const light = new THREE.DirectionalLight(0xffffff, 7)
    light.position.set(0, 10, -5)
    light.target.position.set(0, 2, 10)
    light.castShadow = true
    light.shadow.radius = 16
    light.shadow.camera.near = 2
    light.shadow.camera.far = 200
    light.shadow.bias = 0.0001
    light.shadow.mapSize.width = shadowMapWidth
    light.shadow.mapSize.height = shadowMapHeight
    scene.add(light)
    const lightHelper = new THREE.DirectionalLightHelper(light, 5);
    // scene.add(lightHelper);

    const lightD = new THREE.DirectionalLight(0xffffff, 3)
    lightD.position.set(2, 0, -5)
    lightD.target.position.set(0, 2, 10)
    scene.add(lightD)

    const ambientLight = new THREE.AmbientLight(0xffffff)
    scene.add(ambientLight)

    // NOISE
    noise3D = NOISE.createNoise3D()
    let t0 = Math.random() * 10

    // Flowfield per il vento
    const flowFieldSize = 32 // Dimensione della griglia del flowfield
    flowField = createFlowField(flowFieldSize, 0) // Inizializzazione del flowfield
    function createFlowField(size, offsetSpeed) {
        const flowField = [];
        const noiseFreq = 0.1;

        for (let y = 0; y < size; y++) {
            const row = [];
            for (let x = 0; x < size; x++) {
                const noiseX = noise3D(x * noiseFreq, offsetSpeed, y * noiseFreq);
                const noiseY = noise3D(x * noiseFreq, y * noiseFreq, offsetSpeed);

                const windDirection = new THREE.Vector3(0, 1, 0).normalize(); // Direzione del vento verso l'alto
                const windIntensity = Math.sqrt(mouse.x * mouse.x + mouse.y * mouse.y);
                const vector = new THREE.Vector3(noiseX, 1 + noiseY, 0).normalize().multiplyScalar(p.windStrength + windIntensity * 2);

                row.push(vector);
            }
            flowField.push(row);
        }

        return flowField;
    }

    // ANIMATE
    const timeStep = 1 / 60
    const stepsPerFrame = 2
    let lastCallTime

    // Start simulation from a certain time
    // Applica le forze del vento alle particelle del cloth durante l'inizializzazione
    for (let i = 0; i < 1 + Math.random() + 20; i++) { // Regola il numero di iterazioni in base all'effetto desiderato
        for (let x = 0; x <= Nx; x++) {
            for (let y = 0; y <= Ny; y++) {
                const particle = clothParticles[x][y];

                let gridX = Math.floor((particle.position.x + cWidth / 2) / cWidth * flowFieldSize);
                let gridY = Math.floor((particle.position.z + cHeight / 2) / cHeight * flowFieldSize);

                gridX = Math.max(0, Math.min(flowFieldSize - 1, gridX));
                gridY = Math.max(0, Math.min(flowFieldSize - 1, gridY));
                const windForce = flowField[gridY][gridX].clone();

                particle.applyForce(windForce);
            }
        }
        world.step(timeStep);
    }

    const animate = () => {
        if (showStats) stats.begin();

        // ANIMATION
        if (!paused) {

            const t = performance.now() / 1000

            if (!lastCallTime) {
                for (let i = 0; i < stepsPerFrame; i++) {
                    world.step(timeStep);
                }
            } else {
                const dt = t - lastCallTime;
                const numSteps = Math.ceil(dt / timeStep);
                for (let i = 0; i < numSteps; i++) {
                    world.step(timeStep);
                }
            }
            lastCallTime = t

            // CANNON SIMULATION
            if (p.wind) {
                const t1 = t * 1.0;
                flowField = createFlowField(flowFieldSize, t1 * 0.1);

                for (let x = 0; x <= Nx; x++) {
                    for (let y = 0; y <= Ny; y++) {
                        const particle = clothParticles[x][y];

                        let gridX = Math.floor((particle.position.x + cWidth / 2) / cWidth * flowFieldSize);
                        let gridY = Math.floor((particle.position.z + cHeight / 2) / cHeight * flowFieldSize);

                        gridX = Math.max(0, Math.min(flowFieldSize - 1, gridX));
                        gridY = Math.max(0, Math.min(flowFieldSize - 1, gridY));
                        const windForce = flowField[gridY][gridX].clone();

                        particle.applyForce(windForce);
                    }
                }
            }
            const positions = cloth.geometry.attributes.position.array;
            for (let x = 0; x <= Nx; x++) {
                for (let y = 0; y <= Ny; y++) {
                    const particle = clothParticles[x][y];
                    const index = (x * (Nx + 1) + y) * 3;
                    positions[index] = particle.position.x;
                    positions[index + 1] = particle.position.y;
                    positions[index + 2] = particle.position.z;
                }
            }
            cloth.geometry.attributes.position.needsUpdate = true;
        }

        controls.update();
        renderer.render(scene, camera);
        if (showStats) stats.end();

        animation = requestAnimationFrame(animate);
    };
    animate()
}

export function dispose() {
    cancelAnimationFrame(animation)
    scene.remove(cloth);
    clothParticles.forEach((row) => {
        row.forEach((particle) => {
            world.removeBody(particle);
        });
    });
    clothParticles = null;
    constraints.forEach((constraint) => {
        world.removeConstraint(constraint);
    });
    // constraints = null;
    world.removeBody(groundBody);
    controls?.dispose()
    clothMaterial?.dispose()
    mirrorMate?.dispose()
    groundGeom?.dispose()
    groundMate?.dispose()
    world = null
    noise3D = null
    flowField = null
    window?.removeEventListener('resize', onWindowResize)
    window?.removeEventListener('mousemove', onMouseMove)
}