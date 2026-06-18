import * as THREE from 'three';
import { OrbitControls } from 'three/addons/controls/OrbitControls.js';

// --- Configuration ---
let scene, camera, renderer, controls, domeMesh, wireframeMesh, guideMesh;
let currentTexture = null;
let guideTexture = null;
let currentVideo = null;
const textureLoader = new THREE.TextureLoader();

init();
animate();

function init() {
    // Scene setup
    scene = new THREE.Scene();
    scene.background = new THREE.Color(0x111111);

    // Camera setup
    camera = new THREE.PerspectiveCamera(75, window.innerWidth / window.innerHeight, 0.1, 1000);
    camera.position.set(0, 1, 3);

    // Renderer setup
    renderer = new THREE.WebGLRenderer({ antialias: true });
    renderer.setSize(window.innerWidth, window.innerHeight);
    renderer.setPixelRatio(window.devicePixelRatio);
    document.body.appendChild(renderer.domElement);

    // Orbit Controls
    controls = new OrbitControls(camera, renderer.domElement);
    controls.enableDamping = true;
    controls.target.set(0, 0, 0);

    // Lighting
    const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
    scene.add(ambientLight);

    // Create Dome Mesh
    createDome();

    // Event Listeners
    window.addEventListener('resize', onWindowResize);
    setupDragAndDrop();
    
    // UI Listeners
    document.getElementById('mapping-type').addEventListener('change', updateMapping);
    document.getElementById('wireframe-toggle').addEventListener('change', toggleWireframe);
    document.getElementById('wireframe-color').addEventListener('input', updateWireframeColor);
    document.getElementById('guide-opacity').addEventListener('input', updateGuideOpacity);

    loadGuideTexture();
}

function createDome() {
    if (domeMesh) scene.remove(domeMesh);

    const geometry = new THREE.SphereGeometry(1, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2);
    
    const material = new THREE.MeshBasicMaterial({ 
        color: 0x888888, 
        side: THREE.BackSide 
    });

    domeMesh = new THREE.Mesh(geometry, material);
    scene.add(domeMesh);

    // Add wireframe overlay
    const wireframeGeometry = new THREE.SphereGeometry(1.001, 32, 16, 0, Math.PI * 2, 0, Math.PI / 2);
    const wireframeMaterial = new THREE.MeshBasicMaterial({ 
        color: 0x00ff00, 
        wireframe: true, 
        transparent: true, 
        opacity: 0.3, 
        side: THREE.BackSide 
    });
    wireframeMesh = new THREE.Mesh(wireframeGeometry, wireframeMaterial);
    domeMesh.add(wireframeMesh);
}

function updateMapping() {
    if (!currentTexture) return;
    
    const type = document.getElementById('mapping-type').value;
    
    currentTexture.wrapS = THREE.RepeatWrapping;
    currentTexture.wrapT = THREE.RepeatWrapping;
    currentTexture.repeat.set(1, 1);
    currentTexture.offset.set(0, 0);

    if (type === 'equirect_21') {
        // Standard 2:1
    } else if (type === 'equirect_169') {
        // 16:9
        currentTexture.repeat.set(1, 1); 
    } else if (type === 'fisheye_11') {
        applyFisheyeShader();
        return;
    }

    // Fix mirror effect for standard textures
    currentTexture.repeat.set(-1, 1);
    currentTexture.offset.set(1, 0);

    domeMesh.material = new THREE.MeshBasicMaterial({ 
        map: currentTexture, 
        side: THREE.BackSide 
    });
}

