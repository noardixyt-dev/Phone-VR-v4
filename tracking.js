// tracking.js
// Put this file in same folder as index.html
// Loads after index.html. Exports a small API used by hands.js (window.App3D.*)

import { HandIntegration } from './hands.js'; // hands.js exports HandIntegration as a named export

// UI & DOM
const startBtn = document.getElementById('startBtn');
const controls = document.getElementById('controls');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const fovSlider = document.getElementById('fovSlider');
const fovVal = document.getElementById('fovVal');
const leftWin = document.getElementById('leftWin');
const rightWin = document.getElementById('rightWin');
const videoLeft = document.getElementById('videoLeft');
const videoRight = document.getElementById('videoRight');
const overlay = document.getElementById('overlay');
const portraitOverlay = document.getElementById('portraitOverlay');
const debugLog = document.getElementById('debugLog');

let eyeScalePct = parseFloat(fovSlider.value);
fovVal.textContent = Math.round(eyeScalePct) + '%';
let uiHideTimer = null;
const UI_HIDE_MS = 10000;

function showUI(){ controls.style.display='flex'; controls.classList.remove('hidden'); fullscreenBtn.style.display='block'; resetUIHideTimer(); }
function hideUI(){ controls.classList.add('hidden'); fullscreenBtn.style.display='none'; }
function resetUIHideTimer(){ if (uiHideTimer) clearTimeout(uiHideTimer); uiHideTimer = setTimeout(()=>{ hideUI(); }, UI_HIDE_MS); }

window.addEventListener('pointermove', ()=> resetUIHideTimer(), { passive:true });
controls.addEventListener('pointerdown', ()=> showUI());

// orientation helpers (landscape calibrated + remove roll)
const zee = new THREE.Vector3(0,0,1);
const qPortraitToThree = new THREE.Quaternion(-Math.sqrt(0.5),0,0,Math.sqrt(0.5));
let deviceQuat = new THREE.Quaternion();
let deviceOrientationEnabled = false;

function getScreenOrientationDeg(){ if (screen && screen.orientation && typeof screen.orientation.angle === 'number') return screen.orientation.angle; return window.orientation || 0; }
function setObjectQuaternionFromSensor(quatOut, alpha, beta, gamma){
  const orient = getScreenOrientationDeg(); const deg = Math.PI/180;
  const euler = new THREE.Euler((beta||0)*deg,(alpha||0)*deg,-(gamma||0)*deg,'YXZ');
  quatOut.setFromEuler(euler);
  let baseRot = new THREE.Quaternion();
  if(orient===90) baseRot.setFromAxisAngle(zee,-Math.PI/2);
  else if(orient===-90||orient===270) baseRot.setFromAxisAngle(zee,Math.PI/2);
  else if(orient===180) baseRot.setFromAxisAngle(zee,Math.PI);
  quatOut.multiply(qPortraitToThree);
  quatOut.multiply(baseRot);
  const ex = new THREE.Euler().setFromQuaternion(quatOut,'YXZ'); ex.z = 0; quatOut.setFromEuler(ex);
}
async function enableDeviceOrientation(){
  if(typeof DeviceOrientationEvent!=='undefined' && typeof DeviceOrientationEvent.requestPermission==='function'){
    try{
      const perm = await DeviceOrientationEvent.requestPermission();
      if(perm==='granted'){
        window.addEventListener('deviceorientation', ev=>{ deviceOrientationEnabled=true; setObjectQuaternionFromSensor(deviceQuat, ev.alpha, ev.beta, ev.gamma); }, true);
      } else {
        window.addEventListener('deviceorientation', ev=>{ deviceOrientationEnabled=true; setObjectQuaternionFromSensor(deviceQuat, ev.alpha, ev.beta, ev.gamma); }, true);
      }
    }catch(e){
      window.addEventListener('deviceorientation', ev=>{ deviceOrientationEnabled=true; setObjectQuaternionFromSensor(deviceQuat, ev.alpha, ev.beta, ev.gamma); }, true);
    }
  } else {
    window.addEventListener('deviceorientation', ev=>{ deviceOrientationEnabled=true; setObjectQuaternionFromSensor(deviceQuat, ev.alpha, ev.beta, ev.gamma); }, true);
  }
}

