// menu-tracking.js
// Handles: stereo menu, 6DoF tracking, double-tap spawn, smooth scaling
const startBtn = document.getElementById('startBtn');
const controls = document.getElementById('controls');
const fullscreenBtn = document.getElementById('fullscreenBtn');
const fovSlider = document.getElementById('fovSlider');
const fovVal = document.getElementById('fovVal');
const portraitOverlay = document.getElementById('portraitOverlay');
const error6dof = document.getElementById('error6dof');

const leftWin = document.getElementById('leftWin');
const rightWin = document.getElementById('rightWin');
const videoLeft = document.getElementById('videoLeft');
const videoRight = document.getElementById('videoRight');
const overlay = document.getElementById('overlay');

let stream=null;
let eyeScalePct=parseFloat(fovSlider.value);
fovVal.textContent=Math.round(eyeScalePct)+'%';

let uiHideTimer=null;
const UI_HIDE_MS=10000;
function showUI(){ controls.style.display='flex'; controls.classList.remove('hidden'); fullscreenBtn.style.display='block'; resetUIHideTimer(); }
function hideUI(){ controls.classList.add('hidden'); fullscreenBtn.style.display='none'; }
function resetUIHideTimer(){ if(uiHideTimer) clearTimeout(uiHideTimer); uiHideTimer=setTimeout(()=>{ hideUI(); }, UI_HIDE_MS); }

window.addEventListener('pointermove', ()=> resetUIHideTimer(), { passive:true });
controls.addEventListener('pointerdown', ()=> showUI());

function layoutEyes(){
  const scale = Math.max(0.3, Math.min(1.0, eyeScalePct/100));
  let eyeH = Math.round(window.innerHeight * scale);
  let eyeW = Math.floor(eyeH * 16/9);
  let gap = Math.max(8, Math.round(eyeW * 0.06));
  if(eyeW*2+gap>window.innerWidth){ const avail=window.innerWidth-gap; eyeW=Math.floor(avail/2); eyeH=Math.floor(eyeW*9/16); }
  document.documentElement.style.setProperty('--eye-w',eyeW+'px');
  document.documentElement.style.setProperty('--eye-h',eyeH+'px');
  document.documentElement.style.setProperty('--gap',gap+'px');

  // center vertically
  leftWin.style.alignSelf='center';
  rightWin.style.alignSelf='center';
}

// camera helpers
async function chooseRearDeviceId(){
  try{
    const devices=await navigator.mediaDevices.enumerateDevices();
    const cams=devices.filter(d=>d.kind==='videoinput');
    for(const c of cams){ const L=(c.label||'').toLowerCase(); if(L.includes('back')||L.includes('rear')||L.includes('environment')) return c.deviceId; }
    return cams.length?cams[0].deviceId:null;
  }catch(e){ return null; }
}

async function startCameraStream(){
  const deviceId=await chooseRearDeviceId();
  const constraints=deviceId?{video:{deviceId:{exact:deviceId}}, audio:false}:{video:true, audio:false};
  return navigator.mediaDevices.getUserMedia(constraints);
}

// FOV slider
fovSlider.addEventListener('input', ()=>{
  eyeScalePct=parseFloat(fovSlider.value);
  fovVal.textContent=Math.round(eyeScalePct)+'%';
  layoutEyes();
  if(menuMesh){ const s=eyeScalePct/70; menuMesh.scale.setScalar(s); }
  resetUIHideTimer();
});

// fullscreen
fullscreenBtn.addEventListener('click', ()=>{ if(!document.fullscreenElement) document.documentElement.requestFullscreen(); else document.exitFullscreen(); resetUIHideTimer(); });

// start button
startBtn.addEventListener('click',async()=>{
  startBtn.style.display='none';
  try{
    stream=await startCameraStream();
    videoLeft.srcObject=stream;
    videoRight.srcObject=stream;
    try{await videoLeft.play();}catch(e){}
    try{await videoRight.play();}catch(e){}
    controls.style.display='flex'; fullscreenBtn.style.display='block';
    initThreeOverlay();
    initHandTracking();
  }catch(e){ alert('Camera access failed: '+(e.message||e)); startBtn.style.display='block'; }
});

// portrait
function updatePortrait(){ if(window.innerHeight>window.innerWidth){ portraitOverlay.style.display='flex'; controls.classList.add('hidden'); fullscreenBtn.style.display='none'; }else{ portraitOverlay.style.display='none'; if(!controls.classList.contains('hidden')) controls.style.display='flex'; if(controls.style.display!=='none') fullscreenBtn.style.display='block'; } }

window.addEventListener('resize',()=>{ layoutEyes(); updatePortrait(); if(renderer){ renderer.setSize(window.innerWidth,window.innerHeight); perspectiveBase.aspect=window.innerWidth/window.innerHeight; perspectiveBase.updateProjectionMatrix(); } });

// three.js overlay
let renderer, scene3D, perspectiveBase, cam;
let menuMesh=null, menuBar=null;
function initThreeOverlay(){
  renderer=new THREE.WebGLRenderer({canvas:overlay,antialias:true,alpha:true});
  renderer.setPixelRatio(window.devicePixelRatio||1);
  renderer.setSize(window.innerWidth,window.innerHeight);
  renderer.autoClear=false;
  scene3D=new THREE.Scene();
  scene3D.add(new THREE.AmbientLight(0xffffff,0.8));
  const dl=new THREE.DirectionalLight(0xffffff,0.25); dl.position.set(1,2,2); scene3D.add(dl);
  perspectiveBase=new THREE.PerspectiveCamera(70,window.innerWidth/window.innerHeight,0.01,1000);
  cam=perspectiveBase.clone();

  // menu
  const boxG=new THREE.BoxGeometry(0.48,0.28,0.02);
  const boxM=new THREE.MeshStandardMaterial({color:0x1f6feb,roughness:0.5,metalness:0.05,emissive:0x001030});
  menuMesh=new THREE.Mesh(boxG,boxM); menuMesh.visible=false; scene3D.add(menuMesh);
  const barG=new THREE.BoxGeometry(0.28,0.028,0.002);
  const barM=new THREE.MeshStandardMaterial({color:0xffffff,transparent:true,opacity:0.9});
  menuBar=new THREE.Mesh(barG,barM); menuBar.position.set(0,-(0.28/2+0.028/2+0.01),0.012);
  menuMesh.add(menuBar);

  window.addEventListener('pointerdown', overlayPointerDown);
  window.addEventListener('pointermove', overlayPointerMove);
  window.addEventListener('pointerup', overlayPointerUp);

  layoutEyes();
  updatePortrait();
  animate();
}

// menu toggle
let lastTap=0;
function toggleMenu(){ if(!menuMesh) return; if(!menuMesh.visible) spawnMenu(); else hideMenu(); }
function spawnMenu(){ 
  menuMesh.position.set(0,0,-1.4); menuMesh.visible=true; 
  const s=eyeScalePct/70; menuMesh.scale.setScalar(s); 
}
function hideMenu(){ menuMesh.visible=false; }
function overlayPointerDown(e){ const now=Date.now(); if(now-lastTap<300) toggleMenu(); lastTap=now; }
function overlayPointerMove(e){}; function overlayPointerUp(e){}

// render loop
function animate(){
  requestAnimationFrame(animate);
  renderer.clear();
  if(menuMesh) cam.position.set(0,0,0);
  cam.updateMatrixWorld();
  renderer.render(scene3D,cam);
}
