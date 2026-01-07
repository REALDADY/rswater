// ===================================
// IRON MAN AR HOLOGRAPHIC INTERFACE
// WITH TWO-HAND GESTURE SUPPORT
// ===================================

// Global Variables
let video, arCanvas, arCtx, webglContainer;
let scene, camera, renderer;
let hands, cameraInstance;
let leftHandLandmarks = null;
let rightHandLandmarks = null;
let leftGesture = "none";
let rightGesture = "none";
let isDrawing = false;
let drawPoints = [];
let showCamera = true;
let showLandmarks = true;
let deleteMode = false;
let grabbedObject = null;
let selectedObjectType = "cube";
let twoHandMode = false;
let initialPinchDistance = 0;
let spawnedObjects = [];
let colors = ['#00d4ff', '#00ff88', '#ff00ff', '#ffff00', '#ff0066'];
let currentColorIndex = 0;
let fpsCounter = 0;
let lastFpsUpdate = Date.now();

// Audio Context
const AudioContext = window.AudioContext || window.webkitAudioContext;
const audioCtx = new AudioContext();

// ===================================
// INITIALIZATION
// ===================================

async function init() {
    video = document.getElementById('videoElement');
    arCanvas = document.getElementById('arCanvas');
    arCtx = arCanvas.getContext('2d');
    webglContainer = document.getElementById('webglContainer');

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    initThreeJS();
    await initMediaPipe();
    setupUIInteractions();
    animate();

    setTimeout(() => {
        document.getElementById('loadingScreen').classList.add('hidden');
        playSound(800, 0.1, 'sine');
    }, 2000);
}

function resizeCanvas() {
    arCanvas.width = window.innerWidth;
    arCanvas.height = window.innerHeight;
}

// ===================================
// THREE.JS SETUP
// ===================================

