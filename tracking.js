// tracking.js (module)
import * as THREE from 'https://unpkg.com/three@0.159.0/build/three.module.js';
import { initHands, stopHands } from './hands.js';

// UI elements
const startBtn = document.getElementById('startBtn');
const controls = document.getElementById('controls');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const fovSlider = document.getElementById('fovSlider');
const fovVal = document.getElementById('fovVal');
const portraitOverlay = document.getElementById('portraitOverlay');
const hint = document.getElementById('hint');
const leftWin = document.getElementById('leftWin');
const rightWin = document.getElementById('rightWin');
const videoLeft = document.getElementById('videoLeft');
const videoRight = document.getElementById('videoRight');
const overlay = document.getElementById('overlay');
const debugLog = document.getElementById('debugLog');

let uiHideTimer = null;
const UI_HIDE_MS = 10000;
function showUI(){ controls.style.display='flex'; controls.classList.remove('hidden'); fullscreenBtn.style.display='block'; resetUIHideTimer(); }
function hideUI(){ controls.classList.add('hidden'); fullscreenBtn.style.display='none'; }
function resetUIHideTimer(){ if(uiHideTimer) clearTimeout(uiHideTimer); uiHideTimer = setTimeout(()=>{ hideUI(); }, UI_HIDE_MS); }

window.addEventListener('pointermove', ()=> resetUIHideTimer(), { passive:true });
controls.addEventListener('pointerdown', ()=> showUI());

/* orientation + 3DOF helpers */
const zee = new THREE.Vector3(0,0,1);
const qPortraitToThree = new THREE.Quaternion(-Math.sqrt(0.5),0,0,Math.sqrt(0.5));
let deviceQuat = new THREE.Quaternion();
let deviceOrientationEnabled = false;
function getScreenOrientationDeg(){ if (screen && screen.orientation && typeof screen.orientation.angle === 'number') return screen.orientation.angle; return window.orientation || 0; }
function setObjectQuaternionFromSensor(quatOut, alpha, beta, gamma){
  const orient = getScreenOrientationDeg(); const deg = Math.PI/180;
  const e = new THREE.Euler((beta||0)*deg, (alpha||0)*deg, -(gamma||0)*deg, 'YXZ');
  quatOut.setFromEuler(e);
  let baseRot = new THREE.Quaternion();
  if (orient === 90) baseRot.setFromAxisAngle(zee, -Math.PI/2);
  else if (orient === -90 || orient === 270) baseRot.setFromAxisAngle(zee, Math.PI/2);
  else if (orient === 180) baseRot.setFromAxisAngle(zee, Math.PI);
  quatOut.multiply(qPortraitToThree);
  quatOut.multiply(baseRot);
  const ex = new THREE.Euler().setFromQuaternion(quatOut,'YXZ'); ex.z = 0; quatOut.setFromEuler(ex);
}
async function enableDeviceOrientation(){
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function'){
    try{
      const perm = await DeviceOrientationEvent.requestPermission();
      if (perm === 'granted') window.addEventListener('deviceorientation', ev=>{ deviceOrientationEnabled=true; setObjectQuaternionFromSensor(deviceQuat, ev.alpha, ev.beta, ev.gamma); }, true);
      else window.addEventListener('deviceorientation', ev=>{ deviceOrientationEnabled=true; setObjectQuaternionFromSensor(deviceQuat, ev.alpha, ev.beta, ev.gamma); }, true);
    }catch(e){ window.addEventListener('deviceorientation', ev=>{ deviceOrientationEnabled=true; setObjectQuaternionFromSensor(deviceQuat, ev.alpha, ev.beta, ev.gamma); }, true); }
  } else window.addEventListener('deviceorientation', ev=>{ deviceOrientationEnabled=true; setObjectQuaternionFromSensor(deviceQuat, ev.alpha, ev.beta, ev.gamma); }, true);
}

/* camera selection and preferred resolution */
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
  const fpss = [60,30];
  for (const r of tryRes){
    for (const f of fpss){
      try{
        const constraints = deviceId
          ? { video:{ deviceId:{ exact: deviceId }, width:{ ideal: r.w }, height:{ ideal: r.h }, frameRate:{ ideal: f } }, audio:false }
          : { video:{ facingMode:{ ideal: 'environment' }, width:{ ideal: r.w }, height:{ ideal: r.h }, frameRate:{ ideal: f } }, audio:false };
        const s = await navigator.mediaDevices.getUserMedia(constraints);
        return s;
      }catch(e){ /* try next */ }
    }
  }
  return navigator.mediaDevices.getUserMedia({ video:true, audio:false });
}

