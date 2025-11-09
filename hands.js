// hands.js
// Minimal MediaPipe Hands wrapper. Non-blocking: if MediaPipe not available it silently does nothing.
// Exports HandModule to global window so tracking.js can import/start it easily.

export const HandModule = (function(){
  let hands = null;
  let video = null;
  let running = false;
  const pinchThreshold = 0.05; // normalized distance
  let lastPinch = false;
  let overlayCanvas = null, overlayCtx = null;

  async function start({ videoElement, onPalm = ()=>{}, onPinch = ()=>{} } = {}){
    video = videoElement;
    if(!window.Hands){
      console.warn('MediaPipe Hands not loaded; hand features disabled.');
      return;
    }
    // overlay canvas (draw tiny palm dot)
    overlayCanvas = document.getElementById('overlay');
    if(overlayCanvas){
      overlayCtx = overlayCanvas.getContext('2d');
      overlayCanvas.style.pointerEvents = 'none';
    }

    hands = new Hands({ locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}` });
    hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.6,
      minTrackingConfidence: 0.5
    });

    hands.onResults((results) => {
      // clear overlay drawing (2D)
      if(overlayCtx){
        overlayCtx.clearRect(0,0,overlayCanvas.width, overlayCanvas.height);
      }
      if(!results || !results.multiHandLandmarks || results.multiHandLandmarks.length === 0){
        if(lastPinch){
          lastPinch = false;
          onPinch({ pinch:false, worldPoint:null });
        }
        return;
      }
      // choose first hand
      const lm = results.multiHandLandmarks[0];
      // compute palm center approximate
      const p0 = lm[0], p5 = lm[5], p9 = lm[9], p17 = lm[17];
      const palmX = (p0.x + p5.x + p9.x + p17.x) / 4.0;
      const palmY = (p0.y + p5.y + p9.y + p17.y) / 4.0;
      const sx = palmX * window.innerWidth;
      const sy = palmY * window.innerHeight;

      // try to compute a worldPoint by raycast using TrackingBridge camera
      let worldPoint = null;
      try{
        const tb = window.TrackingBridge;
        const cam = tb.getPerspectiveCamera();
        const ndc = new THREE.Vector2((sx/window.innerWidth)*2 - 1, - (sy/window.innerHeight)*2 + 1);
        const ray = new THREE.Raycaster();
        ray.setFromCamera(ndc, cam);
        worldPoint = ray.ray.at(1.4, new THREE.Vector3()); // menu distance
      }catch(e){ worldPoint = null; }

      // draw tiny palm dot on overlay (2D)
      if(overlayCtx){
        // scale canvas to device pixels
        const dpr = window.devicePixelRatio || 1;
        if(overlayCanvas.width !== Math.floor(window.innerWidth * dpr) || overlayCanvas.height !== Math.floor(window.innerHeight * dpr)){
          overlayCanvas.width = Math.floor(window.innerWidth * dpr);
          overlayCanvas.height = Math.floor(window.innerHeight * dpr);
          overlayCanvas.style.width = window.innerWidth + 'px';
          overlayCanvas.style.height = window.innerHeight + 'px';
          overlayCtx.scale(dpr, dpr);
        }
        overlayCtx.beginPath();
        overlayCtx.fillStyle = 'rgba(255,255,255,0.95)';
        overlayCtx.arc(sx, sy, 6, 0, Math.PI*2);
        overlayCtx.fill();
      }

      // pinch detection between index tip (8) and thumb tip (4)
      const it = lm[8], tt = lm[4];
      const dx = it.x - tt.x, dy = it.y - tt.y;
      const dist = Math.sqrt(dx*dx + dy*dy);
      const pinch = dist < pinchThreshold;

      // callbacks
      onPalm({ x: sx, y: sy, worldPoint });
      onPinch({ pinch, worldPoint });

      // call drag functions on TrackingBridge
      try{
        const tb = window.TrackingBridge;
        if(pinch && worldPoint){
          if(!lastPinch){
            // pinch started
            lastPinch = true;
            tb.startDrag(worldPoint);
          } else {
            // continuing pinch
            tb.updateDrag(worldPoint);
          }
        } else {
          if(lastPinch){
            lastPinch = false;
            tb.endDrag();
          }
        }
      }catch(e){}
    });

    running = true;
    // dispatch frames to MediaPipe via requestVideoFrameCallback if available
    function tick(){
      if(!running) return;
      if(video && video.readyState >= 2){
        hands.send({ image: video }).catch(()=>{});
      }
      if(video && typeof video.requestVideoFrameCallback === 'function'){
        video.requestVideoFrameCallback(()=> tick());
      } else {
        setTimeout(()=> tick(), 1000/30);
      }
    }
    tick();
  }

  function stop(){
    running = false;
    // clear overlay
    if(overlayCtx) overlayCtx.clearRect(0,0,overlayCanvas.width, overlayCanvas.height);
    if(hands){ hands.close(); hands = null; }
  }

  return { start, stop };
})();

// expose on window (so tracking.js can import via dynamic import if needed)
window.HandModule = HandModule;
export { HandModule };
