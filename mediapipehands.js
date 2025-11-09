import {Hands} from 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.min.js';
import {Camera} from 'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js';

export function createHandTracker(videoElement, onPalmDot){
  const hands = new Hands({
    locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
  });
  hands.setOptions({
    maxNumHands: 1,
    modelComplexity: 1,
    minDetectionConfidence: 0.6,
    minTrackingConfidence: 0.5
  });
  
  hands.onResults(results=>{
    if(!results.multiHandLandmarks) return;
    const palm = results.multiHandLandmarks[0][0]; // landmark 0 = palm
    onPalmDot(palm);
  });

  const cam = new Camera(videoElement, {
    onFrame: async () => { await hands.send({image: videoElement}); },
    facingMode: 'environment'
  });
  cam.start();
  return hands;
}