function initThreeJS() {
    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(
        75,
        window.innerWidth / window.innerHeight,
        0.1,
        1000
    );
    camera.position.z = 5;

    renderer = new THREE.WebGLRenderer({ 
        alpha: true, 
        antialias: true 
    });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    webglContainer.appendChild(renderer.domElement);

    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const pointLight = new THREE.PointLight(0x00d4ff, 2, 100);
    pointLight.position.set(5, 5, 5);
    scene.add(pointLight);

    const pointLight2 = new THREE.PointLight(0xff0066, 1.5, 100);
    pointLight2.position.set(-5, -5, 5);
    scene.add(pointLight2);

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

// ===================================
// OBJECT CREATION FUNCTIONS
// ===================================

function createHolographicCube(position = { x: 0, y: 0, z: 0 }) {
    const geometry = new THREE.BoxGeometry(1.5, 1.5, 1.5);
    const material = new THREE.ShaderMaterial({
        uniforms: {
            time: { value: 0 },
            color: { value: new THREE.Color(colors[currentColorIndex]) }
        },
        vertexShader: `
            varying vec3 vNormal;
            varying vec3 vPosition;
            void main() {
                vNormal = normalize(normalMatrix * normal);
                vPosition = position;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform float time;
            uniform vec3 color;
            varying vec3 vNormal;
            varying vec3 vPosition;
            void main() {
                float fresnel = pow(1.0 - abs(dot(vNormal, vec3(0.0, 0.0, 1.0))), 2.0);
                float scanline = sin(vPosition.y * 10.0 + time * 2.0) * 0.5 + 0.5;
                float flicker = sin(time * 10.0) * 0.1 + 0.9;
                vec3 finalColor = color * (fresnel + 0.3) * scanline * flicker;
                gl_FragColor = vec4(finalColor, 0.7 + fresnel * 0.3);
            }
        `,
        transparent: true,
        side: THREE.DoubleSide,
        blending: THREE.AdditiveBlending
    });

    const cube = new THREE.Mesh(geometry, material);
    cube.position.set(position.x, position.y, position.z);

    const wireframe = new THREE.EdgesGeometry(geometry);
    const line = new THREE.LineSegments(
        wireframe,
        new THREE.LineBasicMaterial({ 
            color: colors[currentColorIndex], 
            transparent: true, 
            opacity: 0.8 
        })
    );
    cube.add(line);

    cube.userData = { type: 'cube', spawned: true, initialScale: 1.5 };
    scene.add(cube);
    spawnedObjects.push(cube);
    updateObjectCount();
    return cube;
}

function createHolographicSphere(position = { x: 0, y: 0, z: 0 }) {
    const geometry = new THREE.SphereGeometry(0.8, 32, 32);
    const material = new THREE.MeshPhongMaterial({
        color: colors[currentColorIndex],
        transparent: true,
        opacity: 0.6,
        shininess: 100,
        emissive: colors[currentColorIndex],
        emissiveIntensity: 0.3
    });

    const sphere = new THREE.Mesh(geometry, material);
    sphere.position.set(position.x, position.y, position.z);

    const wireframeGeo = new THREE.WireframeGeometry(geometry);
    const wireframe = new THREE.LineSegments(
        wireframeGeo,
        new THREE.LineBasicMaterial({ 
            color: colors[currentColorIndex], 
            transparent: true, 
            opacity: 0.5 
        })
    );
    sphere.add(wireframe);

    sphere.userData = { type: 'sphere', spawned: true, initialScale: 0.8 };
    scene.add(sphere);
    spawnedObjects.push(sphere);
    updateObjectCount();
    return sphere;
}

function createHolographicPyramid(position = { x: 0, y: 0, z: 0 }) {
    const geometry = new THREE.ConeGeometry(1, 2, 4);
    const material = new THREE.MeshPhongMaterial({
        color: colors[currentColorIndex],
        transparent: true,
        opacity: 0.5,
        emissive: colors[currentColorIndex],
        emissiveIntensity: 0.4,
        wireframe: false
    });

    const pyramid = new THREE.Mesh(geometry, material);
    pyramid.position.set(position.x, position.y, position.z);

    const wireframeGeo = new THREE.EdgesGeometry(geometry);
    const wireframe = new THREE.LineSegments(
        wireframeGeo,
        new THREE.LineBasicMaterial({ 
            color: colors[currentColorIndex], 
            transparent: true, 
            opacity: 0.8 
        })
    );
    pyramid.add(wireframe);

    pyramid.userData = { type: 'pyramid', spawned: true, initialScale: 1 };
    scene.add(pyramid);
    spawnedObjects.push(pyramid);
    updateObjectCount();
    return pyramid;
}

function createHolographicTorus(position = { x: 0, y: 0, z: 0 }) {
    const geometry = new THREE.TorusGeometry(0.8, 0.3, 16, 100);
    const material = new THREE.MeshPhongMaterial({
        color: colors[currentColorIndex],
        transparent: true,
        opacity: 0.6,
        emissive: colors[currentColorIndex],
        emissiveIntensity: 0.4
    });

    const torus = new THREE.Mesh(geometry, material);
    torus.position.set(position.x, position.y, position.z);

    const wireframeGeo = new THREE.WireframeGeometry(geometry);
    const wireframe = new THREE.LineSegments(
        wireframeGeo,
        new THREE.LineBasicMaterial({ 
            color: colors[currentColorIndex], 
            transparent: true, 
            opacity: 0.5 
        })
    );
    torus.add(wireframe);

    torus.userData = { type: 'torus', spawned: true, initialScale: 0.8 };
    scene.add(torus);
    spawnedObjects.push(torus);
    updateObjectCount();
    return torus;
}

function spawnSelectedObject(position) {
    switch(selectedObjectType) {
        case 'cube':
            return createHolographicCube(position);
        case 'sphere':
            return createHolographicSphere(position);
        case 'pyramid':
            return createHolographicPyramid(position);
        case 'torus':
            return createHolographicTorus(position);
        default:
            return createHolographicCube(position);
    }
}

function updateObjectCount() {
    document.getElementById('objectCount').textContent = spawnedObjects.length;
}

// ===================================
// MEDIAPIPE HANDS SETUP
// ===================================

async function initMediaPipe() {
    hands = new Hands({
        locateFile: (file) => {
            return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
        }
    });

    hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.7,
        minTrackingConfidence: 0.7
    });

    hands.onResults(onHandsResults);

    try {
        const stream = await navigator.mediaDevices.getUserMedia({
            video: { 
                facingMode: 'user',
                width: { ideal: 1280 },
                height: { ideal: 720 }
            }
        });

        video.srcObject = stream;
        await new Promise((resolve) => {
            video.onloadedmetadata = () => resolve();
        });

        cameraInstance = new Camera(video, {
            onFrame: async () => {
                await hands.send({ image: video });
            },
            width: 1280,
            height: 720
        });

        cameraInstance.start();
        document.getElementById('gestureStatus').textContent = 'AR Active - Two Hands Ready ✓';
        playSound(600, 0.1, 'sine');

    } catch (error) {
        console.error('Camera error:', error);
        document.getElementById('gestureStatus').textContent = 'Camera Error ✗';
    }
}