/* main state */
let stream = null;
let eyeScalePct = parseFloat(fovSlider.value);
fovVal.textContent = Math.round(eyeScalePct) + '%';
const MENU_DISTANCE = 1.4;
const FIXED_IPD = 0.064;

/* three overlay scene + single-pass optimization (render scene3D once to RT then blit to both eye viewports) */
let renderer, scene3D, perspectiveBase, camLeft, camRight, rtScene;
let menuMesh = null, menuBar = null;
let palmIndicator = null; // small sphere indicating palm intersection
let inputHandsActive = false;

function initThreeOverlay(){
  renderer = new THREE.WebGLRenderer({ canvas: overlay, antialias:true, alpha:true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.autoClear = false;

  scene3D = new THREE.Scene();
  scene3D.add(new THREE.AmbientLight(0xffffff, 0.9));
  const dl = new THREE.DirectionalLight(0xffffff, 0.25); dl.position.set(1,2,2); scene3D.add(dl);

  perspectiveBase = new THREE.PerspectiveCamera(70, window.innerWidth/window.innerHeight, 0.01, 1000);
  camLeft = perspectiveBase.clone();
  camRight = perspectiveBase.clone();

  // Menu geometry (bigger by default)
  const boxG = new THREE.BoxGeometry(0.9, 0.6, 0.02); // larger (like 25" at 1m)
  const boxM = new THREE.MeshStandardMaterial({ color:0x1f6feb, roughness:0.45, metalness:0.05, emissive:0x001020 });
  menuMesh = new THREE.Mesh(boxG, boxM);
  menuMesh.visible = false;
  scene3D.add(menuMesh);

  const barG = new THREE.BoxGeometry(0.4, 0.04, 0.002);
  const barM = new THREE.MeshStandardMaterial({ color:0xffffff, transparent:true, opacity:0.9 });
  menuBar = new THREE.Mesh(barG, barM);
  menuBar.position.set(0, - (0.6/2 + 0.04/2 + 0.01), 0.012);
  menuMesh.add(menuBar);

  // palm indicator (small white dot)
  const pG = new THREE.SphereGeometry(0.01, 12, 12);
  const pM = new THREE.MeshBasicMaterial({ color:0xffffff });
  palmIndicator = new THREE.Mesh(pG, pM);
  palmIndicator.visible = false;
  scene3D.add(palmIndicator);

  // render target for single-pass
  const dpr = Math.max(1, Math.floor(window.devicePixelRatio || 1));
  const rtW = Math.min(2048, Math.max(256, Math.floor(window.innerWidth * dpr)));
  const rtH = Math.min(2048, Math.max(256, Math.floor(window.innerHeight * dpr)));
  rtScene = new THREE.WebGLRenderTarget(rtW, rtH, { minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter, format:THREE.RGBAFormat });

  window.addEventListener('resize', onWindowResize);
  layoutEyes();
  updatePortrait();
  animate();
}

/* menu spawn/hide (world-locked in 3DOF) */
function spawnMenu(){
  const forward = new THREE.Vector3(0,0,-1);
  if (deviceOrientationEnabled) forward.applyQuaternion(deviceQuat);
  const spawnPos = forward.clone().multiplyScalar(MENU_DISTANCE);
  menuMesh.position.copy(spawnPos);
  const toCam = new THREE.Vector3(0,0,0).sub(menuMesh.position); toCam.y = 0;
  menuMesh.lookAt(menuMesh.position.clone().add(toCam));
  menuMesh.up.set(0,1,0);
  menuMesh.scale.setScalar(eyeScalePct / 70);
  menuMesh.visible = true;
  popScale(menuMesh, menuMesh.scale.x, 220);
}
function hideMenu(){ shrinkHide(menuMesh, 160); }

/* easing helpers */
function popScale(obj, target=1, dur=220){
  const start = performance.now();
  const sx = obj.scale.x;
  function step(now){
    const t = Math.min(1, (now - start) / dur);
    const e = 1 - Math.pow(1 - t, 3);
    const v = sx + (target - sx) * e;
    obj.scale.set(v, v, v);
    if (t < 1) requestAnimationFrame(step);
  }
  requestAnimationFrame(step);
}
function shrinkHide(obj, dur=160){
  const start = performance.now(); const sx = obj.scale.x;
  function step(now){
    const t = Math.min(1, (now - start) / dur);
    const e = Math.pow(1 - t, 2);
    obj.scale.set(sx * e, sx * e, sx * e);
    if (t < 1) requestAnimationFrame(step);
    else { obj.visible = false; obj.scale.set(sx, sx, sx); }
  }
  requestAnimationFrame(step);
}

/* compute eye layout: center vertically (so smaller windows move toward center) */
function layoutEyes(){
  const scale = Math.max(0.3, Math.min(1.0, eyeScalePct/100));
  let eyeH = Math.round(window.innerHeight * scale);
  let eyeW = Math.floor(eyeH * 1.5);
  let gap = Math.max(8, Math.round(eyeW * 0.06));
  if (eyeW * 2 + gap > window.innerWidth){
    const avail = window.innerWidth - gap;
    eyeW = Math.floor(avail / 2);
    eyeH = Math.floor(eyeW * 2 / 3);
  }
  document.documentElement.style.setProperty('--eye-w', eyeW + 'px');
  document.documentElement.style.setProperty('--eye-h', eyeH + 'px');
  document.documentElement.style.setProperty('--gap', gap + 'px');
}

/* portrait overlay behavior */
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
window.addEventListener('resize', ()=>{ layoutEyes(); updatePortrait(); if (renderer) { renderer.setSize(window.innerWidth, window.innerHeight); perspectiveBase.aspect = window.innerWidth/window.innerHeight; perspectiveBase.updateProjectionMatrix(); } });

/* top tap reveals UI */
window.addEventListener('pointerdown', (ev)=>{ if (ev.clientY <= 140) showUI(); });

/* double-tap toggle menu */
let lastTap = 0;
window.addEventListener('pointerdown', (ev)=>{
  const now = Date.now();
  if (now - lastTap < 300){
    if (!menuMesh) return;
    if (!menuMesh.visible) spawnMenu(); else hideMenu();
  }
  lastTap = now;
  resetUIHideTimer();
});

/* fullscreen toggle */
fullscreenBtn.addEventListener('click', ()=>{ if (!document.fullscreenElement) document.documentElement.requestFullscreen(); else document.exitFullscreen(); resetUIHideTimer(); });

/* FOV slider */
fovSlider.addEventListener('input', ()=>{ eyeScalePct = parseFloat(fovSlider.value); fovVal.textContent = Math.round(eyeScalePct) + '%'; layoutEyes(); if (menuMesh) menuMesh.scale.setScalar(eyeScalePct/70); resetUIHideTimer(); });

/* animate - single pass: render scene3D once to RT, then blit RT to each eye's DOM bounds.
   This saves cost compared to rendering full scene twice. */
function animate(){
  requestAnimationFrame(animate);
  if (!renderer) return;

  if (deviceOrientationEnabled) perspectiveBase.quaternion.copy(deviceQuat);
  else perspectiveBase.quaternion.identity();

  // update palm indicator smoothing applied by hands.js callback (it calls setPalmWorld)
  // Render scene3D into render target (single pass)
  renderer.setRenderTarget(rtScene);
  renderer.clear(true, true, true);
  renderer.render(scene3D, perspectiveBase);
  renderer.setRenderTarget(null);

  // compute DOM rectangles for eye windows
  const leftRect = leftWin.getBoundingClientRect();
  const rightRect = rightWin.getBoundingClientRect();
  // convert client rect to GL viewport coordinates (origin bottom-left)
  const leftViewportY = window.innerHeight - leftRect.top - leftRect.height;
  const rightViewportY = window.innerHeight - rightRect.top - rightRect.height;

  // draw RT texture into left viewport
  renderer.setScissorTest(true);
  renderer.setScissor(leftRect.left, leftViewportY, leftRect.width, leftRect.height);
  renderer.setViewport(leftRect.left, leftViewportY, leftRect.width, leftRect.height);
  // draw fullscreen quad sampling rtScene.texture
  blitRenderTargetToScreen(rtScene.texture);

  // right
  renderer.setScissor(rightRect.left, rightViewportY, rightRect.width, rightRect.height);
  renderer.setViewport(rightRect.left, rightViewportY, rightRect.width, rightRect.height);
  blitRenderTargetToScreen(rtScene.texture);

  renderer.setScissorTest(false);
}

/* helper: draw render-target texture to screen using a simple scene/quad — created lazily */
let blitScene = null, blitCamera = null, blitMesh = null;
function blitRenderTargetToScreen(tex){
  if (!blitScene){
    blitScene = new THREE.Scene();
    blitCamera = new THREE.OrthographicCamera(-1,1,1,-1,0,1);
    const mat = new THREE.MeshBasicMaterial({ map: tex });
    const quad = new THREE.PlaneGeometry(2,2);
    blitMesh = new THREE.Mesh(quad, mat);
    blitMesh.frustumCulled = false;
    blitScene.add(blitMesh);
  } else {
    blitMesh.material.map = tex;
    blitMesh.material.needsUpdate = true;
  }
  renderer.clearDepth();
  renderer.render(blitScene, blitCamera);
}

/* palm -> world helper (called by hands.js when palm candidate is found)
   palmNorm: {x:0..1, y:0..1} (origin top-left)
   confidence: 0..1
*/
function setPalmWorld(palmNorm, confidence){
  if (!palmIndicator) return;
  if (!confidence || confidence < 0.2){ palmIndicator.visible = false; return; }
  // convert normalized screen coordinates to NDC (-1..1)
  const ndc = new THREE.Vector2((palmNorm.x)*2 - 1, - (palmNorm.y)*2 + 1);
  // project a point at MENU_DISTANCE in front of camera where ndc maps to
  const worldPos = ndcToWorld(ndc.x, ndc.y, MENU_DISTANCE, perspectiveBase);
  palmIndicator.position.copy(worldPos);
  palmIndicator.visible = true;
}

/* convert NDC to world point at given distance (camera-based) */
function ndcToWorld(ndcX, ndcY, distance, cam){
  // Create a vector in clip space then unproject
  const v = new THREE.Vector3(ndcX, ndcY, 0.5);
  // unproject at z=0.5 then compute direction
  v.unproject(cam);
  const camPos = new THREE.Vector3().setFromMatrixPosition(cam.matrixWorld);
  const dir = v.clone().sub(camPos).normalize();
  return camPos.clone().add(dir.multiplyScalar(distance));
}

/* hand callbacks to pass to hands.js */
function onPalmDetected(palmNorm, confidence){
  // palmNorm = {x:0..1, y:0..1}
  setPalmWorld(palmNorm, confidence);
}

/* start flow */
startBtn.addEventListener('click', async ()=>{
  startBtn.style.display='none';
  await enableDeviceOrientation();

  try{
    stream = await startCameraStream();
    // attach same stream to both videos
    videoLeft.srcObject = stream;
    videoRight.srcObject = stream;
    // try to play
    try { await videoLeft.play(); } catch(e) { console.warn('videoLeft play blocked', e); }
    try { await videoRight.play(); } catch(e) { console.warn('videoRight play blocked', e); }

    // reveal controls
    controls.style.display='flex';
    fullscreenBtn.style.display='block';
    layoutEyes();
    updatePortrait();

    // init three overlay and hands
    initThreeOverlay();

    // initialize hands pipeline (hands.js) and pass a callback
    try {
      await initHands(stream, onPalmDetected);
      inputHandsActive = true;
    } catch(e){
      console.warn('hands init failed', e);
      inputHandsActive = false;
    }
  }catch(err){
    console.error('camera start failed', err);
    alert('Camera access failed: ' + (err && err.message ? err.message : err));
    startBtn.style.display='block';
  }
});

/* stop flow (not currently invoked, but provided) */
export async function stopAll(){
  if (stream){
    const tracks = stream.getTracks();
    for (const t of tracks) t.stop();
    stream = null;
  }
  if (inputHandsActive) stopHands();
}

/* initial layout */
layoutEyes();
updatePortrait();

