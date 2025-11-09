import { Hands } from 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js';
import { Camera } from 'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js';

export function createHandTracker(videoEl, callback){
  const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
  });
  hands.setOptions({
    maxNumHands:1,
    modelComplexity:1,
    minDetectionConfidence:0.7,
    minTrackingConfidence:0.7
  });
  hands.onResults(results=>{
    if(results.multiHandLandmarks && results.multiHandLandmarks.length>0){
      const landmarks = results.multiHandLandmarks[0];
      // Use average of palm points (wrist + MCPs)
      const palmX = (landmarks[0].x + landmarks[1].x + landmarks[5].x + landmarks[9].x + landmarks[13].x)/5;
      const palmY = (landmarks[0].y + landmarks[1].y + landmarks[5].y + landmarks[9].y + landmarks[13].y)/5;
      callback({x:palmX, y:palmY});
    }
  });
  const cam = new Camera(videoEl,{onFrame:async()=>{ await hands.send({image:videoEl}); },facingMode:'environment',width:1280,height:720});
  cam.start();
}