// ===================================
// HAND TRACKING RESULTS
// ===================================

function onHandsResults(results) {
    leftHandLandmarks = null;
    rightHandLandmarks = null;

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        for (let i = 0; i < results.multiHandLandmarks.length; i++) {
            const handedness = results.multiHandedness[i].label;

            // Note: MediaPipe labels are mirrored for front camera
            if (handedness === 'Left') {
                rightHandLandmarks = results.multiHandLandmarks[i];
            } else {
                leftHandLandmarks = results.multiHandLandmarks[i];
            }
        }

        // Update hand detection display
        let handText = '';
        if (leftHandLandmarks && rightHandLandmarks) {
            handText = 'Both Hands ✓✓';
            twoHandMode = true;
        } else if (leftHandLandmarks) {
            handText = 'Left Hand ✓';
            twoHandMode = false;
        } else if (rightHandLandmarks) {
            handText = 'Right Hand ✓';
            twoHandMode = false;
        }
        document.getElementById('handDetected').textContent = handText;

        // Detect gestures for both hands
        if (leftHandLandmarks) {
            leftGesture = detectGesture(leftHandLandmarks);
        }
        if (rightHandLandmarks) {
            rightGesture = detectGesture(rightHandLandmarks);
        }

        // Process two-hand interactions
        processTwoHandGestures();

    } else {
        leftHandLandmarks = null;
        rightHandLandmarks = null;
        leftGesture = "none";
        rightGesture = "none";
        twoHandMode = false;
        document.getElementById('handDetected').textContent = 'Not Detected';
        isDrawing = false;
        grabbedObject = null;
    }

    drawHandLandmarks(results);
    updateFPS();
}

// ===================================
// GESTURE DETECTION
// ===================================

function detectGesture(landmarks) {
    const thumb = landmarks[4];
    const indexTip = landmarks[8];
    const middleTip = landmarks[12];
    const ringTip = landmarks[16];
    const pinkyTip = landmarks[20];
    const indexBase = landmarks[5];
    const wrist = landmarks[0];

    const thumbIndexDist = distance3D(thumb, indexTip);
    const palmSize = distance3D(wrist, landmarks[9]);

    // Pinch gesture
    if (thumbIndexDist < palmSize * 0.4) {
        return "pinch";
    }
    // Point gesture
    else if (indexTip.y < indexBase.y && 
             middleTip.y > landmarks[9].y &&
             ringTip.y > landmarks[9].y) {
        return "point";
    }
    // Open hand (raised)
    else if (indexTip.y < indexBase.y &&
             middleTip.y < landmarks[9].y &&
             ringTip.y < landmarks[13].y &&
             pinkyTip.y < landmarks[17].y) {
        return "open";
    }
    // Fist
    else if (indexTip.y > landmarks[9].y &&
             middleTip.y > landmarks[9].y &&
             ringTip.y > landmarks[9].y) {
        return "fist";
    }
    else {
        return "none";
    }
}