// camera device selection helpers
async function enumerateVideoInputs(){ try{ const devs = await navigator.mediaDevices.enumerateDevices(); return devs.filter(d=>d.kind==='videoinput'); }catch(e){ return []; } }
async function chooseRearDeviceId(){
  const cams = await enumerateVideoInputs();
  for (const c of cams){
    const L=(c.label||'').toLowerCase();
    if (L.includes('back')||L.includes('rear')||L.includes('environment')||L.includes('main')||L.includes('wide')) return c.deviceId;
  }
  for (const c of cams){
    const L=(c.label||'').toLowerCase();
    if (!L.includes('front') && !L.includes('selfie')) return c.deviceId;
  }
  return cams.length ? cams[0].deviceId : null;
}

async function startCameraStream(){
  const deviceId = await chooseRearDeviceId();
  const tryRes = [{w:3840,h:2160},{w:1920,h:1080},{w:1280,h:720}];
  const fps = [60,30];
  for (const r of tryRes){
    for (const f of fps){
      try{
        const constraints = deviceId
          ? { video:{ deviceId:{ exact: deviceId }, width:{ ideal: r.w }, height:{ ideal: r.h }, frameRate:{ ideal: f } }, audio:false }
          : { video:{ facingMode:{ ideal:'environment' }, width:{ ideal: r.w }, height:{ ideal: r.h }, frameRate:{ ideal: f } }, audio:false };
        const s = await navigator.mediaDevices.getUserMedia(constraints);
        return s;
      }catch(e){
        // try next
      }
    }
  }
  return navigator.mediaDevices.getUserMedia({ video:true, audio:false });
}

// Start flow: when start button is pressed, request orientation permission and camera, then init renderer/three and hands
startBtn.addEventListener('click', async ()=>{
  startBtn.style.display='none';
  await enableDeviceOrientation();
  showUI();
  try{
    const s = await startCameraStream();
    videoLeft.srcObject = s;
    videoRight.srcObject = s;
    // try play (some browsers require user gesture — start button qualifies)
    try { await videoLeft.play(); } catch(e){ console.warn('left play blocked', e); }
    try { await videoRight.play(); } catch(e){ console.warn('right play blocked', e); }
    // init 3D overlay & hands integration
    initThreeOverlay(s);
    // start hands integration
    HandIntegration.start({ videoElement: videoRight /* feed one video to mediapipe pipeline */ , onPinch: handlePinch, onPalmPoint: handlePalmPoint });
  }catch(err){
    console.error('camera start failed', err);
    alert('Camera access failed: ' + (err && err.message ? err.message : err));
    startBtn.style.display='block';
  }
});

// fullscreen
fullscreenBtn.addEventListener('click', ()=> {
  if(!document.fullscreenElement) document.documentElement.requestFullscreen();
  else document.exitFullscreen();
  resetUIHideTimer();
});

// FOV slider
fovSlider.addEventListener('input', ()=> {
  eyeScalePct = parseFloat(fovSlider.value);
  fovVal.textContent = Math.round(eyeScalePct) + '%';
  layoutEyes();
  // scale menu accordingly if visible
  if(menuMesh && menuMesh.visible){
    const s = eyeScalePct / 70;
    menuMesh.scale.setScalar(s * baseMenuScale);
  }
  resetUIHideTimer();
});

// layout eyes bottom-anchored, grow upward — bottom stays fixed, top moves
function layoutEyes(){
  const scale = Math.max(0.3, Math.min(1.0, eyeScalePct/100));
  let eyeH = Math.round(window.innerHeight * scale);
  let eyeW = Math.floor(eyeH * 1.5);
  let gap = Math.max(8, Math.round(eyeW * 0.06));
  if (eyeW * 2 + gap > window.innerWidth){
    const avail = window.innerWidth - gap;
    eyeW = Math.floor(avail/2);
    eyeH = Math.floor(eyeW * 2/3);
  }
  document.documentElement.style.setProperty('--eye-w', eyeW + 'px');
  document.documentElement.style.setProperty('--eye-h', eyeH + 'px');
  document.documentElement.style.setProperty('--gap', gap + 'px');
}

// portrait overlay logic
function updatePortrait(){
  if (window.innerHeight > window.innerWidth){
    portraitOverlay.style.display = 'flex';
    controls.classList.add('hidden');
    fullscreenBtn.style.display='none';
  } else {
    portraitOverlay.style.display = 'none';
    if (!controls.classList.contains('hidden')) controls.style.display='flex';
    if (controls.style.display !== 'none') fullscreenBtn.style.display='block';
  }
}
window.addEventListener('resize', ()=>{ layoutEyes(); updatePortrait(); if(renderer){ renderer.setSize(window.innerWidth, window.innerHeight); perspectiveBase.aspect = window.innerWidth / window.innerHeight; perspectiveBase.updateProjectionMatrix(); } });
layoutEyes();
updatePortrait();

