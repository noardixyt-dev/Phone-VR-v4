async function initHandTracking() {
  const canvas = document.getElementById('overlay');
  const ctx = canvas.getContext('2d');

  const hands = new Hands({locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4.1675469240/${file}`});
  hands.setOptions({maxNumHands:2,modelComplexity:1,minDetectionConfidence:0.7,minTrackingConfidence:0.7});
  hands.onResults(drawHands);

  const video = document.getElementById('videoLeft'); // same stream used for hand detection

  const cameraFeed = new Camera(video,{onFrame: async ()=>{ await hands.send({image:video}); }, width:1280,height:720});
  cameraFeed.start();

  function drawHands(results){
    ctx.clearRect(0,0,canvas.width,canvas.height);
    if(!results.multiHandLandmarks) return;
    for(const landmarks of results.multiHandLandmarks){
      const palm = landmarks[0]; // wrist or palm
      const x = palm.x*canvas.width;
      const y = palm.y*canvas.height;
      ctx.fillStyle='white';
      ctx.beginPath();
      ctx.arc(x,y,8,0,2*Math.PI);
      ctx.fill();
    }
  }
}