function distance3D(p1, p2) {
    return Math.sqrt(
        Math.pow(p1.x - p2.x, 2) +
        Math.pow(p1.y - p2.y, 2) +
        Math.pow(p1.z - p2.z, 2)
    );
}

// ===================================
// TWO-HAND GESTURE PROCESSING
// ===================================

function processTwoHandGestures() {
    // Update gesture display
    let gestureText = '';
    if (leftHandLandmarks && rightHandLandmarks) {
        gestureText = `L:${leftGesture.toUpperCase()} | R:${rightGesture.toUpperCase()}`;
    } else if (leftHandLandmarks) {
        gestureText = `LEFT: ${leftGesture.toUpperCase()}`;
    } else if (rightHandLandmarks) {
        gestureText = `RIGHT: ${rightGesture.toUpperCase()}`;
    }
    document.getElementById('currentGesture').textContent = gestureText;

    // TWO-HAND INTERACTION: Raise one hand + Pinch other = Spawn & Resize
    if (twoHandMode && leftHandLandmarks && rightHandLandmarks) {
        const leftOpen = leftGesture === "open";
        const rightOpen = rightGesture === "open";
        const leftPinch = leftGesture === "pinch";
        const rightPinch = rightGesture === "pinch";

        // Scenario 1: Left raised (open), Right pinching
        if (leftOpen && rightPinch) {
            handleRaiseAndPinch(leftHandLandmarks, rightHandLandmarks, 'left-right');
        }
        // Scenario 2: Right raised (open), Left pinching
        else if (rightOpen && leftPinch) {
            handleRaiseAndPinch(rightHandLandmarks, leftHandLandmarks, 'right-left');
        }
        // Both pinching = rotate object
        else if (leftPinch && rightPinch) {
            handleTwoHandRotate(leftHandLandmarks, rightHandLandmarks);
        }
        // Release
        else if (leftOpen && rightOpen) {
            releaseObject();
        }
    }
    // SINGLE HAND INTERACTIONS
    else if (leftHandLandmarks) {
        processSingleHandGesture(leftHandLandmarks, leftGesture);
    } else if (rightHandLandmarks) {
        processSingleHandGesture(rightHandLandmarks, rightGesture);
    }
}

function handleRaiseAndPinch(raisedHand, pinchingHand, direction) {
    const pinchIndex = pinchingHand[8];
    const pinchThumb = pinchingHand[4];

    // Calculate 3D position for pinching hand
    const position = new THREE.Vector3(
        (pinchIndex.x - 0.5) * 10,
        (0.5 - pinchIndex.y) * 10,
        -pinchIndex.z * 5
    );

    // If no object grabbed, spawn new one at pinch location
    if (!grabbedObject) {
        grabbedObject = spawnSelectedObject({
            x: position.x,
            y: position.y,
            z: position.z
        });
        initialPinchDistance = distance3D(pinchIndex, pinchThumb);
        playSound(700, 0.15, 'triangle');
        document.getElementById('currentMode').textContent = 'Spawn & Resize';
    } else {
        // Calculate pinch distance for resizing
        const currentPinchDistance = distance3D(pinchIndex, pinchThumb);
        const scaleFactor = currentPinchDistance / initialPinchDistance;

        // Apply scale to object
        const baseScale = grabbedObject.userData.initialScale || 1;
        const newScale = baseScale * scaleFactor * 2;
        grabbedObject.scale.set(newScale, newScale, newScale);

        // Move object with pinching hand
        grabbedObject.position.lerp(position, 0.2);

        document.getElementById('currentMode').textContent = 
            `Resizing: ${(scaleFactor * 100).toFixed(0)}%`;
    }
}

