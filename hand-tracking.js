// hand-tracking.js
import * as THREE from 'three';
import * as tf from '@tensorflow/tfjs';
import * as handpose from '@tensorflow-models/handpose';
import { setMenuTargetPosition } from './menu-tracking.js';

let model;
let video;
let scene, camera, renderer;
let pointerMesh;
let smoothingFactor = 0.25;
let palmWorldPos = new THREE.Vector3(0, 0, -2);
let initialized = false;

// Load TensorFlow HandPose model
async function initHandTracking() {
  model = await handpose.load();
  console.log('[HandTracking] HandPose model loaded.');

  video = document.createElement('video');
  video.autoplay = true;
  video.playsInline = true;

  try {
    const stream = await navigator.mediaDevices.getUserMedia({
      video: { facingMode: 'environment', width: 1280, height: 720 }
    });
    video.srcObject = stream;
  } catch (err) {
    console.error('Camera access failed:', err);
    return;
  }

  initPointer();
  detectHands();
}

// Create the white palm pointer
function initPointer() {
  scene = new THREE.Scene();
  camera = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 100);
  renderer = new THREE.WebGLRenderer({ alpha: true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.domElement.style.position = 'absolute';
  renderer.domElement.style.top = 0;
  renderer.domElement.style.left = 0;
  document.body.appendChild(renderer.domElement);

  const geometry = new THREE.SphereGeometry(0.01, 16, 16);
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
  pointerMesh = new THREE.Mesh(geometry, material);
  pointerMesh.position.copy(palmWorldPos);
  scene.add(pointerMesh);

  initialized = true;
  animate();
}

// Run hand detection continuously
async function detectHands() {
  if (!model || !video.readyState === 4) {
    requestAnimationFrame(detectHands);
    return;
  }

  const predictions = await model.estimateHands(video, true);
  if (predictions.length > 0) {
    const palm = predictions[0].annotations.palmBase[0];
    updatePalmPosition(palm);
  }

  requestAnimationFrame(detectHands);
}

// Convert palm position to world coordinates and smooth
function updatePalmPosition(palm) {
  const x = (palm[0] - video.videoWidth / 2) / video.videoWidth;
  const y = (palm[1] - video.videoHeight / 2) / video.videoHeight;
  const z = -2;

  const newPalmPos = new THREE.Vector3(x * 2, -y * 2, z);
  palmWorldPos.lerp(newPalmPos, smoothingFactor);

  pointerMesh.position.copy(palmWorldPos);
  setMenuTargetPosition(palmWorldPos);
}

// Render per-eye
function animate() {
  if (!initialized) return;
  renderer.render(scene, camera);
  requestAnimationFrame(animate);
}

// Exported init function
export async function startHandTracking() {
  await initHandTracking();
}
