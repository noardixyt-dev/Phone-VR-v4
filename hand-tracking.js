// hand-tracking.js
// Put this file next to index.html
// It attaches to the same camera stream and attempts to run MediaPipe Hands.
// Renders a palm pointer (white dot) in world space via the three.js scene from menu-tracking.js
// Pinch detection: distance between thumb tip and index tip.

import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.153.0/build/three.module.js';

// We import the menu objects from menu-tracking (they export menuMesh & menuBar)
import { menuMesh, menuBar, toggleMenu } from './menu-tracking.js';

const videoLeft = document.getElementById('videoLeft'); // share stream
const videoRight = document.getElementById('videoRight');
const debugLog = document.getElementById('debugLog');

// ensure mediapipe CDN base
const MEDIAPIPE_CDN = window._MEDIAPIPE_CDN || "https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4";

let handsModuleLoaded = false;
let hands = null;
let canvas = document.querySelector('canvas#overlay');
let renderer = null;
let overlayScene = null;
let overlayCamera = null;
let pointerSphere = null;
let pointerVisible = false;
let pinchActive = false;

async function loadMediaPipeHands(){
  try{
    // load mediapipe hands (UMD dynamic)
    // We'll try to import the official UMD JS modules: hands_solution_simd_wasm_bin.js etc.
    // Many CDN builds of mediapipe use multiple files — if you host locally, adjust the path accordingly.
    const scriptUrl = `${MEDIAPIPE_CDN}/hands_solution_simd_wasm_bin.js`;
    // try to dynamically import - but many mediapipe builds expect to be loaded via <script>
    // We'll load the UMD script by inserting a script tag, then use global `window.Hands` if present.
    await new Promise((resolve, reject) => {
      if (window.Hands) return resolve();
      const s = document.createElement('script');
      s.src = `${MEDIAPIPE_CDN}/hands.js`; // hands.js wrapper UMD file (common)
      s.onload = () => { resolve(); };
      s.onerror = (e) => { reject(new Error('Mediapipe hands script load failed')); };
      document.head.appendChild(s);
    });
    // now Hands should be available on window.Hands (UMD) or via global.
    if (!window.Hands && !window.HandsSolution && !window.mpHands) {
      console.warn('Mediapipe Hands not found as window.Hands. Trying alternative exports...');
    }
    handsModuleLoaded = true;
    debugLog.style.display = 'block'; debugLog.textContent = 'MediaPipe loaded';
    setTimeout(()=> debugLog.style.display = 'none', 1500);
    initHands();
  }catch(err){
    console.warn('loadMediaPipeHands failed', err);
    debugLog.style.display = 'block';
    debugLog.textContent = 'Hand tracking unavailable';
    setTimeout(()=> debugLog.style.display = 'none', 2000);
  }
}

function initOverlayForPointer(){
  // use three to render the pointer; this re-uses the same overlay canvas as menu-tracking's renderer
  // For simplicity, create a tiny overlay scene and camera to draw pointer at screen-space positions.
  overlayScene = new THREE.Scene();
  overlayCamera = new THREE.OrthographicCamera(-1,1,1,-1,0.1,10);
  overlayCamera.position.z = 1;

  const geom = new THREE.SphereGeometry(0.01, 12, 12);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  pointerSphere = new THREE.Mesh(geom, mat);
  pointerSphere.visible = false;
  overlayScene.add(pointerSphere);

  // We'll borrow the WebGLRenderer created by menu-tracking.js by selecting the existing WebGL canvas.
  // Create a new renderer that uses the same canvas but does not clear it — this lets both scripts draw without stomping.
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias:true, alpha:true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.autoClear = false;
}

