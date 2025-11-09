// tracking.js
// Single-pass menu rendering + WebXR 6DOF attempt.
// Requires three.js loaded by index.html and hands.js module present (hands.js will call exported functions).
import { HandModule } from './hands.js'; // hand module exports a start() function

/* DOM */
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

/* orientation helpers */
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
  if (orient === 90) baseRot.setFromAxisAngle(zee, -Math.PI/2);
  else if (orient === -90 || orient === 270) baseRot.setFromAxisAngle(zee, Math.PI/2);
  else if (orient === 180) baseRot.setFromAxisAngle(zee, Math.PI);
  quatOut.multiply(qPortraitToThree);
  quatOut.multiply(baseRot);
  const ex = new THREE.Euler().setFromQuaternion(quatOut, 'YXZ'); ex.z = 0; quatOut.setFromEuler(ex);
}
async function enableDeviceOrientation(){
  if (typeof DeviceOrientationEvent !== 'undefined' && typeof DeviceOrientationEvent.requestPermission === 'function'){
    try{
      const perm = await DeviceOrientationEvent.requestPermission();
      if (perm === 'granted') window.addEventListener('deviceorientation', ev=>{ deviceOrientationEnabled=true; setObjectQuaternionFromSensor(deviceQuat, ev.alpha, ev.beta, ev.gamma); }, true);
      else window.addEventListener('deviceorientation', ev=>{ deviceOrientationEnabled=true; setObjectQuaternionFromSensor(deviceQuat, ev.alpha, ev.beta, ev.gamma); }, true);
    }catch(e){ window.addEventListener('deviceorientation', ev=>{ deviceOrientationEnabled=true; setObjectQuaternionFromSensor(deviceQuat, ev.alpha, ev.beta, ev.gamma); }, true); }
  } else {
    window.addEventListener('deviceorientation', ev=>{ deviceOrientationEnabled=true; setObjectQuaternionFromSensor(deviceQuat, ev.alpha, ev.beta, ev.gamma); }, true);
  }
}

/* camera helpers */
async function enumerateVideoInputs(){ try{ const devs = await navigator.mediaDevices.enumerateDevices(); return devs.filter(d=>d.kind==='videoinput'); }catch(e){ return []; } }
async function chooseRearDeviceId(){
  const cams = await enumerateVideoInputs();
  for(const c of cams){
    const L=(c.label||'').toLowerCase();
    if(L.includes('back')||L.includes('rear')||L.includes('environment')||L.includes('main')||L.includes('wide')) return c.deviceId;
  }
  for(const c of cams){
    const L=(c.label||'').toLowerCase();
    if(!L.includes('front') && !L.includes('selfie')) return c.deviceId;
  }
  return cams.length?cams[0].deviceId:null;
}
async function startCameraStream(){
  const deviceId = await chooseRearDeviceId();
  const tryRes = [{w:3840,h:2160},{w:1920,h:1080},{w:1280,h:720}];
  const fps = [60,30];
  for(const r of tryRes){
    for(const f of fps){
      try{
        const constraints = deviceId
          ? { video:{ deviceId:{ exact: deviceId }, width:{ ideal: r.w }, height:{ ideal: r.h }, frameRate:{ ideal: f } }, audio:false }
          : { video:{ facingMode:{ ideal: 'environment' }, width:{ ideal: r.w }, height:{ ideal: r.h }, frameRate:{ ideal: f } }, audio:false };
        const s = await navigator.mediaDevices.getUserMedia(constraints);
        return s;
      }catch(e){}
    }
  }
  return navigator.mediaDevices.getUserMedia({ video:true, audio:false });
}

/* Start flow */
startBtn.addEventListener('click', async ()=>{
  startBtn.style.display='none';
  await enableDeviceOrientation();
  showUI();
  try{
    const stream = await startCameraStream();
    videoLeft.srcObject = stream;
    videoRight.srcObject = stream;
    try { await videoLeft.play(); } catch(e){ console.warn('left play blocked', e); }
    try { await videoRight.play(); } catch(e){ console.warn('right play blocked', e); }
    // init 3D overlay and WebXR attempt
    await initThreeAndXR();
    // start hands (hand module will use videoRight for detection)
    HandModule.start({ videoElement: videoRight, onPalm: onPalmPoint, onPinch: onPinchState });
  }catch(err){
    console.error('camera start failed', err);
    alert('Camera access failed: ' + (err && err.message ? err.message : err));
    startBtn.style.display='block';
  }
});

/* fullscreen */
fullscreenBtn.addEventListener('click', ()=> {
  if(!document.fullscreenElement) document.documentElement.requestFullscreen();
  else document.exitFullscreen();
  resetUIHideTimer();
});

