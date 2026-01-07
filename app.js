// ===================================
// IRON MAN AR - FIXED & MOBILE READY
// ===================================

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
let cloneMode = false;
let freezeMode = false;
let snapToGrid = false;
let grabbedObject = null;
let selectedObjectType = "cube";
let twoHandMode = false;
let initialPinchDistance = 0;
let initialHandDistance = 0;
let spawnedObjects = [];
let particleSystem = [];
let colors = ['#00d4ff', '#00ff88', '#ff00ff', '#ffff00', '#ff0066', '#00ffff', '#ff6600'];
let currentColorIndex = 0;
let fpsCounter = 0;
let lastFpsUpdate = Date.now();
let gestureHoldTime = 0;
let lastGesture = "none";
let drawingBrushSize = 6;
let objectOpacity = 0.8;
let rotationSpeed = 0.003;
let autoRotate = true;
let showParticles = true;
let gridSize = 1;
let holdThreshold = 1000;
let cloneExecuted = false;
let duplicateExecuted = false;
let rainbowExecuted = false;
let freezeExecuted = false;

// Audio
const AudioContext = window.AudioContext || window.webkitAudioContext;
let audioCtx;

// ===================================
// INITIALIZATION
// ===================================

async function init() {
    console.log('Initializing AR System...');

    video = document.getElementById('videoElement');
    arCanvas = document.getElementById('arCanvas');
    arCtx = arCanvas.getContext('2d');
    webglContainer = document.getElementById('webglContainer');

    // Initialize audio
    try {
        audioCtx = new AudioContext();
    } catch(e) {
        console.log('Audio not available');
    }

    resizeCanvas();
    window.addEventListener('resize', resizeCanvas);

    initThreeJS();
    await initMediaPipe();
    setupUIInteractions();
    setupKeyboardShortcuts();
    animate();

    setTimeout(() => {
        const loader = document.getElementById('loadingScreen');
        if (loader) {
            loader.classList.add('hidden');
        }
        playSound(800, 0.1, 'sine');
        showWelcomeHint();
    }, 2000);

    console.log('AR System Ready!');
}

function resizeCanvas() {
    arCanvas.width = window.innerWidth;
    arCanvas.height = window.innerHeight;
}

function showWelcomeHint() {
    const hint = document.createElement('div');
    hint.className = 'welcome-hint';
    hint.innerHTML = '🎉 AR Ready! Use gestures to create objects!';
    document.body.appendChild(hint);
    setTimeout(() => hint.remove(), 4000);
}

// ===================================
// THREE.JS SETUP
// ===================================

function initThreeJS() {
    scene = new THREE.Scene();

    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.z = 5;

    renderer = new THREE.WebGLRenderer({ alpha: true, antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
    webglContainer.appendChild(renderer.domElement);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.6);
    scene.add(ambientLight);

    const pointLight1 = new THREE.PointLight(0x00d4ff, 2, 100);
    pointLight1.position.set(5, 5, 5);
    scene.add(pointLight1);

    const pointLight2 = new THREE.PointLight(0xff0066, 1.5, 100);
    pointLight2.position.set(-5, -5, 5);
    scene.add(pointLight2);

    createParticleField();

    window.addEventListener('resize', () => {
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    });
}

function createParticleField() {
    const particleCount = 150;
    const geometry = new THREE.BufferGeometry();
    const positions = new Float32Array(particleCount * 3);

    for (let i = 0; i < particleCount * 3; i += 3) {
        positions[i] = (Math.random() - 0.5) * 40;
        positions[i + 1] = (Math.random() - 0.5) * 40;
        positions[i + 2] = (Math.random() - 0.5) * 40;
    }

    geometry.setAttribute('position', new THREE.BufferAttribute(positions, 3));

    const material = new THREE.PointsMaterial({
        size: 0.08,
        color: 0x00d4ff,
        transparent: true,
        opacity: 0.5,
        blending: THREE.AdditiveBlending
    });

    const particles = new THREE.Points(geometry, material);
    particles.userData = { isParticleField: true };
    scene.add(particles);
}

// ===================================
// OBJECT CREATION
// ===================================

function createHolographicCube(position = { x: 0, y: 0, z: 0 }, customColor = null) {
    const geometry = new THREE.BoxGeometry(1.5, 1.5, 1.5);
    const color = customColor || colors[currentColorIndex];

    const material = new THREE.MeshPhongMaterial({
        color: color,
        transparent: true,
        opacity: 0.6,
        emissive: color,
        emissiveIntensity: 0.4,
        shininess: 100
    });

    const cube = new THREE.Mesh(geometry, material);
    cube.position.set(position.x, position.y, position.z);

    const edges = new THREE.EdgesGeometry(geometry);
    const line = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: 0.8 })
    );
    cube.add(line);

    cube.userData = { 
        type: 'cube', 
        initialScale: 1.5,
        baseColor: color,
        frozen: false
    };

    scene.add(cube);
    spawnedObjects.push(cube);
    updateObjectCount();
    animateSpawn(cube);

    return cube;
}

