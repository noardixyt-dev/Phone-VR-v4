// menu-tracking.js
import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.153.0/build/three.module.js';

let renderer, scene3D, baseCamera, camLeft, camRight;
let menuMesh = null;
let menuBar = null;
const FIXED_IPD = 0.064;
let eyeScalePct = 70;

const overlay = document.getElementById('overlay');
const leftWin = document.getElementById('leftWin');
const rightWin = document.getElementById('rightWin');
const fovSlider = document.getElementById('fovSlider');
const fovVal = document.getElementById('fovVal');

function initMenuTracking() {
  renderer = new THREE.WebGLRenderer({ canvas: overlay, alpha:true, antialias:true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.autoClear = false;

  scene3D = new THREE.Scene();
  scene3D.add(new THREE.AmbientLight(0xffffff,0.8));
  const dl = new THREE.DirectionalLight(0xffffff,0.25); dl.position.set(1,2,2); scene3D.add(dl);

  baseCamera = new THREE.PerspectiveCamera(70, window.innerWidth/window.innerHeight, 0.01, 1000);
  camLeft = baseCamera.clone();
  camRight = baseCamera.clone();

  // Menu mesh
  const mat = new THREE.MeshStandardMaterial({
    color:0x1f6feb,
    roughness:0.2,
    metalness:0.1,
    transparent:true,
    opacity:0.8,
    envMapIntensity:0.6
  });
  const geo = new THREE.BoxGeometry(0.6,0.35,0.02);
  menuMesh = new THREE.Mesh(geo, mat);
  menuMesh.visible=false;
  scene3D.add(menuMesh);

  // Menu bar (pill)
  const barGeo = new THREE.BoxGeometry(0.3,0.03,0.002);
  const barMat = new THREE.MeshStandardMaterial({ color:0xffffff, transparent:true, opacity:0.9 });
  menuBar = new THREE.Mesh(barGeo, barMat);
  menuBar.position.set(0,-(0.35/2 + 0.03/2 + 0.01), 0.012);
  menuMesh.add(menuBar);

  window.addEventListener('resize', ()=> {
    renderer.setSize(window.innerWidth, window.innerHeight);
    baseCamera.aspect = window.innerWidth/window.innerHeight;
    baseCamera.updateProjectionMatrix();
  });

  setupMenuControls();
  animate();
}

let dragging=false, dragStart=null;
function setupMenuControls() {
  let lastTap = 0;
  overlay.addEventListener('pointerdown', (e)=>{
    const now = Date.now();
    if(now - lastTap < 300){ toggleMenu(); }
    lastTap = now;

    const ndc = new THREE.Vector2((e.clientX/window.innerWidth)*2-1, -(e.clientY/window.innerHeight)*2+1);
    const ray = new THREE.Raycaster();
    ray.setFromCamera(ndc, baseCamera);
    const hits = ray.intersectObject(menuBar,true);
    if(hits.length>0){ dragging=true; dragStart={x:e.clientX, y:e.clientY, pos:menuMesh.position.clone()}; }
  });

  overlay.addEventListener('pointermove',(e)=>{
    if(!dragging) return;
    const deltaX = (e.clientX - dragStart.x)/window.innerWidth;
    const deltaY = (e.clientY - dragStart.y)/window.innerHeight;
    menuMesh.position.x = dragStart.pos.x + deltaX;
    menuMesh.position.y = dragStart.pos.y - deltaY;
  });
  overlay.addEventListener('pointerup',()=>{ dragging=false; dragStart=null; });

  fovSlider.addEventListener('input', ()=>{
    eyeScalePct = parseFloat(fovSlider.value);
    fovVal.textContent = Math.round(eyeScalePct)+'%';
    const scale = eyeScalePct/70;
    menuMesh.scale.setScalar(scale);
  });
}

function spawnMenu() {
  menuMesh.visible=true;
  menuMesh.position.set(0,0,-1.4);
  menuMesh.scale.setScalar(eyeScalePct/70);
}

function toggleMenu(){
  if(menuMesh.visible) menuMesh.visible=false;
  else spawnMenu();
}

function animate() {
  requestAnimationFrame(animate);
  if(!renderer) return;

  // single-pass: apply base camera rotation
  camLeft.quaternion.copy(baseCamera.quaternion);
  camRight.quaternion.copy(baseCamera.quaternion);

  const leftRect = leftWin.getBoundingClientRect();
  const rightRect = rightWin.getBoundingClientRect();

  renderer.setScissorTest(true);

  // left eye
  renderer.setScissor(leftRect.left, window.innerHeight-leftRect.bottom, leftRect.width, leftRect.height);
  renderer.setViewport(leftRect.left, window.innerHeight-leftRect.bottom, leftRect.width, leftRect.height);
  camLeft.position.set(-FIXED_IPD/2,0,0);
  camLeft.updateMatrixWorld();
  renderer.clearDepth();
  renderer.render(scene3D, camLeft);

  // right eye
  renderer.setScissor(rightRect.left, window.innerHeight-rightRect.bottom, rightRect.width, rightRect.height);
  renderer.setViewport(rightRect.left, window.innerHeight-rightRect.bottom, rightRect.width, rightRect.height);
  camRight.position.set(FIXED_IPD/2,0,0);
  camRight.updateMatrixWorld();
  renderer.clearDepth();
  renderer.render(scene3D, camRight);

  renderer.setScissorTest(false);
}

initMenuTracking();