function handleTwoHandRotate(leftHand, rightHand) {
    if (!grabbedObject) return;

    const leftIndex = leftHand[8];
    const rightIndex = rightHand[8];

    // Calculate rotation based on hand positions
    const angle = Math.atan2(rightIndex.y - leftIndex.y, rightIndex.x - leftIndex.x);
    grabbedObject.rotation.z = angle;

    // Also rotate on other axes slightly
    grabbedObject.rotation.x += 0.02;
    grabbedObject.rotation.y += 0.02;

    document.getElementById('currentMode').textContent = 'Two-Hand Rotate';
}

function processSingleHandGesture(landmarks, gesture) {
    const indexTip = landmarks[8];
    const canvasX = (1 - indexTip.x) * arCanvas.width;
    const canvasY = indexTip.y * arCanvas.height;

    const position = new THREE.Vector3(
        (indexTip.x - 0.5) * 10,
        (0.5 - indexTip.y) * 10,
        -indexTip.z * 5
    );

    switch (gesture) {
        case "point":
            if (deleteMode) {
                deleteObjectAtPoint(position);
                document.getElementById('currentMode').textContent = 'Delete';
            } else {
                drawAirTrail(canvasX, canvasY);
                document.getElementById('currentMode').textContent = 'Draw';
            }
            break;

        case "pinch":
            grabAndManipulateObject(position);
            document.getElementById('currentMode').textContent = 'Grab';
            break;

        case "open":
            if (grabbedObject) {
                releaseObject();
            }
            document.getElementById('currentMode').textContent = 'Ready';
            break;

        case "fist":
            document.getElementById('currentMode').textContent = 'Locked';
            break;
    }
}

// ===================================
// DRAW HAND LANDMARKS
// ===================================

function drawHandLandmarks(results) {
    arCtx.save();
    arCtx.clearRect(0, 0, arCanvas.width, arCanvas.height);

    if (showLandmarks && results.multiHandLandmarks) {
        for (let i = 0; i < results.multiHandLandmarks.length; i++) {
            const landmarks = results.multiHandLandmarks[i];
            const handedness = results.multiHandedness[i].label;

            // Use different colors for left and right hands
            const handColor = handedness === 'Left' ? '#00d4ff' : '#00ff88';

            drawConnectors(arCtx, landmarks, HAND_CONNECTIONS, {
                color: handColor,
                lineWidth: 3
            });

            drawLandmarks(arCtx, landmarks, {
                color: handColor,
                fillColor: handColor,
                lineWidth: 2,
                radius: 5
            });
        }
    }

    arCtx.restore();
}

function drawConnectors(ctx, landmarks, connections, style) {
    ctx.strokeStyle = style.color;
    ctx.lineWidth = style.lineWidth;
    ctx.shadowBlur = 10;
    ctx.shadowColor = style.color;

    for (const connection of connections) {
        const from = landmarks[connection[0]];
        const to = landmarks[connection[1]];

        const fromX = (1 - from.x) * arCanvas.width;
        const fromY = from.y * arCanvas.height;
        const toX = (1 - to.x) * arCanvas.width;
        const toY = to.y * arCanvas.height;

        ctx.beginPath();
        ctx.moveTo(fromX, fromY);
        ctx.lineTo(toX, toY);
        ctx.stroke();
    }

    ctx.shadowBlur = 0;
}

function drawLandmarks(ctx, landmarks, style) {
    ctx.fillStyle = style.fillColor;
    ctx.strokeStyle = style.color;
    ctx.lineWidth = style.lineWidth;

    for (const landmark of landmarks) {
        const x = (1 - landmark.x) * arCanvas.width;
        const y = landmark.y * arCanvas.height;

        ctx.beginPath();
        ctx.arc(x, y, style.radius, 0, 2 * Math.PI);
        ctx.fill();
        ctx.stroke();
    }
}

const HAND_CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [5, 9], [9, 10], [10, 11], [11, 12],
    [9, 13], [13, 14], [14, 15], [15, 16],
    [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]
];