function createHolographicSphere(position = { x: 0, y: 0, z: 0 }, customColor = null) {
    const geometry = new THREE.SphereGeometry(0.8, 32, 32);
    const color = customColor || colors[currentColorIndex];

    const material = new THREE.MeshPhongMaterial({
        color: color,
        transparent: true,
        opacity: 0.6,
        shininess: 100,
        emissive: color,
        emissiveIntensity: 0.4
    });

    const sphere = new THREE.Mesh(geometry, material);
    sphere.position.set(position.x, position.y, position.z);

    const wireframe = new THREE.WireframeGeometry(geometry);
    const line = new THREE.LineSegments(
        wireframe,
        new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: 0.5 })
    );
    sphere.add(line);

    sphere.userData = { 
        type: 'sphere', 
        initialScale: 0.8,
        baseColor: color,
        frozen: false
    };

    scene.add(sphere);
    spawnedObjects.push(sphere);
    updateObjectCount();
    animateSpawn(sphere);

    return sphere;
}

function createHolographicPyramid(position = { x: 0, y: 0, z: 0 }, customColor = null) {
    const geometry = new THREE.ConeGeometry(1, 2, 4);
    const color = customColor || colors[currentColorIndex];

    const material = new THREE.MeshPhongMaterial({
        color: color,
        transparent: true,
        opacity: 0.5,
        emissive: color,
        emissiveIntensity: 0.5
    });

    const pyramid = new THREE.Mesh(geometry, material);
    pyramid.position.set(position.x, position.y, position.z);

    const edges = new THREE.EdgesGeometry(geometry);
    const line = new THREE.LineSegments(
        edges,
        new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: 0.8 })
    );
    pyramid.add(line);

    pyramid.userData = { 
        type: 'pyramid', 
        initialScale: 1,
        baseColor: color,
        frozen: false
    };

    scene.add(pyramid);
    spawnedObjects.push(pyramid);
    updateObjectCount();
    animateSpawn(pyramid);

    return pyramid;
}

function createHolographicTorus(position = { x: 0, y: 0, z: 0 }, customColor = null) {
    const geometry = new THREE.TorusGeometry(0.8, 0.3, 16, 100);
    const color = customColor || colors[currentColorIndex];

    const material = new THREE.MeshPhongMaterial({
        color: color,
        transparent: true,
        opacity: 0.6,
        emissive: color,
        emissiveIntensity: 0.5
    });

    const torus = new THREE.Mesh(geometry, material);
    torus.position.set(position.x, position.y, position.z);

    const wireframe = new THREE.WireframeGeometry(geometry);
    const line = new THREE.LineSegments(
        wireframe,
        new THREE.LineBasicMaterial({ color: color, transparent: true, opacity: 0.5 })
    );
    torus.add(line);

    torus.userData = { 
        type: 'torus', 
        initialScale: 0.8,
        baseColor: color,
        frozen: false
    };

    scene.add(torus);
    spawnedObjects.push(torus);
    updateObjectCount();
    animateSpawn(torus);

    return torus;
}

