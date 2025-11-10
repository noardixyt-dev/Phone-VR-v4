// menu-tracking.js
import * as THREE from 'three';

let scene, camera, renderer;
let menuMesh;
let overlayCanvas = document.getElementById('overlay');
let overlayCtx = overlayCanvas.getContext('2d');

let menuWidth = 1.2; // in world units
let menuHeight = 0.675; // 16:9 ratio

let menuVisible = false;
let menuPosition = new THREE.Vector3(0, 1.5, -2); // default position in front of user
let menuRotation = new THREE.Euler(0, 0, 0);

let vrSession = null;
let referenceSpace = null;

function initThree() {
    renderer = new THREE.WebGLRenderer({canvas: overlayCanvas, alpha: true});
    renderer.autoClear = false;
    renderer.setSize(window.innerWidth, window.innerHeight);

    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(70, window.innerWidth/window.innerHeight, 0.01, 100);
    
    // Frosted glass menu
    let menuGeometry = new THREE.PlaneGeometry(menuWidth, menuHeight);
    let menuMaterial = new THREE.MeshBasicMaterial({color: 0xffffff, transparent:true, opacity:0.15});
    menuMesh = new THREE.Mesh(menuGeometry, menuMaterial);
    menuMesh.position.copy(menuPosition);
    menuMesh.rotation.copy(menuRotation);
    scene.add(menuMesh);
}

function updateMenuPosition(frame) {
    if(!vrSession) return;
    const viewerPose = frame.getViewerPose(referenceSpace);
    if(viewerPose) {
        const headPos = new THREE.Vector3().fromArray(viewerPose.transform.position);
        const headRot = new THREE.Euler().setFromQuaternion(new THREE.Quaternion().fromArray(viewerPose.transform.orientation));
        
        // Smooth 6DOF tracking
        menuMesh.position.lerp(menuPosition.clone().add(headPos), 0.1);
        menuMesh.rotation.x += (menuRotation.x + headRot.x - menuMesh.rotation.x) * 0.1;
        menuMesh.rotation.y += (menuRotation.y + headRot.y - menuMesh.rotation.y) * 0.1;
        menuMesh.rotation.z += (menuRotation.z + headRot.z - menuMesh.rotation.z) * 0.1;
    }
}

function render() {
    overlayCtx.clearRect(0,0,overlayCanvas.width,overlayCanvas.height);
    if(menuVisible) renderer.render(scene, camera);
    requestAnimationFrame(render);
}

// Toggle menu with double-tap
let lastTap = 0;
window.addEventListener('touchend', (e) => {
    const currentTime = new Date().getTime();
    if(currentTime - lastTap < 300){
        menuVisible = !menuVisible;
    }
    lastTap = currentTime;
});

// Resize handler
window.addEventListener('resize', ()=>{
    overlayCanvas.width = window.innerWidth;
    overlayCanvas.height = window.innerHeight;
    camera.aspect = window.innerWidth/window.innerHeight;
    camera.updateProjectionMatrix();
});

// Initialize Three.js menu
initThree();
overlayCanvas.width = window.innerWidth;
overlayCanvas.height = window.innerHeight;
render();

// Expose function to update VR session and reference space
export function setVRSession(session, refSpace){
    vrSession = session;
    referenceSpace = refSpace;
}

// External function to update menu target position (used by hand tracking)
export function setMenuTargetPosition(pos){
    menuPosition.copy(pos);
}
