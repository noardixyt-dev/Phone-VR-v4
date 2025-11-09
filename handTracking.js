// handTracking.js
// - Uses MediaPipe Hands to detect hands from the same camera stream.
// - Exposes functions to attach the existing camera stream and to query the palm intersection point
// - Draws a small white dot (palm projection) on both eyes via simple 2D overlay coordinates.
// - Provides simple pinch detection for dragging (distance between thumb tip and index tip).
//
// Save this file as handTracking.js in the same folder as index.html

import { drawConnectors, drawLandmarks } from 'https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js';
/* eslint-disable no-undef */
let hands = null;
let localVideo = null;          // video element that shows the camera (we attach stream to it from main)
let overlayCanvas = null;       // the overlay canvas element from the page
let overlayCtx = null;
let latestHandsResult = null;
let running = false;

// small config: lower detection resolution for speed on phones
const DETECT_WIDTH = 640;
const DETECT_HEIGHT = 360;

// attachHandStream(stream, options)
// options: { videoElLeft, videoElRight}
// We create an internal hidden video element that uses the provided stream for MediaPipe
export async function attachHandStream(stream, options = {}) {
  // prefer a small dedicated video for mediapipe so it can run at low resolution without affecting visible videos
  localVideo = document.createElement('video');
  localVideo.autoplay = true;
  localVideo.playsInline = true;
  localVideo.muted = true;
  localVideo.style.position = 'fixed';
  localVideo.style.left = '0';
  localVideo.style.top = '0';
  localVideo.style.width = '160px';
  localVideo.style.height = '90px';
  localVideo.style.opacity = '0';
  localVideo.style.pointerEvents = 'none';
  document.body.appendChild(localVideo);

  localVideo.srcObject = stream;
  try { await localVideo.play(); } catch (e) { console.warn('hand localVideo.play blocked', e); }

  // overlay canvas
  overlayCanvas = document.getElementById('overlay');
  overlayCtx = overlayCanvas.getContext('2d');

  // create MediaPipe Hands
  hands = new window.Hands({
    locateFile: (file) => {
      return `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`;
    }
  });

  hands.setOptions({
    selfieMode: false, // we use back camera
    maxNumHands: 1,
    modelComplexity: 0, // 0 or 1; 0 is faster
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.5
  });

  hands.onResults(onHandsResult);

  // run a loop that sends frames to MediaPipe at a controlled rate
  running = true;
  runDetectionLoop();
}

// provide an external init function to start detection if not already started
export function initHandTracking(){ /* intentionally empty - attachHandStream starts it */ }

// simple frame pump to the MediaPipe Hands detector using a small canvas
async function runDetectionLoop(){
  const off = document.createElement('canvas');
  off.width = DETECT_WIDTH; off.height = DETECT_HEIGHT;
  const ctx = off.getContext('2d');

  async function step(){
    if (!running || !hands || !localVideo) {
      requestAnimationFrame(step);
      return;
    }
    // draw scaled small frame
    try {
      ctx.drawImage(localVideo, 0, 0, DETECT_WIDTH, DETECT_HEIGHT);
      await hands.send({image: off});
    } catch(e){
      // ignore transient errors
    }
    // target ~30fps detection
    setTimeout(()=> requestAnimationFrame(step), 33);
  }
  requestAnimationFrame(step);
}

function onHandsResult(results){
  latestHandsResult = results;
}

// Returns object with { visible, palmWorldRay }.
// For our simple case we compute the palm center in normalized video coords and project a ray into world
// The main code will intersect that ray with the menu plane.
export function getPalmIntersection() {
  // latestHandsResult multiHandLandmarks
  if (!latestHandsResult || !latestHandsResult.multiHandLandmarks || latestHandsResult.multiHandLandmarks.length === 0) return null;
  const lm = latestHandsResult.multiHandLandmarks[0];
  // key indices (MediaPipe Hands): 0=WRIST, 9=middle_finger_mcp, 12=index_tip, 4=thumb_tip
  // compute palm center as average of wrist(0) and middle_mcp(9)
  const wrist = lm[0];
  const mid = lm[9];
  const palmX = (wrist.x + mid.x) * 0.5;
  const palmY = (wrist.y + mid.y) * 0.5;
  // normalized coords are in [0..1] with origin top-left for the input video (selfieMode=false so same orientation)
  // Provide normalized palm point and pinch boolean
  const indexTip = lm[12];
  const thumbTip = lm[4];
  const pinchDist = Math.hypot(indexTip.x - thumbTip.x, indexTip.y - thumbTip.y);
  const isPinched = pinchDist < 0.05;

  return {
    visible: true,
    palm: { x: palmX, y: palmY }, // normalized (video coordinates)
    pinch: isPinched
  };
}

// draw a small dot for palm on overlay canvas at given screen position
export function drawPalmDot(screenX, screenY, size = 8) {
  if (!overlayCtx) return;
  overlayCtx.beginPath();
  overlayCtx.fillStyle = 'rgba(255,255,255,0.98)';
  overlayCtx.arc(screenX, screenY, size, 0, Math.PI * 2);
  overlayCtx.fill();
}

// the menu code will call this per-frame to let hand tracker draw debug/overlay elements
export function renderHandOverlay(transformFnPerEye) {
  if (!overlayCtx) return;
  // Clear only the areas we draw into (we will clear whole canvas for simplicity)
  overlayCtx.clearRect(0, 0, overlayCtx.canvas.width, overlayCtx.canvas.height);

  const palm = getPalmIntersection();
  if (!palm || !palm.visible) return;
  // transform normalized palm coords to screen for each eye via transformFnPerEye(eyeIndex, normX, normY)
  // transform returns {x,y,insideEye}
  for (let eye = 0; eye < 2; eye++){
    const t = transformFnPerEye(eye, palm.palm.x, palm.palm.y);
    if (t && t.insideEye){
      drawPalmDot(t.x, t.y, Math.max(6, Math.round(overlayCtx.canvas.width / 420)));
    }
  }
}

// stop detection (not used now but exported for completeness)
export function stopHandTracking(){
  running = false;
  if (hands) hands.close();
  hands = null;
}

export default {
  attachHandStream,
  initHandTracking,
  getPalmIntersection,
  renderHandOverlay,
  stopHandTracking
};