function animateSpawn(object) {
    const targetScale = object.userData.initialScale;
    const duration = 400;
    const startTime = Date.now();

    function animate() {
        const elapsed = Date.now() - startTime;
        const progress = Math.min(elapsed / duration, 1);
        const eased = 1 - Math.pow(1 - progress, 3);

        const scale = eased * targetScale;
        object.scale.set(scale, scale, scale);

        if (progress < 1) {
            requestAnimationFrame(animate);
        }
    }
    animate();
}

function spawnSelectedObject(position, customColor = null) {
    switch(selectedObjectType) {
        case 'cube':
            return createHolographicCube(position, customColor);
        case 'sphere':
            return createHolographicSphere(position, customColor);
        case 'pyramid':
            return createHolographicPyramid(position, customColor);
        case 'torus':
            return createHolographicTorus(position, customColor);
        default:
            return createHolographicCube(position, customColor);
    }
}

function updateObjectCount() {
    const counter = document.getElementById('objectCount');
    if (counter) {
        counter.textContent = spawnedObjects.length;
    }
}

// ===================================
// MEDIAPIPE HANDS
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

        const status = document.getElementById('gestureStatus');
        if (status) {
            status.textContent = 'AR Active ⚡';
        }
        playSound(600, 0.1, 'sine');

    } catch (error) {
        console.error('Camera error:', error);
        const status = document.getElementById('gestureStatus');
        if (status) {
            status.textContent = 'Camera Error ✗';
        }
    }
}

// ===================================
// HAND TRACKING
// ===================================