// Mediapipe setup (this expects the global "Hands" API provided by Mediapipe UMD)
function initHands(){
  try {
    // The exact constructor differs by Mediapipe version; attempt common usage
    const HandsClass = window.Hands || window.HandsSolution || window.MPHands;
    if (!HandsClass && !window.mpHands) {
      console.warn('Mediapipe Hands global not found — aborting hand features.');
      return;
    }
    const Hands = window.Hands || window.HandsSolution || window.mpHands || window.MPH;
    // Because packaging varies, try to instantiate gracefully:
    hands = new (window.Hands || window.HandsSolution || window.mpHands || window.MPH)({
      locateFile: (file) => {
        // ensure the wasm/data are loaded from the CDN base or local root -- edit if you host locally
        return `${MEDIAPIPE_CDN}/${file}`;
      }
    });

    // set options (fast & lightweight on mobile)
    if (hands.setOptions) {
      hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 0,
        minDetectionConfidence: 0.6,
        minTrackingConfidence: 0.5
      });
    }
    hands.onResults(onHandsResults);

    // create camera uploader from videoLeft (they share stream)
    if (typeof window.Camera === 'function' && videoLeft) {
      // MediaPipe Camera utility exists sometimes; if not, we'll use manual frames
      const camera = new window.Camera(videoLeft, {
        onFrame: async () => { await hands.send({ image: videoLeft }); },
        width: videoLeft.videoWidth || 640,
        height: videoLeft.videoHeight || 480
      });
      camera.start();
    } else {
      // fallback: poll frames
      (function frameLoop(){
        if (videoLeft && videoLeft.readyState >= 2) {
          hands.send({ image: videoLeft }).catch(()=>{});
        }
        setTimeout(frameLoop, 1000/30);
      })();
    }
    // overlay
    initOverlayForPointer();
  } catch (e) {
    console.warn('initHands failed', e);
    debugLog.style.display = 'block';
    debugLog.textContent = 'Hand init failed';
    setTimeout(()=> debugLog.style.display = 'none', 1500);
  }
}

function onHandsResults(results){
  // results.multiHandLandmarks is an array of hands
  if (!results || !results.multiHandLandmarks || results.multiHandLandmarks.length === 0){
    pointerVisible = false;
    pointerSphere.visible = false;
    return;
  }

  // We compute palm center as average of wrist(0) + middle_mcp(9) as a simple approx
  const landmarks = results.multiHandLandmarks[0]; // primary hand
  // landmarks indexes: 0 wrist, 9 middle_finger_mcp
  const w = landmarks[0], m = landmarks[9];
  const palm = { x: (w.x + m.x)/2, y: (w.y + m.y)/2, z: (w.z + m.z)/2 };

  // project palm (normalized image coords) into normalized device coords for overlay; note MediaPipe uses image coords (0..1)
  // Convert to screen NDC: x -> [ -1 .. 1 ], y-> [ -1 .. 1 ] inverted
  const ndcX = (palm.x * 2) - 1;
  const ndcY = -((palm.y * 2) - 1);

  // clamp inside eye windows bounds: we compute if NDC maps to left or right eye area in DOM
  // For simplicity draw dot at overlay position computed from videoLeft bounding rect
  const leftRect = document.getElementById('leftWin').getBoundingClientRect();
  const rightRect = document.getElementById('rightWin').getBoundingClientRect();
  // map normalized coords to window pixels
  const px = palm.x * window.innerWidth;
  const py = palm.y * window.innerHeight;

  // decide if the palm projection falls inside left or right eye windows; otherwise hide
  const inLeft = px >= leftRect.left && px <= leftRect.right && py >= leftRect.top && py <= leftRect.bottom;
  const inRight = px >= rightRect.left && px <= rightRect.right && py >= rightRect.top && py <= rightRect.bottom;
  if (!inLeft && !inRight){
    pointerVisible = false;
    if (pointerSphere) pointerSphere.visible = false;
    return;
  }

  // show pointer at appropriate location in overlay camera space
  pointerVisible = true;
  if (pointerSphere) {
    const screenX = (px / window.innerWidth) * 2 - 1;
    const screenY = - (py / window.innerHeight) * 2 + 1;
    // set pointer position in overlayScene using unproject trick
    const vec = new THREE.Vector3(screenX, screenY, 0.5);
    vec.unproject(overlayCamera);
    pointerSphere.position.copy(vec);
    pointerSphere.visible = true;
  }

  // pinch detection: thumb tip (4) and index tip (8)
  const thumb = landmarks[4];
  const index = landmarks[8];
  const dx = thumb.x - index.x;
  const dy = thumb.y - index.y;
  const dz = (thumb.z || 0) - (index.z || 0);
  const dist = Math.sqrt(dx*dx + dy*dy + dz*dz);

  // threshold (normalized units) — adjust sensitivity if needed
  if (dist < 0.03){
    if (!pinchActive){
      pinchActive = true;
      // perform click/select if targeting menu (call toggleMenu or simulate press)
      // We'll cast a ray from camera center to menuMesh and if near, trigger toggleMenu
      if (menuMesh && menuMesh.visible){
        // simple proximity test: if pointer projects inside menu bounds in screen pixels -> click
        const menuPos = menuMesh.position.clone();
        // compute screen coords of menu center
        // Project using perspectiveBase from menu-tracking — easiest is to dispatch an event and have menu-tracking handle clicks
        // For simplicity call toggleMenu() as a sample action (you can replace with more precise hit test)
        toggleMenu();
      }
    }
  } else {
    pinchActive = false;
  }
}

