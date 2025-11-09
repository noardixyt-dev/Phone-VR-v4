// menuTracking.js
// - Handles three.js overlay rendering for the menu
// - Renders 3D scene once into a RenderTarget (single-pass) then blits that texture into both eye viewports
// - Exposes initMenuRendering(...) and functions for toggling and adjusting menu scale
// - Uses the overlay canvas element provided from index.html
//
// Save as menuTracking.js (same folder as index.html)

import { renderHandOverlay, getPalmIntersection } from './handTracking.js';

let renderer = null, scene = null, perspectiveBase = null;
let rt = null, quadScene = null, quadCamera = null, menuMesh = null, menuBar = null;
let overlayCanvas = null;
let deviceQuatProvider = null; // function that returns current device quaternion
let lastSpawned = false;
let menuScale = 1.0;
const MENU_DISTANCE = 1.4;
const FIXED_IPD = 0.064;

export function initMenuRendering({ overlayCanvas: canvas, deviceQuatProvider: dqProvider }) {
  overlayCanvas = canvas;
  deviceQuatProvider = dqProvider || (()=>new THREE.Quaternion());

  renderer = new THREE.WebGLRenderer({ canvas: overlayCanvas, antialias: true, alpha: true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.autoClear = false;

  // scene for menu
  scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff, 0.8));
  const dl = new THREE.DirectionalLight(0xffffff, 0.25); dl.position.set(1,2,2); scene.add(dl);

  // main perspective camera used for the single render pass
  perspectiveBase = new THREE.PerspectiveCamera(70, window.innerWidth / window.innerHeight, 0.01, 1000);

  // render target (single pass)
  const size = Math.max(512, Math.min(2048, Math.floor(Math.max(window.innerWidth, window.innerHeight) * (window.devicePixelRatio || 1))));
  rt = new THREE.WebGLRenderTarget(size, size, { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat });

  // create the menu (rounded box-like)
  const boxG = new THREE.BoxGeometry(0.9, 0.5, 0.02);
  const boxM = new THREE.MeshStandardMaterial({ color: 0x1f6feb, roughness:0.5, metalness:0.05, emissive:0x001030 });
  menuMesh = new THREE.Mesh(boxG, boxM);
  menuMesh.visible = false;
  scene.add(menuMesh);

  // pill bar used for dragging
  const barG = new THREE.BoxGeometry(0.5, 0.04, 0.001);
  const barM = new THREE.MeshStandardMaterial({ color:0xffffff, transparent:true, opacity:0.9 });
  menuBar = new THREE.Mesh(barG, barM);
  menuBar.position.set(0, - (0.5/2) - 0.04, 0.011);
  menuMesh.add(menuBar);

  // a simple full-screen quad scene that shows the RT texture (we'll draw this per-eye into viewport quads)
  quadScene = new THREE.Scene();
  quadCamera = new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  // material uses the RT texture; we will set it each frame
  const quadMat = new THREE.MeshBasicMaterial({ map: rt.texture, transparent: true });
  const quadGeom = new THREE.PlaneGeometry(2,2);
  const quadMesh = new THREE.Mesh(quadGeom, quadMat);
  quadScene.add(quadMesh);

  // input handlers (pointer events on window augmented by handTracking (pinch) logic)
  window.addEventListener('pointerdown', overlayPointerDown, { passive:true });
  window.addEventListener('pointermove', overlayPointerMove, { passive:true });
  window.addEventListener('pointerup', overlayPointerUp, { passive:true });

  window.addEventListener('resize', ()=> {
    renderer.setSize(window.innerWidth, window.innerHeight);
    perspectiveBase.aspect = window.innerWidth / window.innerHeight;
    perspectiveBase.updateProjectionMatrix();
    if (rt) {
      const s = Math.max(512, Math.min(2048, Math.floor(Math.max(window.innerWidth, window.innerHeight) * (window.devicePixelRatio || 1))));
      rt.setSize(s, s);
    }
  });

  // start loop
  requestAnimationFrame(animate);
}

let dragging = false, dragStart = null, dragCam = null;

// pointer handlers used for touch dragging (menuBar)
function overlayPointerDown(e){
  const now = Date.now();
  if (now - lastTap < 300) {
    // double-tap toggles menu
    toggleMenu();
  }
  lastTap = now;

  if (!menuMesh.visible) return;
  const ndc = screenToNDC(e.clientX, e.clientY);
  // use left-eye projection to test intersection
  const cam = perspectiveBase;
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, cam);
  const hits = ray.intersectObject(menuBar, true);
  if (hits.length > 0) {
    dragging = true;
    dragStart = { x:e.clientX, y:e.clientY, startPos: menuMesh.position.clone() };
    dragCam = cam;
  }
}
function overlayPointerMove(e){
  if (!dragging || !dragStart) {
    // draw palm overlay using handTracking render if available (handTracking module will call renderHandOverlay)
    return;
  }
  const ndcNow = screenToNDC(e.clientX, e.clientY);
  const ndcThen = screenToNDC(dragStart.x, dragStart.y);
  const delta = ndcNow.clone().sub(ndcThen);
  const cam = dragCam;
  const distance = menuMesh.position.length() || MENU_DISTANCE;
  const vFov = cam.fov * Math.PI/180;
  const worldH = 2 * Math.tan(vFov/2) * distance;
  const worldW = worldH * cam.aspect;
  const worldDelta = new THREE.Vector3(-delta.x * worldW/2, -delta.y * worldH/2, 0);
  worldDelta.applyQuaternion(cam.quaternion);
  menuMesh.position.copy(dragStart.startPos.clone().add(worldDelta));
}
function overlayPointerUp(e){ dragging=false; dragStart=null; }

