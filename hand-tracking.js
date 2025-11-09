// hand-tracking.js
// Lightweight MediaPipe Hands integration with palm-ray and outer glow
let handVideo=null;
let handCanvas=null;
let handCtx=null;
let handDots=[];

async function initHandTracking(){
  handVideo=document.createElement('video');
  handVideo.autoplay=true; handVideo.playsInline=true; handVideo.muted=true;

  const deviceId=await chooseRearDeviceId();
  handVideo.srcObject=await navigator.mediaDevices.getUserMedia({video:{deviceId:{exact:deviceId}}});

  handCanvas=document.createElement('canvas');
  handCanvas.width=window.innerWidth;
  handCanvas.height=window.innerHeight;
  handCanvas.style.position='absolute';
  handCanvas.style.pointerEvents='none';
  handCanvas.style.zIndex='50';
  document.body.appendChild(handCanvas);
  handCtx=handCanvas.getContext('2d');

  const hands = new Hands({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`});
  hands.setOptions({maxNumHands:1,modelComplexity:1, minDetectionConfidence:0.7, minTrackingConfidence:0.5});
  hands.onResults(onHandsResults);

  const cam = new Camera(handVideo, {onFrame: async()=>{ await hands.send({image:handVideo}); }, width:window.innerWidth, height:window.innerHeight});
  cam.start();

  function onHandsResults(results){
    handCtx.clearRect(0,0,handCanvas.width,handCanvas.height);
    if(results.multiHandLandmarks && results.multiHandLandmarks.length>0){
      const palm=results.multiHandLandmarks[0][0]; // wrist/palm center
      const x=palm.x*handCanvas.width; const y=palm.y*handCanvas.height;
      // dot
      handCtx.beginPath();
      handCtx.arc(x,y,14,0,Math.PI*2);
      handCtx.fillStyle='rgba(255,255,255,0.9)';
      handCtx.shadowColor='white';
      handCtx.shadowBlur=16;
      handCtx.fill();
    }
  }
}