function onHandsResults(results) {
    leftHandLandmarks = null;
    rightHandLandmarks = null;

    if (results.multiHandLandmarks && results.multiHandLandmarks.length > 0) {
        for (let i = 0; i < results.multiHandLandmarks.length; i++) {
            const handedness = results.multiHandedness[i].label;

            if (handedness === 'Left') {
                rightHandLandmarks = results.multiHandLandmarks[i];
            } else {
                leftHandLandmarks = results.multiHandLandmarks[i];
            }
        }

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

        const handDetected = document.getElementById('handDetected');
        if (handDetected) {
            handDetected.textContent = handText;
        }

        if (leftHandLandmarks) {
            leftGesture = detectGesture(leftHandLandmarks);
        }
        if (rightHandLandmarks) {
            rightGesture = detectGesture(rightHandLandmarks);
        }

        processGestures();

    } else {
        leftHandLandmarks = null;
        rightHandLandmarks = null;
        leftGesture = "none";
        rightGesture = "none";
        twoHandMode = false;

        const handDetected = document.getElementById('handDetected');
        if (handDetected) {
            handDetected.textContent = 'Not Detected';
        }

        isDrawing = false;
        gestureHoldTime = 0;
        cloneExecuted = false;
        duplicateExecuted = false;
        rainbowExecuted = false;
        freezeExecuted = false;
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

    // Pinch
    if (thumbIndexDist < palmSize * 0.4) {
        return "pinch";
    }
    // Peace
    else if (indexTip.y < indexBase.y && 
             middleTip.y < landmarks[9].y &&
             ringTip.y > landmarks[13].y) {
        return "peace";
    }
    // Point
    else if (indexTip.y < indexBase.y && 
             middleTip.y > landmarks[9].y &&
             ringTip.y > landmarks[9].y) {
        return "point";
    }
    // Open hand
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
    // Thumbs up
    else if (thumb.y < wrist.y && 
             indexTip.y > landmarks[9].y &&
             middleTip.y > landmarks[9].y) {
        return "thumbsup";
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
// GESTURE PROCESSING
// ===================================

function processGestures() {
    let gestureText = '';
    if (leftHandLandmarks && rightHandLandmarks) {
        gestureText = `L:${leftGesture.toUpperCase()} | R:${rightGesture.toUpperCase()}`;
    } else if (leftHandLandmarks) {
        gestureText = `LEFT: ${leftGesture.toUpperCase()}`;
    } else if (rightHandLandmarks) {
        gestureText = `RIGHT: ${rightGesture.toUpperCase()}`;
    }

    const gestureEl = document.getElementById('currentGesture');
    if (gestureEl) {
        gestureEl.textContent = gestureText;
    }

    if (leftGesture === lastGesture || rightGesture === lastGesture) {
        gestureHoldTime += 16;
    } else {
        gestureHoldTime = 0;
        lastGesture = leftGesture !== "none" ? leftGesture : rightGesture;
        cloneExecuted = false;
    }

    // TWO HAND GESTURES
    if (twoHandMode && leftHandLandmarks && rightHandLandmarks) {
        const leftFist = leftGesture === "fist";
        const rightFist = rightGesture === "fist";
        const leftPeace = leftGesture === "peace";
        const rightPeace = rightGesture === "peace";
        const leftThumb = leftGesture === "thumbsup";
        const rightThumb = rightGesture === "thumbsup";
        const leftOpen = leftGesture === "open";
        const rightOpen = rightGesture === "open";
        const leftPinch = leftGesture === "pinch";
        const rightPinch = rightGesture === "pinch";

        // Both fists = freeze
        if (leftFist && rightFist && !freezeExecuted) {
            toggleFreezeAll();
            freezeExecuted = true;
        } else if (!leftFist || !rightFist) {
            freezeExecuted = false;
        }

        // Both peace = rainbow
        if (leftPeace && rightPeace && !rainbowExecuted) {
            activateRainbowMode();
            rainbowExecuted = true;
        } else if (!leftPeace || !rightPeace) {
            rainbowExecuted = false;
        }

        // Both thumbs = duplicate
        if (leftThumb && rightThumb && !duplicateExecuted) {
            duplicateNearest();
            duplicateExecuted = true;
        } else if (!leftThumb || !rightThumb) {
            duplicateExecuted = false;
        }

        // Open + Pinch = spawn and resize
        if ((leftOpen && rightPinch) || (rightOpen && leftPinch)) {
            const raisedHand = leftOpen ? leftHandLandmarks : rightHandLandmarks;
            const pinchingHand = leftOpen ? rightHandLandmarks : leftHandLandmarks;
            handleRaiseAndPinch(raisedHand, pinchingHand);
        }
        // Two pinch = manipulate
        else if (leftPinch && rightPinch) {
            handleTwoHandManipulation(leftHandLandmarks, rightHandLandmarks);
        }
        // Release
        else if (leftOpen && rightOpen) {
            releaseObject();
        }
    }
    // SINGLE HAND GESTURES
    else if (leftHandLandmarks) {
        processSingleHand(leftHandLandmarks, leftGesture);
    } else if (rightHandLandmarks) {
        processSingleHand(rightHandLandmarks, rightGesture);
    }
}

function handleRaiseAndPinch(raisedHand, pinchingHand) {
    const pinchIndex = pinchingHand[8];
    const pinchThumb = pinchingHand[4];

    const position = new THREE.Vector3(
        (pinchIndex.x - 0.5) * 10,
        (0.5 - pinchIndex.y) * 10,
        -pinchIndex.z * 5
    );

    if (snapToGrid) {
        position.x = Math.round(position.x / gridSize) * gridSize;
        position.y = Math.round(position.y / gridSize) * gridSize;
        position.z = Math.round(position.z / gridSize) * gridSize;
    }

    // Hold to clone
    if (gestureHoldTime > holdThreshold && !cloneExecuted && spawnedObjects.length > 0) {
        const nearest = findNearestObject(position);
        if (nearest) {
            cloneObject(nearest);
            playSound(900, 0.2, 'triangle');
            showNotification('Cloned! 🔄');
            cloneExecuted = true;
        }
    }

    if (!grabbedObject) {
        grabbedObject = spawnSelectedObject({
            x: position.x,
            y: position.y,
            z: position.z
        });
        initialPinchDistance = distance3D(pinchIndex, pinchThumb);
        playSound(700, 0.15, 'triangle');
        updateMode('Spawn & Resize');
    } else {
        const currentPinchDistance = distance3D(pinchIndex, pinchThumb);
        const scaleFactor = currentPinchDistance / initialPinchDistance;

        const baseScale = grabbedObject.userData.initialScale || 1;
        const newScale = Math.max(0.1, Math.min(5, baseScale * scaleFactor * 2));
        grabbedObject.scale.set(newScale, newScale, newScale);

        grabbedObject.position.lerp(position, 0.3);

        updateMode(`Scale: ${newScale.toFixed(2)}`);
    }
}

function handleTwoHandManipulation(leftHand, rightHand) {
    if (!grabbedObject) {
        const leftIndex = leftHand[8];
        const position = new THREE.Vector3(
            (leftIndex.x - 0.5) * 10,
            (0.5 - leftIndex.y) * 10,
            -leftIndex.z * 5
        );
        grabbedObject = findNearestObject(position);
        if (grabbedObject) {
            initialHandDistance = distance3D(leftHand[8], rightHand[8]);
            playSound(550, 0.1, 'square');
        }
        return;
    }

    const leftIndex = leftHand[8];
    const rightIndex = rightHand[8];

    const currentHandDistance = distance3D(leftIndex, rightIndex);
    const scaleFactor = currentHandDistance / initialHandDistance;
    const baseScale = grabbedObject.userData.initialScale || 1;
    const newScale = Math.max(0.1, Math.min(5, baseScale * scaleFactor));
    grabbedObject.scale.set(newScale, newScale, newScale);

    const angle = Math.atan2(rightIndex.y - leftIndex.y, rightIndex.x - leftIndex.x);
    grabbedObject.rotation.z = angle;

    const midX = (leftIndex.x + rightIndex.x) / 2;
    const midY = (leftIndex.y + rightIndex.y) / 2;
    const midZ = (leftIndex.z + rightIndex.z) / 2;

    const midPosition = new THREE.Vector3(
        (midX - 0.5) * 10,
        (0.5 - midY) * 10,
        -midZ * 5
    );

    grabbedObject.position.lerp(midPosition, 0.3);

    updateMode(`Two-Hand: ${newScale.toFixed(2)}`);
}

function processSingleHand(landmarks, gesture) {
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
                updateMode('Delete Mode 🗑️');
            } else {
                drawTrail(canvasX, canvasY);
                updateMode(`Draw (${drawingBrushSize}px)`);
            }
            break;

        case "pinch":
            grabObject(position);
            break;

        case "peace":
            if (gestureHoldTime > 500 && !cloneExecuted) {
                drawingBrushSize = ((drawingBrushSize + 2) % 20) + 2;
                showNotification(`Brush: ${drawingBrushSize}px`);
                cloneExecuted = true;
            }
            updateMode(`Brush: ${drawingBrushSize}px`);
            break;

        case "thumbsup":
            if (gestureHoldTime > 500 && !cloneExecuted) {
                quickSpawn(position);
                cloneExecuted = true;
            }
            updateMode('Quick Spawn 👍');
            break;

        case "fist":
            if (!grabbedObject) {
                grabbedObject = findNearestObject(position);
                if (grabbedObject) {
                    grabbedObject.userData.frozen = true;
                    playSound(400, 0.15, 'square');
                }
            }
            updateMode('Lock 🔒');
            break;

        case "open":
            if (grabbedObject) {
                releaseObject();
            }
            updateMode('Ready ✋');
            break;
    }
}

// ===================================
// FEATURES
// ===================================

function cloneObject(original) {
    const offset = 1.5;
    const newPos = {
        x: original.position.x + offset,
        y: original.position.y,
        z: original.position.z
    };

    const clone = spawnSelectedObject(newPos, original.userData.baseColor);
    clone.scale.copy(original.scale);
    clone.rotation.copy(original.rotation);
}

function duplicateNearest() {
    if (spawnedObjects.length === 0) return;

    const nearest = spawnedObjects[spawnedObjects.length - 1];
    cloneObject(nearest);
    playSound(850, 0.2, 'sine');
    showNotification('Duplicated! 👍');
}

function quickSpawn(position) {
    spawnSelectedObject({
        x: position.x,
        y: position.y,
        z: position.z
    });
    playSound(700, 0.1, 'triangle');
}

function findNearestObject(position) {
    let nearest = null;
    let minDist = Infinity;

    for (const obj of spawnedObjects) {
        const dist = obj.position.distanceTo(position);
        if (dist < minDist) {
            minDist = dist;
            nearest = obj;
        }
    }

    return minDist < 5 ? nearest : null;
}

function toggleFreezeAll() {
    freezeMode = !freezeMode;
    for (const obj of spawnedObjects) {
        obj.userData.frozen = freezeMode;
    }
    playSound(freezeMode ? 200 : 600, 0.2, 'square');
    showNotification(freezeMode ? 'Frozen 🧊' : 'Unfrozen 🔥');
}

function activateRainbowMode() {
    for (const obj of spawnedObjects) {
        const randomColor = colors[Math.floor(Math.random() * colors.length)];
        obj.userData.baseColor = randomColor;

        if (obj.material) {
            obj.material.color.set(randomColor);
            if (obj.material.emissive) {
                obj.material.emissive.set(randomColor);
            }
        }

        if (obj.children.length > 0 && obj.children[0].material) {
            obj.children[0].material.color.set(randomColor);
        }
    }
    playSound(1000, 0.3, 'sine');
    showNotification('Rainbow! 🌈');
}

function showNotification(message) {
    const notification = document.createElement('div');
    notification.className = 'notification-popup';
    notification.textContent = message;
    document.body.appendChild(notification);
    setTimeout(() => notification.remove(), 2000);
}

function updateMode(text) {
    const modeEl = document.getElementById('currentMode');
    if (modeEl) {
        modeEl.textContent = text;
    }
}

// ===================================
// DRAWING
// ===================================

function drawTrail(x, y) {
    if (!isDrawing) {
        drawPoints = [];
        isDrawing = true;
        playSound(400, 0.05, 'sine');
    }

    drawPoints.push({ 
        x, 
        y, 
        time: Date.now(),
        size: drawingBrushSize,
        color: colors[currentColorIndex]
    });

    if (drawPoints.length > 200) {
        drawPoints.shift();
    }
}

function renderDrawing() {
    if (drawPoints.length < 2) return;

    for (let i = 1; i < drawPoints.length; i++) {
        const point = drawPoints[i];
        const prevPoint = drawPoints[i - 1];
        const age = Date.now() - point.time;
        const opacity = Math.max(0, 1 - age / 8000);

        arCtx.beginPath();
        arCtx.moveTo(prevPoint.x, prevPoint.y);
        arCtx.lineTo(point.x, point.y);

        arCtx.strokeStyle = point.color;
        arCtx.globalAlpha = opacity;
        arCtx.lineWidth = point.size;
        arCtx.lineCap = 'round';
        arCtx.shadowBlur = 20;
        arCtx.shadowColor = point.color;
        arCtx.stroke();
    }

    arCtx.shadowBlur = 0;
    arCtx.globalAlpha = 1;

    drawPoints = drawPoints.filter(p => Date.now() - p.time < 8000);
}

// ===================================
// HAND DRAWING
// ===================================

const HAND_CONNECTIONS = [
    [0, 1], [1, 2], [2, 3], [3, 4],
    [0, 5], [5, 6], [6, 7], [7, 8],
    [5, 9], [9, 10], [10, 11], [11, 12],
    [9, 13], [13, 14], [14, 15], [15, 16],
    [13, 17], [0, 17], [17, 18], [18, 19], [19, 20]
];

function drawHandLandmarks(results) {
    arCtx.save();
    arCtx.clearRect(0, 0, arCanvas.width, arCanvas.height);

    if (showLandmarks && results.multiHandLandmarks) {
        for (let i = 0; i < results.multiHandLandmarks.length; i++) {
            const landmarks = results.multiHandLandmarks[i];
            const handedness = results.multiHandedness[i].label;

            const handColor = handedness === 'Left' ? '#00d4ff' : '#00ff88';

            // Draw connections
            arCtx.strokeStyle = handColor;
            arCtx.lineWidth = 3;
            arCtx.shadowBlur = 10;
            arCtx.shadowColor = handColor;

            for (const connection of HAND_CONNECTIONS) {
                const from = landmarks[connection[0]];
                const to = landmarks[connection[1]];

                const fromX = (1 - from.x) * arCanvas.width;
                const fromY = from.y * arCanvas.height;
                const toX = (1 - to.x) * arCanvas.width;
                const toY = to.y * arCanvas.height;

                arCtx.beginPath();
                arCtx.moveTo(fromX, fromY);
                arCtx.lineTo(toX, toY);
                arCtx.stroke();
            }

            // Draw landmarks
            arCtx.fillStyle = handColor;
            for (const landmark of landmarks) {
                const x = (1 - landmark.x) * arCanvas.width;
                const y = landmark.y * arCanvas.height;

                arCtx.beginPath();
                arCtx.arc(x, y, 5, 0, 2 * Math.PI);
                arCtx.fill();
            }
        }
    }

    arCtx.shadowBlur = 0;
    arCtx.restore();
}

// ===================================
// OBJECT MANIPULATION
// ===================================

function grabObject(position) {
    if (!grabbedObject && spawnedObjects.length > 0) {
        grabbedObject = findNearestObject(position);
        if (grabbedObject) {
            playSound(500, 0.1, 'square');
            initialPinchDistance = 1;
        }
    }

    if (grabbedObject && !grabbedObject.userData.frozen) {
        grabbedObject.position.lerp(position, 0.3);
        grabbedObject.rotation.x += 0.03;
        grabbedObject.rotation.y += 0.03;
    }
}

function releaseObject() {
    if (grabbedObject) {
        playSound(450, 0.1, 'sine');
        grabbedObject = null;
        initialPinchDistance = 0;
        initialHandDistance = 0;
        updateMode('Released ✓');
    }
}

function deleteObjectAtPoint(position) {
    const nearest = findNearestObject(position);
    if (nearest) {
        const index = spawnedObjects.indexOf(nearest);
        if (index > -1) {
            scene.remove(nearest);
            spawnedObjects.splice(index, 1);
            playSound(300, 0.15, 'sawtooth');
            updateObjectCount();
        }
    }
}

// ===================================
// KEYBOARD
// ===================================

function setupKeyboardShortcuts() {
    document.addEventListener('keydown', (e) => {
        switch(e.key.toLowerCase()) {
            case 'c':
                drawPoints = [];
                showNotification('Drawing Cleared');
                break;
            case 'd':
                deleteMode = !deleteMode;
                showNotification(`Delete: ${deleteMode ? 'ON' : 'OFF'}`);
                break;
            case 'g':
                snapToGrid = !snapToGrid;
                showNotification(`Grid: ${snapToGrid ? 'ON' : 'OFF'}`);
                break;
            case 'r':
                autoRotate = !autoRotate;
                showNotification(`Rotate: ${autoRotate ? 'ON' : 'OFF'}`);
                break;
            case 'z':
                if (spawnedObjects.length > 0) {
                    const last = spawnedObjects.pop();
                    scene.remove(last);
                    updateObjectCount();
                    showNotification('Undo');
                }
                break;
            case '1':
                selectedObjectType = 'cube';
                updateShapeSelection();
                break;
            case '2':
                selectedObjectType = 'sphere';
                updateShapeSelection();
                break;
            case '3':
                selectedObjectType = 'pyramid';
                updateShapeSelection();
                break;
            case '4':
                selectedObjectType = 'torus';
                updateShapeSelection();
                break;
            case ' ':
                e.preventDefault();
                toggleFreezeAll();
                break;
        }
    });
}

// ===================================
// UI
// ===================================

function setupUIInteractions() {
    // Toggle buttons for panels
    const toggleLeft = document.getElementById('toggleLeft');
    const toggleRight = document.getElementById('toggleRight');
    const leftPanel = document.getElementById('leftPanel');
    const rightPanel = document.getElementById('rightPanel');

    if (toggleLeft && leftPanel) {
        toggleLeft.addEventListener('click', () => {
            leftPanel.classList.toggle('hidden');
            playSound(700, 0.05, 'sine');
        });
    }

    if (toggleRight && rightPanel) {
        toggleRight.addEventListener('click', () => {
            rightPanel.classList.toggle('hidden');
            playSound(700, 0.05, 'sine');
        });
    }

    // Menu items
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
            showNotification('Drawing Cleared');
            break;

        case 'toggle-camera':
            showCamera = !showCamera;
            video.style.opacity = showCamera ? '1' : '0';
            showNotification(`Camera: ${showCamera ? 'ON' : 'OFF'}`);
            break;

        case 'toggle-landmarks':
            showLandmarks = !showLandmarks;
            showNotification(`Hands: ${showLandmarks ? 'ON' : 'OFF'}`);
            break;

        case 'select-cube':
            selectedObjectType = 'cube';
            updateShapeSelection();
            break;

        case 'select-sphere':
            selectedObjectType = 'sphere';
            updateShapeSelection();
            break;

        case 'select-pyramid':
            selectedObjectType = 'pyramid';
            updateShapeSelection();
            break;

        case 'select-torus':
            selectedObjectType = 'torus';
            updateShapeSelection();
            break;

        case 'delete-mode':
            deleteMode = !deleteMode;
            const btn = document.querySelector('[data-action="delete-mode"]');
            if (btn) {
                if (deleteMode) {
                    btn.classList.add('active');
                } else {
                    btn.classList.remove('active');
                }
            }
            showNotification(`Delete: ${deleteMode ? 'ON' : 'OFF'}`);
            break;

        case 'change-color':
            currentColorIndex = (currentColorIndex + 1) % colors.length;
            showNotification(`Color Changed`);
            break;

        case 'clear-all':
            if (confirm('Delete all objects?')) {
                for (const obj of spawnedObjects) {
                    scene.remove(obj);
                }
                spawnedObjects = [];
                updateObjectCount();
                showNotification('All Cleared');
            }
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
    const shapeEl = document.getElementById('selectedShape');
    if (shapeEl) {
        shapeEl.textContent = selectedObjectType.charAt(0).toUpperCase() + selectedObjectType.slice(1);
    }
    showNotification(`Shape: ${selectedObjectType}`);
}

// ===================================
// SOUND
// ===================================

function playSound(frequency, duration, type = 'sine') {
    if (!audioCtx) return;

    try {
        const oscillator = audioCtx.createOscillator();
        const gainNode = audioCtx.createGain();

        oscillator.connect(gainNode);
        gainNode.connect(audioCtx.destination);

        oscillator.frequency.value = frequency;
        oscillator.type = type;

        gainNode.gain.setValueAtTime(0.05, audioCtx.currentTime);
        gainNode.gain.exponentialRampToValueAtTime(0.01, audioCtx.currentTime + duration);

        oscillator.start(audioCtx.currentTime);
        oscillator.stop(audioCtx.currentTime + duration);
    } catch (e) {
        // Ignore
    }
}

// ===================================
// FPS
// ===================================

function updateFPS() {
    fpsCounter++;
    const now = Date.now();

    if (now - lastFpsUpdate >= 1000) {
        const fpsEl = document.getElementById('fpsCounter');
        if (fpsEl) {
            fpsEl.textContent = `FPS: ${fpsCounter}`;
        }
        fpsCounter = 0;
        lastFpsUpdate = now;
    }
}

// ===================================
// ANIMATION
// ===================================

function animate() {
    requestAnimationFrame(animate);

    renderDrawing();

    // Update objects
    for (const obj of spawnedObjects) {
        if (!obj.userData.frozen) {
            if (obj !== grabbedObject && autoRotate) {
                obj.rotation.x += rotationSpeed;
                obj.rotation.y += rotationSpeed;
            }
        }

        // Pulse grabbed object
        if (obj === grabbedObject && obj.children[0]) {
            const pulse = Math.sin(Date.now() * 0.005) * 0.1 + 0.9;
            obj.children[0].material.opacity = pulse;
        }
    }

    // Rotate particle field
    const particleField = scene.children.find(child => child.userData.isParticleField);
    if (particleField) {
        particleField.rotation.y += 0.0005;
        particleField.rotation.x += 0.0003;
    }

    renderer.render(scene, camera);
}

// ===================================
// START
// ===================================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', init);
} else {
    init();
}
