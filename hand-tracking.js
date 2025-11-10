import * as mpHands from 'https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.5/hands.js';
import { Camera } from 'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js';

export class HandTracking {
  constructor(videoElement, overlay, onPinch) {
    this.video = videoElement;
    this.overlay = overlay;
    this.onPinch = onPinch;
    this.hands = new mpHands.Hands({locateFile: (file)=>`https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.5/${file}`});
    this.hands.setOptions({maxNumHands:2, modelComplexity:1, minDetectionConfidence:0.8, minTrackingConfidence:0.8});
    this.hands.onResults(this.onResults.bind(this));
    this.camera = new Camera(videoElement, {onFrame: async ()=>{await this.hands.send({image:videoElement});}, width:1280, height:720, facingMode:'environment'});
    this.camera.start();
    this.palmPos = null;
  }
  onResults(results){
    const ctx = this.overlay.getContext('2d');
    ctx.clearRect(0,0,this.overlay.width,this.overlay.height);
    if(!results.multiHandLandmarks) return;
    results.multiHandLandmarks.forEach(hand=>{
      const palm = hand[0];
      const x = palm.x*this.overlay.width;
      const y = palm.y*this.overlay.height;
      this.palmPos = {x,y};
      ctx.beginPath();
      ctx.arc(x,y,10,0,Math.PI*2);
      ctx.fillStyle='rgba(255,255,255,0.9)';
      ctx.shadowBlur=12;
      ctx.shadowColor='rgba(255,255,255,0.5)';
      ctx.fill();
    });
    if(this.palmPos && this.onPinch) this.onPinch(this.palmPos);
  }
}
