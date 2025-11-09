// hands.js
// Put this file in same folder as index.html
// This file requires the <script src="https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js"></script> loaded in index.html
// and tracking.js's ThreeBridge to be available (tracking.js imports this file,
// and this file calls back into tracking via ThreeBridge at runtime).

import { ThreeBridge } from './tracking.js'; // circular-ish but runtime usage only

export const HandIntegration = {
  _hands: null,
  _videoEl: null,
  _running: false,
  _onPalmPoint: null,
  _onPinch: null,
  _lastPinchState: false,
  async start({ videoElement, onPalmPoint = ()=>{}, onPinch = ()=>{} }){
    this._videoEl = videoElement;
    this._onPalmPoint = onPalmPoint;
    this._onPinch = onPinch;
    // init MediaPipe Hands
    this._hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });
    this._hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.5
    });
    this._hands.onResults(this._onResults.bind(this));
    // camera utils can feed frames to hands, but we already have a stream; we'll poll via requestVideoFrameCallback
    this._running = true;
    this._tick();
  },
  stop(){
    this._running = false;
  },
  async _tick(){
    if(!this._running) return;
    if(this._videoEl && this._hands && this._videoEl.readyState >= 2){
      try {
        await this._hands.send({ image: this._videoEl });
      } catch(e){ /* ignore */ }
    }
    if(this._videoEl && typeof this._videoEl.requestVideoFrameCallback === 'function'){
      this._videoEl.requestVideoFrameCallback(()=> this._tick());
    } else {
      setTimeout(()=> this._tick(), 1000/30);
    }
  },
  _onResults(results){
    // results.multiHandLandmarks: array of landmarks per hand
    if(!results || !results.multiHandLandmarks || results.multiHandLandmarks.length === 0){
      // no hands: report no pinch
      if(this._lastPinchState){
        this._lastPinchState = false;
        this._onPinch({ pinch:false });
      }
      return;
    }
    // pick strongest / first hand
    const lm = results.multiHandLandmarks[0];
    // compute palm center approximate: average of some landmarks (wrist:0, index_mcp:5, pinky_mcp:17, middle_mcp:9)
    const p0 = lm[0], p5 = lm[5], p9 = lm[9], p17 = lm[17];
    const palmX = (p0.x + p5.x + p9.x + p17.x) / 4.0;
    const palmY = (p0.y + p5.y + p9.y + p17.y) / 4.0;
    // landmarks are normalized (0..1) with origin top-left
    // convert to screen pixels
    const sx = palmX * window.innerWidth;
    const sy = palmY * window.innerHeight;
    // compute worldPoint: raycast from camera (via ThreeBridge) at MENU_DISTANCE
    const tb = ThreeBridge;
    let worldPoint = null;
    try {
      const cam = tb.getCamLeft ? tb.getCamLeft() : tb.getPerspectiveCamera();
      const ndc = new THREE.Vector2((sx/window.innerWidth)*2 - 1, - (sy/window.innerHeight)*2 + 1);
      const ray = new THREE.Raycaster();
      ray.setFromCamera(ndc, cam);
      worldPoint = ray.ray.at(1.4, new THREE.Vector3()); // put at menu distance
    } catch(e){
      worldPoint = null;
    }
    // call palm callback in screen coords
    if(typeof this._onPalmPoint === 'function'){
      this._onPalmPoint({ x: sx, y: sy, worldPoint });
    }
    // detect pinch (distance between index finger tip (8) and thumb tip (4))
    const indexTip = lm[8], thumbTip = lm[4];
    const dx = indexTip.x - thumbTip.x, dy = indexTip.y - thumbTip.y;
    const d = Math.sqrt(dx*dx + dy*dy);
    const pinch = d < 0.05; // threshold normalized
    // convert worldPoint for pinch event
    const evt = { pinch, palm: { x: sx, y: sy }, worldPoint };
    // call onPinch
    if(typeof this._onPinch === 'function'){
      this._onPinch(evt);
    }
    // send pinch change events for start/stop (handled by tracking.js)
    if(pinch && !this._lastPinchState){
      this._lastPinchState = true;
      // pinch started
    } else if(!pinch && this._lastPinchState){
      this._lastPinchState = false;
      // pinch ended
    }
  }
};

// convenience: expose for import by tracking.js when tracking.js cannot import (circular). We export to window too.
window.HandIntegration = HandIntegration;
export { HandIntegration };