// ===================================
// DRAWING FUNCTIONS
// ===================================

function drawAirTrail(x, y) {
    if (!isDrawing) {
        drawPoints = [];
        isDrawing = true;
        playSound(400, 0.05, 'sine');
    }

    drawPoints.push({ x, y, time: Date.now() });

    if (drawPoints.length > 150) {
        drawPoints.shift();
    }
}

function renderDrawing() {
    if (drawPoints.length < 2) return;

    arCtx.beginPath();
    arCtx.moveTo(drawPoints[0].x, drawPoints[0].y);

    for (let i = 1; i < drawPoints.length; i++) {
        const point = drawPoints[i];
        const age = Date.now() - point.time;
        const opacity = Math.max(0, 1 - age / 8000);

        arCtx.strokeStyle = colors[currentColorIndex];
        arCtx.globalAlpha = opacity;
        arCtx.lineWidth = 6;
        arCtx.shadowBlur = 20;
        arCtx.shadowColor = colors[currentColorIndex];
        arCtx.lineTo(point.x, point.y);
    }

    arCtx.stroke();
    arCtx.shadowBlur = 0;
    arCtx.globalAlpha = 1;

    drawPoints = drawPoints.filter(p => Date.now() - p.time < 8000);
}

// ===================================
// OBJECT MANIPULATION
// ===================================

function grabAndManipulateObject(position) {
    if (!grabbedObject && spawnedObjects.length > 0) {
        let closest = null;
        let minDist = Infinity;

        for (const obj of spawnedObjects) {
            const dist = obj.position.distanceTo(
                new THREE.Vector3(position.x, position.y, position.z)
            );
            if (dist < minDist && dist < 3) {
                minDist = dist;
                closest = obj;
            }
        }

        if (closest) {
            grabbedObject = closest;
            playSound(500, 0.1, 'square');
        }
    }

    if (grabbedObject) {
        grabbedObject.position.lerp(
            new THREE.Vector3(position.x, position.y, position.z),
            0.2
        );
        grabbedObject.rotation.x += 0.05;
        grabbedObject.rotation.y += 0.05;
    }
}

function releaseObject() {
    if (grabbedObject) {
        playSound(450, 0.1, 'sine');
        grabbedObject = null;
        initialPinchDistance = 0;
        document.getElementById('currentMode').textContent = 'Released';
    }
}

function deleteObjectAtPoint(position) {
    for (let i = spawnedObjects.length - 1; i >= 0; i--) {
        const obj = spawnedObjects[i];
        const dist = obj.position.distanceTo(
            new THREE.Vector3(position.x, position.y, position.z)
        );

        if (dist < 2) {
            scene.remove(obj);
            spawnedObjects.splice(i, 1);
            playSound(300, 0.15, 'sawtooth');
            createParticleExplosion(obj.position);
            updateObjectCount();
            break;
        }
    }
}

function createParticleExplosion(position) {
    for (let i = 0; i < 20; i++) {
        const particle = document.createElement('div');
        particle.className = 'particle';

        const screenPos = toScreenPosition(position);
        particle.style.left = screenPos.x + 'px';
        particle.style.top = screenPos.y + 'px';
        particle.style.background = colors[currentColorIndex];

        const tx = (Math.random() - 0.5) * 200;
        const ty = (Math.random() - 0.5) * 200;
        particle.style.setProperty('--tx', tx + 'px');
        particle.style.setProperty('--ty', ty + 'px');

        document.body.appendChild(particle);
        setTimeout(() => particle.remove(), 1000);
    }
}

function toScreenPosition(position) {
    const vector = position.clone();
    vector.project(camera);

    return {
        x: (vector.x * 0.5 + 0.5) * arCanvas.width,
        y: (vector.y * -0.5 + 0.5) * arCanvas.height
    };
}

// ===================================
// UI INTERACTIONS
// ===================================

