import * as THREE from 'https://cdn.jsdelivr.net/npm/three@0.153.0/build/three.module.js';
import { HandTracking } from './hand-tracking.js';

const leftVideo = document.getElementById('videoLeft');
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('startBtn');
const fovSlider = document.getElementById('fovSlider');
const fovVal = document.getElementById('fovVal');

let renderer, scene, cam, menuMesh;
let handTracker;
let eyeScalePct = parseFloat(fovSlider.value);
fovVal.textContent = eyeScalePct+'%';

function initThreeXR(){
  renderer = new THREE.WebGLRenderer({canvas:overlay, alpha:true});
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff,0.8));
  cam = new THREE.PerspectiveCamera(70, window.innerWidth/window.innerHeight,0.01,1000);

  const geo = new THREE.PlaneGeometry(1.6,0.9);
  const mat = new THREE.MeshStandardMaterial({color:0x1f6feb, transparent:true, opacity:0.4, roughness:0.3, metalness:0.1});
  menuMesh = new THREE.Mesh(geo,mat);
  menuMesh.position.z = -1.4;
  menuMesh.visible = false;
  scene.add(menuMesh);

  animateXR();
}

function animateXR(){
  renderer.setAnimationLoop(()=>{
    renderer.render(scene,cam);
  });
}

fovSlider.addEventListener('input',()=>{
  eyeScalePct = parseFloat(fovSlider.value);
  fovVal.textContent = eyeScalePct+'%';
});

startBtn.addEventListener('click',async()=>{
  startBtn.style.display='none';
  initThreeXR();
  handTracker = new HandTracking(leftVideo, overlay, pos=>{
    if(menuMesh.visible){
      menuMesh.position.x = (pos.x/window.innerWidth-0.5)*3;
      menuMesh.position.y = -(pos.y/window.innerHeight-0.5)*2;
    }
  });

  // WebXR session 6DOF
  if(navigator.xr){
    try{
      const session = await navigator.xr.requestSession('immersive-vr',{optionalFeatures:['local-floor','hand-tracking','layers']});
      const xrCam = new THREE.WebXRManager(renderer);
      renderer.xr.enabled = true;
      renderer.xr.setSession(session);
    }catch(e){
      console.warn('WebXR 6DOF not supported', e);
    }
  }
});

overlay.addEventListener('dblclick',()=>{if(menuMesh) menuMesh.visible=!menuMesh.visible;});
