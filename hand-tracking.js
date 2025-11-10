// hand-tracking.js
import * as THREE from 'three';
import '@tensorflow/tfjs-backend-webgl';
import * as handpose from '@tensorflow-models/handpose';

let model, video, pointer;
let sceneRef, cameraRef, menuRef;
let pointerDistance = 2.0; // default projected length

export async function initHandTracking(scene, camera, menu) {
  sceneRef = scene;
  cameraRef = camera;
  menuRef = menu;

  // Setup video input
  video = document.createElement('video');
  video.autoplay = true;
  video.playsInline = true;
  video.style.display = 'none';
  document.body.appendChild(video);

  const stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
  video.srcObject = stream;

  // Load TensorFlow.js handpose model
  model = await handpose.load();

  // Create pointer (white glowing dot)
  const geometry = new THREE.SphereGeometry(0.01, 16, 16);
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
  pointer = new THREE.Mesh(geometry, material);
  pointer.visible = false;
  sceneRef.add(pointer);

  detectHands();
}

async function detectHands() {
  if (!model || video.readyState < 2) {
    requestAnimationFrame(detectHands);
    return;
  }

  const predictions = await model.estimateHands(video);
  if (predictions.length > 0) {
    const hand = predictions[0];
    const palm = hand.landmarks[0]; // wrist / base point
    const indexTip = hand.landmarks[8];
    const handDir = new THREE.Vector3(
      indexTip[0] - palm[0],
      indexTip[1] - palm[1],
      indexTip[2] - palm[2]
    ).normalize();

    // Project pointer forward from camera space
    const ray = new THREE.Ray(cameraRef.position, handDir);
    const projectedPoint = ray.at(pointerDistance, new THREE.Vector3());

    // Check intersection with menu plane (if visible)
    let intersectPoint = projectedPoint.clone();
    if (menuRef && menuRef.visible) {
      const plane = new THREE.Plane();
      menuRef.getWorldDirection(plane.normal);
      plane.constant = -menuRef.getWorldPosition(new THREE.Vector3()).dot(plane.normal);

      const intersection = new THREE.Vector3();
      const intersected = ray.intersectPlane(plane, intersection);
      if (intersected) intersectPoint.copy(intersection);
    }

    pointer.position.lerp(intersectPoint, 0.2);
    pointer.visible = true;
  } else {
    pointer.visible = false;
  }

  requestAnimationFrame(detectHands);
}