/* FOV slider */
fovSlider.addEventListener('input', ()=> {
  eyeScalePct = parseFloat(fovSlider.value);
  fovVal.textContent = Math.round(eyeScalePct) + '%';
  layoutEyes();
  if(menuMesh && menuMesh.visible){
    menuMesh.scale.setScalar((eyeScalePct/70) * baseMenuScale);
  }
  resetUIHideTimer();
});

/* layout eyes bottom-anchored, grow upward */
function layoutEyes(){
  const scale = Math.max(0.3, Math.min(1.0, eyeScalePct/100));
  let eyeH = Math.round(window.innerHeight * scale);
  let eyeW = Math.floor(eyeH * 1.5);
  let gap = Math.max(8, Math.round(eyeW * 0.06));
  if (eyeW * 2 + gap > window.innerWidth){
    const avail = window.innerWidth - gap;
    eyeW = Math.floor(avail / 2);
    eyeH = Math.floor(eyeW * 2/3);
  }
  document.documentElement.style.setProperty('--eye-w', eyeW + 'px');
  document.documentElement.style.setProperty('--eye-h', eyeH + 'px');
  document.documentElement.style.setProperty('--gap', gap + 'px');
}
function updatePortrait(){ if (window.innerHeight > window.innerWidth){ portraitOverlay.style.display='flex'; controls.classList.add('hidden'); fullscreenBtn.style.display='none'; } else { portraitOverlay.style.display='none'; if(!controls.classList.contains('hidden')) controls.style.display='flex'; if(controls.style.display !== 'none') fullscreenBtn.style.display='block'; } }
window.addEventListener('resize', ()=>{ layoutEyes(); updatePortrait(); if(renderer){ renderer.setSize(window.innerWidth, window.innerHeight); perspectiveBase.aspect = window.innerWidth/window.innerHeight; perspectiveBase.updateProjectionMatrix(); } });
layoutEyes(); updatePortrait();

/* -------------------- THREE + WebXR + single-pass menu -------------------- */
let renderer, scene3D, perspectiveBase, camLeft, camRight;
let menuMesh = null, menuBar = null;
let baseMenuScale = 1.0;
const FIXED_IPD = 0.064;
const MENU_DISTANCE = 1.4;

/* Single-pass render target & post scene */
let rtMenu = null;
let postScene = null, postCamera = null, postQuad = null;

async function initThreeAndXR(){
  // renderer -> overlay canvas
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

  // menu geometry slightly larger for readability
  const boxG = new THREE.BoxGeometry(1.2, 0.68, 0.02); // bigger; user wanted large menu
  const boxM = new THREE.MeshStandardMaterial({ color:0x1f6feb, roughness:0.5, metalness:0.05, emissive:0x001030 });
  menuMesh = new THREE.Mesh(boxG, boxM);
  menuMesh.visible = false;
  scene3D.add(menuMesh);

  const barG = new THREE.BoxGeometry(0.8, 0.04, 0.002);
  const barM = new THREE.MeshStandardMaterial({ color:0xffffff, transparent:true, opacity:0.9 });
  menuBar = new THREE.Mesh(barG, barM);
  menuBar.position.set(0, - (0.68/2 + 0.04/2 + 0.01), 0.012);
  menuMesh.add(menuBar);

  // render target for single-pass menu
  const rtW = Math.max(1024, Math.floor(window.innerWidth * 1.0));
  const rtH = Math.max(1024, Math.floor(window.innerHeight * 1.0));
  rtMenu = new THREE.WebGLRenderTarget(rtW, rtH, { minFilter:THREE.LinearFilter, magFilter:THREE.LinearFilter, format:THREE.RGBAFormat });

  // post scene to blit rt to screen (we render a screen-quad textured with rtMenu.texture)
  postScene = new THREE.Scene();
  postCamera = new THREE.OrthographicCamera(-1,1,1,-1,0,1);
  const quadGeo = new THREE.PlaneGeometry(2,2);
  const quadMat = new THREE.MeshBasicMaterial({ map: rtMenu.texture });
  postQuad = new THREE.Mesh(quadGeo, quadMat);
  postScene.add(postQuad);

  // Try WebXR immersive-ar for 6DOF if available
  if (navigator.xr && await navigator.xr.isSessionSupported && await navigator.xr.isSessionSupported('immersive-ar')){
    try {
      // request an XR session on user interaction; we'll prompt now
      const session = await navigator.xr.requestSession('immersive-ar', { requiredFeatures: ['local-floor'] });
      // set up XR WebGL binding
      renderer.xr.enabled = true;
      await renderer.xr.setSession(session);
      // create reference space
      const refSpace = await session.requestReferenceSpace('local-floor');
      // maintain a pose-to-world transform helper
      session.addEventListener('end', ()=> {
        renderer.xr.enabled = false;
      });
      // store XR state
      xrState.enabled = true;
      xrState.session = session;
      xrState.refSpace = refSpace;
    } catch(e){ console.warn('WebXR AR session failed or rejected', e); }
  } else {
    // no WebXR AR: proceed with device orientation fallback
  }

  // input: double-tap -> toggle
  let lastTap = 0;
  window.addEventListener('pointerdown', (ev)=>{
    const now = Date.now();
    if(now - lastTap < 300) { toggleMenu(); }
    lastTap = now;
    resetUIHideTimer();
  });

  // top tap shows UI
  window.addEventListener('pointerdown', (ev)=>{ if(ev.clientY <= 120) showUI(); });

  // start render loop
  requestAnimationFrame(renderFrame);
}

