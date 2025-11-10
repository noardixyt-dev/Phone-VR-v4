import {Hands} from 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js';
import {Camera} from 'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js';

let video = document.getElementById('videoLeft'); // use same video for simplicity
let dotMaterial = new THREE.MeshBasicMaterial({color:0xffffff});
let dotGeo = new THREE.SphereGeometry(0.02,8,8);
let palmDot = new THREE.Mesh(dotGeo, dotMaterial);
palmDot.visible=false;

let dragging=false;
let dragOffset=new THREE.Vector3();

function initHands(){
  const hands = new Hands({locateFile: (file) => `hands_model/${file}`});
  hands.setOptions({maxNumHands:1,modelComplexity:1,runOnGpu:true});
  hands.onResults(onResults);
  const cam = new Camera(video, {onFrame: async()=>{ await hands.send({image: video}); }, width:640,height:480});
  cam.start();
  scene.add(palmDot);
}

function onResults(results){
  if(results.multiHandLandmarks && results.multiHandLandmarks.length>0){
    const lm = results.multiHandLandmarks[0];
    // palm center approximation
    let x = (lm[0].x + lm[9].x)/2 - 0.5;
    let y = 0.5 - (lm[0].y + lm[9].y)/2;
    palmDot.position.set(x*2,y*2,-1.5);
    palmDot.visible=true;

    // simple pinch detection
    let pinch = Math.hypot(lm[4].x-lm[8].x,lm[4].y-lm[8].y)<0.05;
    if(pinch && !dragging){ dragging=true; dragOffset.copy(menuMesh.position).sub(palmDot.position); }
    if(!pinch && dragging) dragging=false;
    if(dragging) menuMesh.position.copy(palmDot.position.clone().add(dragOffset));
  } else { palmDot.visible=false; dragging=false; }
}

// wait for menu-tracking to load
setTimeout(()=>{ initHands(); },1000);