function setupUIInteractions() {
    document.querySelectorAll('.menu-item').forEach(item => {
        item.addEventListener('click', () => {
            handleMenuAction(item.dataset.action);
            playSound(700, 0.1, 'sine');
        });
    });
}

function handleMenuAction(action) {
    switch (action) {
        case 'clear':
            drawPoints = [];
            playSound(300, 0.1, 'sawtooth');
            break;

        case 'toggle-camera':
            showCamera = !showCamera;
            video.style.opacity = showCamera ? '1' : '0';
            break;

        case 'toggle-landmarks':
            showLandmarks = !showLandmarks;
            break;

        case 'select-cube':
            selectedObjectType = 'cube';
            updateShapeSelection();
            playSound(600, 0.1, 'sine');
            break;

        case 'select-sphere':
            selectedObjectType = 'sphere';
            updateShapeSelection();
            playSound(650, 0.1, 'sine');
            break;

        case 'select-pyramid':
            selectedObjectType = 'pyramid';
            updateShapeSelection();
            playSound(700, 0.1, 'sine');
            break;

        case 'select-torus':
            selectedObjectType = 'torus';
            updateShapeSelection();
            playSound(750, 0.1, 'sine');
            break;

        case 'delete-mode':
            deleteMode = !deleteMode;
            const btn = document.querySelector('[data-action="delete-mode"]');
            const text = document.getElementById('deleteModeText');

            if (deleteMode) {
                btn.classList.add('active');
                text.textContent = 'Delete Mode: ON';
            } else {
                btn.classList.remove('active');
                text.textContent = 'Delete Mode: OFF';
            }
            playSound(deleteMode ? 800 : 400, 0.1, 'square');
            break;

        case 'change-color':
            currentColorIndex = (currentColorIndex + 1) % colors.length;
            playSound(900, 0.1, 'sine');
            break;

        case 'clear-all':
            for (const obj of spawnedObjects) {
                scene.remove(obj);
            }
            spawnedObjects = [];
            updateObjectCount();
            playSound(200, 0.2, 'sawtooth');
            break;
    }
}

function updateShapeSelection() {
    document.querySelectorAll('[data-action^="select-"]').forEach(btn => {
        btn.classList.remove('active');
    });
    const selector = `[data-action="select-${selectedObjectType}"]`;
    const selectedBtn = document.querySelector(selector);
    if (selectedBtn) {
        selectedBtn.classList.add('active');
    }
    document.getElementById('selectedShape').textContent = 
        selectedObjectType.charAt(0).toUpperCase() + selectedObjectType.slice(1);
}

// ===================================
// SOUND EFFECTS
// ===================================

function playSound(frequency, duration, type = 'sine') {
    try {
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        oscillator.frequency.value = frequency;
        oscillator.type = type;

        gainNode.gain.setValueAtTime(0.08, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(
            0.01, 
            audioCtx.currentTime + duration
        );

        oscillator.start(audioCtx.currentTime);
        oscillator.stop(audioCtx.currentTime + duration);
    } catch (e) {
        console.log('Audio context not ready');
    }
}

// ===================================
// FPS COUNTER
// ===================================

function updateFPS() {
    fpsCounter++;
    const now = Date.now();

    if (now - lastFpsUpdate >= 1000) {
        document.getElementById('fpsCounter').textContent = `FPS: ${fpsCounter}`;
        fpsCounter = 0;
        lastFpsUpdate = now;
    }
}

// ===================================
// ANIMATION LOOP
// ===================================

function animate() {
    requestAnimationFrame(animate);

    renderDrawing();

    for (const obj of spawnedObjects) {
        if (obj !== grabbedObject) {
            obj.rotation.x += 0.003;
            obj.rotation.y += 0.003;
        }

        if (obj.userData.type === 'cube' && obj.material.uniforms) {
            obj.material.uniforms.time.value += 0.05;
        }
    }

    renderer.render(scene, camera);
}

// ===================================
// START APPLICATION
// ===================================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