/* XR state */
const xrState = { enabled:false, session:null, refSpace:null };

/* Spawn/hide the menu (menu is anchored in world when spawned) */
function spawnMenuAt(pos, faceCameraHorizontally=true){
  menuMesh.position.copy(pos);
  if(faceCameraHorizontally){
    const toCam = new THREE.Vector3().subVectors(new THREE.Vector3(0,0,0), menuMesh.position);
    toCam.y = 0;
    menuMesh.lookAt(menuMesh.position.clone().add(toCam));
  }
  baseMenuScale = Math.max(0.9, eyeScalePct/70 * 1.25); // make it large
  menuMesh.scale.setScalar(0.001);
  menuMesh.visible = true;
  popScale(menuMesh, baseMenuScale, 240);
}
function spawnMenu(){
  // If XR is active, use viewer pose to compute anchor in front of viewer; else use deviceQuat
  if(xrState.enabled && xrState.session){
    // when XR active, the "camera" is handled in render loop via XR frame
    // spawn at a fixed forward vector in viewer space: transform [0,0,-dist] into world using viewer pose next frame
    pendingSpawnXR = true;
  } else {
    const forward = new THREE.Vector3(0,0,-1);
    if(deviceOrientationEnabled) forward.applyQuaternion(deviceQuat);
    const spawnPos = forward.clone().multiplyScalar(MENU_DISTANCE);
    spawnMenuAt(spawnPos, true);
  }
}
function hideMenu(){ shrinkHide(menuMesh, 160); }

/* easing */
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
  const start = performance.now();
  const s0 = obj.scale.x;
  function step(now){
    const t = Math.min(1, (now - start)/dur);
    const e = Math.pow(1 - t, 2);
    obj.scale.setScalar(s0 * e);
    if(t < 1) requestAnimationFrame(step);
    else { obj.visible = false; obj.scale.setScalar(s0); }
  }
  requestAnimationFrame(step);
}

/* Dragging via hand pinch: start/update/end (called by hands.js) */
let dragging = false;
let dragOffset = new THREE.Vector3();
function startDrag(worldPoint){
  if(!menuMesh || !menuMesh.visible) return;
  dragging = true;
  dragOffset.copy(menuMesh.position).sub(worldPoint);
}
function updateDrag(worldPoint){
  if(!dragging || !menuMesh) return;
  menuMesh.position.copy(worldPoint.clone().add(dragOffset));
}
function endDrag(){
  dragging = false;
}
window.AppDrag = { startDrag, updateDrag, endDrag };

/* callbacks for hands module (it will call these) */
function onPalmPoint({ x, y, worldPoint }){
  // currently we don't use the palm point here, hands.js draws a palm dot for feedback
}
function onPinchState({ pinch, worldPoint }){
  if(pinch && worldPoint){
    if(!dragging) startDrag(worldPoint);
    else updateDrag(worldPoint);
  } else {
    if(dragging) endDrag();
  }
}

/* pending XR spawn flag (we spawn when we get viewer pose) */
let pendingSpawnXR = false;