/* ------------------- Three.js overlay & menu ------------------- */
let renderer, scene3D, perspectiveBase, camLeft, camRight;
let menuMesh = null;
let menuBar = null;
let baseMenuScale = 1.0;
const FIXED_IPD = 0.064;
const MENU_DISTANCE = 1.4;

function initThreeOverlay(stream){
  // overlay canvas
  renderer = new THREE.WebGLRenderer({ canvas: overlay, antialias:true, alpha:true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.autoClear = false;

  scene3D = new THREE.Scene();
  scene3D.add(new THREE.AmbientLight(0xffffff, 0.8));
  const dl = new THREE.DirectionalLight(0xffffff, 0.25); dl.position.set(1,2,2); scene3D.add(dl);

  perspectiveBase = new THREE.PerspectiveCamera(70, window.innerWidth/window.innerHeight, 0.01, 1000);
  camLeft = perspectiveBase.clone();
  camRight = perspectiveBase.clone();

  // menu geometry
  const boxG = new THREE.BoxGeometry(0.8, 0.45, 0.02); // a bit bigger by default
  const boxM = new THREE.MeshStandardMaterial({ color:0x1f6feb, roughness:0.5, metalness:0.05, emissive:0x001030 });
  menuMesh = new THREE.Mesh(boxG, boxM);
  menuMesh.visible = false;
  scene3D.add(menuMesh);

  const barG = new THREE.BoxGeometry(0.6, 0.04, 0.002);
  const barM = new THREE.MeshStandardMaterial({ color:0xffffff, transparent:true, opacity:0.9 });
  menuBar = new THREE.Mesh(barG, barM);
  menuBar.position.set(0, - (0.45/2 + 0.04/2 + 0.01), 0.012);
  menuMesh.add(menuBar);

  // pointer/tap handling for double tap to toggle menu
  let lastTap = 0;
  window.addEventListener('pointerdown', (ev)=>{
    const now = Date.now();
    if (now - lastTap < 300){ toggleMenu(); }
    lastTap = now;
    resetUIHideTimer();
  });

  requestAnimationFrame(renderLoop);
}

// toggle menu spawn/hide (world-locked)
function toggleMenu(){
  if(!menuMesh) return;
  if(!menuMesh.visible){
    spawnMenu();
  } else {
    hideMenu();
  }
}
function spawnMenu(){
  const forward = new THREE.Vector3(0,0,-1);
  if(deviceOrientationEnabled) forward.applyQuaternion(deviceQuat);
  const spawnPos = forward.clone().multiplyScalar(MENU_DISTANCE);
  menuMesh.position.copy(spawnPos);
  // face horizontally to camera (no pitch)
  const toCam = new THREE.Vector3().subVectors(new THREE.Vector3(0,0,0), menuMesh.position);
  toCam.y = 0;
  menuMesh.lookAt(menuMesh.position.clone().add(toCam));
  menuMesh.up.set(0,1,0);
  baseMenuScale = Math.max(0.7, eyeScalePct/70); // scale menu relative to FOV
  menuMesh.scale.setScalar(0.001);
  menuMesh.visible = true;
  popScale(menuMesh, baseMenuScale, 220);
}
function hideMenu(){ shrinkHide(menuMesh, 160); }

// easing helpers
function popScale(obj, target=1, dur=220){
  const start = performance.now();
  const s0 = obj.scale.x;
  function step(now){
    const t = Math.min(1, (now - start)/dur);
    const e = 1 - Math.pow(1 - t, 3);
    const v = s0 + (target - s0) * e;
    obj.scale.setScalar(v);
    if(t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
function shrinkHide(obj, dur=160){
  const start = performance.now(); const s0 = obj.scale.x;
  function step(now){
    const t = Math.min(1, (now - start)/dur);
    const e = Math.pow(1 - t, 2);
    obj.scale.setScalar(s0 * e);
    if(t < 1) requestAnimationFrame(step);
    else { obj.visible = false; obj.scale.setScalar(s0); }
  }
  requestAnimationFrame(step);
}

/* Hand hooks (called from hands.js) */
function handlePalmPoint(palmScreenPosNormalized){
  // palmScreenPosNormalized: {x: 0..1, y:0..1} in screen pixels (0,0 top-left)
  // compute world point at menu distance by unprojecting ray from center camera
  if(!perspectiveBase) return;
  const sx = palmScreenPosNormalized.x;
  const sy = palmScreenPosNormalized.y;
  // convert to NDC
  const ndc = new THREE.Vector2((sx/window.innerWidth)*2 - 1, - (sy/window.innerHeight)*2 + 1);
  const ray = new THREE.Raycaster();
  ray.setFromCamera(ndc, camLeft); // camLeft is oriented same as base for world-locked menu
  const worldPoint = ray.ray.at(MENU_DISTANCE, new THREE.Vector3());
  // for debug we could show a small sphere; hands.js handles the palm dot drawing for now
  // If menu is visible & pinch active & palm near menu we allow drag (handled by hands module via onPinch)
}

function handlePinch(state){
  // state: {pinch: true/false, palm: {x,y}, worldPoint: THREE.Vector3 (optional)}
  // If pinch start and pointing near menuBar, begin moving menu with pointer in hands.js logic
  // hands.js will call App3D.startDrag(worldPoint) / App3D.updateDrag(worldPoint) / App3D.endDrag()
  if(state.pinch && state.worldPoint && menuMesh && menuMesh.visible){
    // is the worldPoint near menu? do distance check
    const d = state.worldPoint.distanceTo(menuMesh.position);
    if(d < 1.2){
      window.App3D.startDrag(state.worldPoint);
      return;
    }
  }
  if(!state.pinch){
    window.App3D.endDrag();
  }
}

/* simple API for hands.js to move the menu */
let dragging = false;
let dragOffset = new THREE.Vector3();
window.App3D = {
  startDrag(worldPoint){
    if(!menuMesh) return;
    dragging = true;
    dragOffset.copy(menuMesh.position).sub(worldPoint);
  },
  updateDrag(worldPoint){
    if(!dragging || !menuMesh) return;
    menuMesh.position.copy(worldPoint.clone().add(dragOffset));
  },
  endDrag(){
    dragging = false;
  }
};

/* render loop (single pass rendered once per frame, then drawn as overlay inside eye windows via CSS video elements)
   We'll render scene3D for each eye in the overlay area — to keep menu alignment consistent across eyes we:
   - update perspectiveBase from deviceQuat (3DOF)
   - compute camLeft/right from base
   - render scene3D using camLeft and camRight scissored to eye bounding rects
*/
function renderLoop(){
  requestAnimationFrame(renderLoop);
  if(!renderer || !scene3D) return;

  // update camera orientation from deviceQuat
  if(deviceOrientationEnabled) perspectiveBase.quaternion.copy(deviceQuat);
  else perspectiveBase.quaternion.identity();

  // ensure eye rectangles are updated
  const leftRect = leftWin.getBoundingClientRect();
  const rightRect = rightWin.getBoundingClientRect();
  const leftViewportY = window.innerHeight - leftRect.top - leftRect.height;

  renderer.setScissorTest(true);

  // left eye
  renderer.setScissor(leftRect.left, leftViewportY, leftRect.width, leftRect.height);
  renderer.setViewport(leftRect.left, leftViewportY, leftRect.width, leftRect.height);
  renderer.clear();
  camLeft.position.set(-FIXED_IPD/2, 0, 0);
  camLeft.quaternion.copy(perspectiveBase.quaternion);
  camLeft.updateMatrixWorld();
  renderer.clearDepth();
  renderer.render(scene3D, camLeft);

  // right eye
  const rightViewportY = window.innerHeight - rightRect.top - rightRect.height;
  renderer.setScissor(rightRect.left, rightViewportY, rightRect.width, rightRect.height);
  renderer.setViewport(rightRect.left, rightViewportY, rightRect.width, rightRect.height);
  camRight.position.set(FIXED_IPD/2, 0, 0);
  camRight.quaternion.copy(perspectiveBase.quaternion);
  camRight.updateMatrixWorld();
  renderer.clearDepth();
  renderer.render(scene3D, camRight);

  renderer.setScissorTest(false);
}

// top tap reveals UI
window.addEventListener('pointerdown', (ev)=>{ if (ev.clientY <= 120) showUI(); });

// remove debug log on load (user requested)
debugLog.style.display = 'none';

// expose a small API for hands module to call back
export const ThreeBridge = {
  getPerspectiveCamera: ()=> perspectiveBase,
  getCamLeft: ()=> camLeft,
  getCamRight: ()=> camRight,
  getRenderer: ()=> renderer,
  getMenuMesh: ()=> menuMesh,
  app3d: window.App3D,
  setDeviceOrientationEnabled: (v)=> { deviceOrientationEnabled = v; },
  setDeviceQuaternion: (q)=> { deviceQuat.copy(q); }
};