function applyFisheyeShader() {
    const material = new THREE.ShaderMaterial({
        uniforms: {
            tDiffuse: { value: currentTexture },
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform sampler2D tDiffuse;
            varying vec2 vUv;
            void main() {
                float phi = vUv.x * 2.0 * 3.14159265;
                float theta = (1.0 - vUv.y) * (3.14159265 / 2.0);
                float r = theta / (3.14159265 / 2.0);
                
                // Invert phi to fix mirror effect in fisheye
                float angle = -phi; 
                
                vec2 fisheyeUv = vec2(0.5 + r * cos(angle) * 0.5, 0.5 + r * sin(angle) * 0.5);
                gl_FragColor = texture2D(tDiffuse, fisheyeUv);
            }
        `,
        side: THREE.BackSide
    });
    domeMesh.material = material;
}

function toggleWireframe() {
    const isVisible = document.getElementById('wireframe-toggle').checked;
    wireframeMesh.visible = isVisible;
}

function updateWireframeColor() {
    const colorValue = document.getElementById('wireframe-color').value;
    wireframeMesh.material.color.set(colorValue);
}

function setupDragAndDrop() {
    const dropZone = document.getElementById('drop-zone');
    
    window.addEventListener('dragover', (e) => {
        e.preventDefault();
        dropZone.classList.add('active');
    });

    window.addEventListener('dragleave', (e) => {
        if (e.relatedTarget === null) {
            dropZone.classList.remove('active');
        }
    });

    window.addEventListener('drop', (e) => {
        e.preventDefault();
        dropZone.classList.remove('active');
        
        const files = e.dataTransfer.files;
        if (files.length > 0) {
            const file = files[0];
            if (file.type.startsWith('image/')) {
                const reader = new FileReader();
                reader.onload = (event) => {
                    loadTexture(event.target.result);
                };
                reader.readAsDataURL(file);
            } else if (file.type.startsWith('video/')) {
                loadVideo(file);
            }
        }
    });
}

function loadTexture(url) {
    textureLoader.load(url, (texture) => {
        currentTexture = texture;
        updateMapping();
    });
}

function loadVideo(file) {
    // Clean up previous video
    if (currentVideo) {
        currentVideo.pause();
        currentVideo.src = "";
        currentVideo.load();
        currentVideo.remove();
    }

    const video = document.createElement('video');
    video.src = URL.createObjectURL(file);
    video.loop = true;
    video.muted = true; // Required for autoplay in many browsers
    video.crossOrigin = "anonymous";
    video.play();

    const videoTexture = new THREE.VideoTexture(video);
    currentTexture = videoTexture;
    currentVideo = video;

    updateMapping();
}

function loadGuideTexture() {
    textureLoader.load('domeguide.jpg', (texture) => {
        guideTexture = texture;
        createGuideDome();
    });
}

function createGuideDome() {
    if (guideMesh) scene.remove(guideMesh);

    // The guide dome is slightly SMALLER than the main dome to be inside it
    const geometry = new THREE.SphereGeometry(0.998, 64, 32, 0, Math.PI * 2, 0, Math.PI / 2);
    
    const material = new THREE.ShaderMaterial({
        uniforms: {
            tDiffuse: { value: guideTexture },
            uOpacity: { value: 0.0 }
        },
        vertexShader: `
            varying vec2 vUv;
            void main() {
                vUv = uv;
                gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
            }
        `,
        fragmentShader: `
            uniform sampler2D tDiffuse;
            uniform float uOpacity;
            varying vec2 vUv;
            void main() {
                float phi = vUv.x * 2.0 * 3.14159265;
                float theta = (1.0 - vUv.y) * (3.14159265 / 2.0);
                float r = theta / (3.14159265 / 2.0);
                
                // Invert phi to fix mirror effect in fisheye
                float angle = -phi; 
                
                vec2 fisheyeUv = vec2(0.5 + r * cos(angle) * 0.5, 0.5 + r * sin(angle) * 0.5);
                vec4 color = texture2D(tDiffuse, fisheyeUv);
                gl_FragColor = vec4(color.rgb, color.a * uOpacity);
            }
        `,
        transparent: true,
        side: THREE.BackSide
    });

    guideMesh = new THREE.Mesh(geometry, material);
    scene.add(guideMesh);
}

function updateGuideOpacity() {
    const opacity = document.getElementById('guide-opacity').value;
    const valueText = document.getElementById('guide-opacity-value');
    
    valueText.innerText = Math.round(opacity * 100) + '%';
    
    if (guideMesh) {
        guideMesh.material.uniforms.uOpacity.value = parseFloat(opacity);
    }
}

function onWindowResize() {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(window.innerWidth, window.innerHeight);
}

function animate() {
    requestAnimationFrame(animate);
    controls.update();
    renderer.render(scene, camera);
}