/* Render frame:
   - If XR session enabled, render scene3D into rtMenu using XR viewer pose (once per frame).
   - Else render scene3D into rtMenu using perspectiveBase (device orientation / pseudo-6DOF).
   - After rtMenu is rendered, blit rtMenu.texture to each eye viewport (single-pass: 3D drawn once).
*/
function renderFrame(time, xrFrame){
  requestAnimationFrame(renderFrame);

  if(!renderer || !scene3D || !rtMenu) return;

  // If XR session present, let renderer handle XR frame
  if(xrState.enabled && xrState.session && xrState.session.isImmersive){
    // renderer.xr will handle updates; we want to render scene3D once from viewer center pose to rtMenu
    // Use the viewer pose from xrFrame to position perspectiveBase for rendering to rtMenu
    // xrFrame will be provided when in active XR. If not available, fallback to non-XR path.
    if(xrFrame){
      const pose = xrFrame.getViewerPose(xrState.refSpace);
      if(pose && pose.views && pose.views.length){
        // take first view as central viewer
        const view = pose.views[0];
        // apply view transform to perspectiveBase: inverse of view transform
        const vp = view.transform;
        const pos = vp.position; const ori = vp.orientation;
        perspectiveBase.position.set(pos.x, pos.y, pos.z);
        perspectiveBase.quaternion.set(ori.x, ori.y, ori.z, ori.w);
        perspectiveBase.updateMatrixWorld(true);

        // spawn pending menu if requested
        if(pendingSpawnXR){
          // compute forward in viewer space (0,0,-1) transformed to world
          const forward = new THREE.Vector3(0,0,-1).applyQuaternion(perspectiveBase.quaternion);
          const spawnPos = perspectiveBase.position.clone().add(forward.multiplyScalar(MENU_DISTANCE));
          spawnMenuAt(spawnPos, true);
          pendingSpawnXR = false;
        }

        // render scene3D into rtMenu using perspectiveBase
        renderer.setRenderTarget(rtMenu);
        renderer.clear();
        renderer.render(scene3D, perspectiveBase);
        renderer.setRenderTarget(null);

        // Now blit rtMenu into each eye viewport (left & right DOM rectangles)
        blitMenuToEyes();
        return;
      }
    }
  }

  // Non-XR path (device orientation fallback)
  if(deviceOrientationEnabled){
    perspectiveBase.quaternion.copy(deviceQuat);
  } else {
    perspectiveBase.quaternion.identity();
  }

  // If pending spawn (non-XR), spawn using deviceQuat
  if(pendingSpawnXR){
    const forward = new THREE.Vector3(0,0,-1).applyQuaternion(perspectiveBase.quaternion);
    const spawnPos = forward.clone().multiplyScalar(MENU_DISTANCE);
    spawnMenuAt(spawnPos, true);
    pendingSpawnXR = false;
  }

  // Render scene3D once to render target using perspectiveBase
  renderer.setRenderTarget(rtMenu);
  renderer.clear();
  renderer.render(scene3D, perspectiveBase);
  renderer.setRenderTarget(null);

  // Blit into each eye area (single-pass)
  blitMenuToEyes();
}

/* Draw rtMenu.texture into each eye rectangle using postScene and scissoring */
function blitMenuToEyes(){
  const leftRect = leftWin.getBoundingClientRect();
  const rightRect = rightWin.getBoundingClientRect();
  const leftViewportY = window.innerHeight - leftRect.top - leftRect.height;

  renderer.setScissorTest(true);

  // left eye: set scissor/viewport to eye rect, render postScene (quad sampling rtMenu)
  renderer.setScissor(leftRect.left, leftViewportY, leftRect.width, leftRect.height);
  renderer.setViewport(leftRect.left, leftViewportY, leftRect.width, leftRect.height);
  renderer.clearDepth();
  renderer.render(postScene, postCamera);

  // right eye
  const rightViewportY = window.innerHeight - rightRect.top - rightRect.height;
  renderer.setScissor(rightRect.left, rightViewportY, rightRect.width, rightRect.height);
  renderer.setViewport(rightRect.left, rightViewportY, rightRect.width, rightRect.height);
  renderer.clearDepth();
  renderer.render(postScene, postCamera);

  renderer.setScissorTest(false);
}

/* double-tap toggle */
let lastTap = 0;
function toggleMenu(){
  if(!menuMesh) return;
  if(!menuMesh.visible) spawnMenu();
  else hideMenu();
}
window.addEventListener('pointerdown', (ev)=>{ const now = Date.now(); if(now - lastTap < 300) toggleMenu(); lastTap = now; });

/* Debug helper: hide debug log by default */
debugLog.style.display = 'none';

/* Expose small API for hands.js to call (no circular imports) */
window.TrackingBridge = {
  startDrag(worldPoint){ startDrag(worldPoint); },
  updateDrag(worldPoint){ updateDrag(worldPoint); },
  endDrag(){ endDrag(); },
  getPerspectiveCamera(){ return perspectiveBase; },
  getRenderer(){ return renderer; },
  getMenuMesh(){ return menuMesh; },
  spawnMenu: ()=> spawnMenu(),
  isXRAvailable: ()=> xrState.enabled
};

export {}; // empty export so this remains a module