// small helpers
function screenToNDC(x,y){ return new THREE.Vector2((x/window.innerWidth)*2 - 1, - (y/window.innerHeight)*2 + 1); }
let lastTap = 0;

export function toggleMenuFromInput(){ toggleMenu(); }

// spawn or hide menu
function toggleMenu(){
  if (!menuMesh.visible) spawnMenu();
  else hideMenu();
}

function spawnMenu(){
  // spawn in front of the viewer using current device quaternion
  const forward = new THREE.Vector3(0,0,-1);
  const dq = deviceQuatProvider ? deviceQuatProvider() : new THREE.Quaternion();
  forward.applyQuaternion(dq);
  const spawnPos = forward.clone().multiplyScalar(MENU_DISTANCE);
  menuMesh.position.copy(spawnPos);
  // horizontal facing: face toward camera horizontally only
  const toCam = new THREE.Vector3().subVectors(new THREE.Vector3(0,0,0), menuMesh.position);
  toCam.y = 0;
  menuMesh.lookAt(menuMesh.position.clone().add(toCam));
  menuMesh.up.set(0,1,0);
  menuMesh.visible = true;
  menuMesh.scale.setScalar(menuScale);
}

function hideMenu(){
  // quick hide
  menuMesh.visible = false;
}

export function setMenuScale(s){
  menuScale = s;
  if (menuMesh) menuMesh.scale.setScalar(menuScale);
}

// main animation: single pass render scene to RT with perspectiveBase
function animate(){
  requestAnimationFrame(animate);
  if (!renderer || !scene || !rt) return;

  // update perspectiveBase orientation from deviceQuatProvider
  const dq = deviceQuatProvider ? deviceQuatProvider() : new THREE.Quaternion();
  perspectiveBase.quaternion.copy(dq);

  // single-pass: render 3D scene into RT
  renderer.setRenderTarget(rt);
  renderer.clear();
  renderer.render(scene, perspectiveBase);
  renderer.setRenderTarget(null);

  // now draw RT into two viewports corresponding to DOM eye windows
  // We'll compute left/right rectangles by reading the left/right DOM window positions
  const leftWin = document.getElementById('leftWin').getBoundingClientRect();
  const rightWin = document.getElementById('rightWin').getBoundingClientRect();
  const leftViewportY = window.innerHeight - leftWin.top - leftWin.height;

  renderer.setScissorTest(true);

  // left eye: blit RT texture into DOM area
  renderer.setScissor(leftWin.left, leftViewportY, leftWin.width, leftWin.height);
  renderer.setViewport(leftWin.left, leftViewportY, leftWin.width, leftWin.height);
  // draw full-screen quad (quadScene uses rt.texture)
  (quadScene.children[0].material).map = rt.texture;
  (quadScene.children[0].material).needsUpdate = true;
  renderer.clearDepth();
  renderer.render(quadScene, quadCamera);

  // right eye
  const rightViewportY = window.innerHeight - rightWin.top - rightWin.height;
  renderer.setScissor(rightWin.left, rightViewportY, rightWin.width, rightWin.height);
  renderer.setViewport(rightWin.left, rightViewportY, rightWin.width, rightWin.height);
  (quadScene.children[0].material).map = rt.texture;
  (quadScene.children[0].material).needsUpdate = true;
  renderer.clearDepth();
  renderer.render(quadScene, quadCamera);

  renderer.setScissorTest(false);

  // Render hand overlay (2D dots) by calling the handTracking helper which will draw on the overlay canvas 2D context.
  // We need to supply a transform function that maps normalized palm coordinates (from MediaPipe) to screen coords for each eye.
  if (typeof renderHandOverlay === 'function') {
    renderHandOverlay((eyeIndex, normX, normY)=>{
      // MediaPipe normalized coords are relative to camera frame, origin top-left.
      // Map to DOM coordinates for each eye window:
      const rect = (eyeIndex === 0) ? leftWin : rightWin;
      // clamp: only show if inside the eye bounds
      const sx = rect.left + clamp(normX * rect.width, 0, rect.width);
      const sy = rect.top + clamp(normY * rect.height, 0, rect.height);
      const inside = (normX >= 0 && normX <= 1 && normY >= 0 && normY <= 1);
      return { x: sx, y: sy, insideEye: inside };
    });
  }

  // simple hover pulse on menu bar driven by the 2D center gaze as feedback
  if (menuMesh && menuMesh.visible) {
    // nothing here for now; UI pulse handled in material/emissive if desired
  }
}

function clamp(v, a, b){ return Math.max(a, Math.min(b, v)); }

// expose a small API for the index.html main script
export function onWindowResize(){
  if (!renderer) return;
  renderer.setSize(window.innerWidth, window.innerHeight);
  perspectiveBase.aspect = window.innerWidth / window.innerHeight;
  perspectiveBase.updateProjectionMatrix();
  if (rt) {
    const s = Math.max(512, Math.min(2048, Math.floor(Math.max(window.innerWidth, window.innerHeight) * (window.devicePixelRatio || 1))));
    rt.setSize(s, s);
  }
}

export function toggleMenuFromInput() { toggleMenu(); }
export function setMenuScalePublic(s) { setMenuScale(s); }

export { toggleMenu, setMenuScalePublic as setMenuScale };
export default {
  initMenuRendering,
  onWindowResize,
  toggleMenu
};