// Load Mediapipe script if available
(async ()=> {
  // attempt to load via the CDN base used in index.html
  try{
    // load hands library wrapper
    const url = (window._MEDIAPIPE_CDN || 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4') + '/hands.js';
    await new Promise((resolve, reject) => {
      if (window.Hands) return resolve();
      const s = document.createElement('script');
      s.src = url;
      s.onload = resolve;
      s.onerror = reject;
      document.head.appendChild(s);
    });
    // also ensure wasm & .data are reachable; MediaPipe will request them with locateFile
    await loadMediaPipe();
  }catch(err){
    console.warn('mediapipe load failed', err);
    debugLog.style.display = 'block';
    debugLog.textContent = 'Mediapipe not available';
    setTimeout(()=> debugLog.style.display='none', 2000);
  }
})();

async function loadMediaPipe(){
  // give the page a brief moment if video not started yet
  setTimeout(() => {
    if (!videoLeft || !videoLeft.srcObject) {
      // If video isn't ready, try again later
      setTimeout(loadMediaPipe, 500);
      return;
    }
    // Attempt to initialize (this will fallback-safe if Hands class differs)
    if (window.Hands || window.HandsSolution){
      loadMediaPipeHands();
    } else {
      console.warn('Mediapipe global Hands not found after script load');
    }
  }, 300);
}

async function loadMediaPipeHands(){
  try{
    // prefer new modular API if present
    // Many mediapipe builds expose "Hands" as global
    // We'll create a new Hands instance (UMD) and configure locateFile so .wasm/.data loads from CDN
    const Hands = window.Hands || window.HandsSolution || window.HandsModule || window.HandsModuleFactory;
    if (!Hands && !window.Hands) {
      console.warn('No Hands constructor found.');
      return;
    }

    // Construct according to the official UMD interface
    hands = new window.Hands({ locateFile: (file) => {
      return `${window._MEDIAPIPE_CDN || 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4'}/${file}`;
    }});

    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 0,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.5
    });
    hands.onResults(onHandsResults);

    // start a simple frame loop that sends video frames
    (function frameProc(){
      if (videoLeft && videoLeft.readyState >= 2) {
        hands.send({ image: videoLeft }).catch(()=>{});
      }
      requestAnimationFrame(frameProc);
    })();

    initOverlayForPointer();

    debugLog.style.display = 'block';
    debugLog.textContent = 'Hand tracking active';
    setTimeout(()=> debugLog.style.display='none', 1500);
  }catch(err){
    console.warn('init mediapipe hands error', err);
    debugLog.style.display = 'block';
    debugLog.textContent = 'Hand module init error';
    setTimeout(()=> debugLog.style.display='none', 1500);
  }
}

// overlay helper init (if not already created by menu script)
function initOverlayForPointer(){
  if (!canvas) canvas = document.querySelector('canvas#overlay');
  // We'll reuse the existing renderer (menu-tracking.js made one), but create a small overlay scene
  // If a renderer already exists on the canvas, creating another renderer reuses canvas - it's OK but we keep autoClear=false
  renderer = new THREE.WebGLRenderer({ canvas: canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.autoClear = false;

  overlayScene = new THREE.Scene();
  overlayCamera = new THREE.OrthographicCamera(-1,1,1,-1,0.1,10);
  overlayCamera.position.z = 1;

  const geom = new THREE.SphereGeometry(0.012, 12, 12);
  const mat = new THREE.MeshBasicMaterial({ color: 0xffffff });
  pointerSphere = new THREE.Mesh(geom, mat);
  pointerSphere.visible = false;
  overlayScene.add(pointerSphere);

  // render overlay on top each frame
  (function overlayLoop(){
    requestAnimationFrame(overlayLoop);
    if (pointerSphere && pointerSphere.visible){
      renderer.clearDepth();
      renderer.render(overlayScene, overlayCamera);
    }
  })();
}

// Expose debug toggle (optional)
window.__handTracking = {
  enabled: ()=> !!hands,
  pointerVisible: ()=> pointerVisible
};
