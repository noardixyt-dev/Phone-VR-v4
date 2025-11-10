import { Hands } from './hands_model/hands_solution_simd_wasm_bin.js';

const video = document.getElementById('videoLeft'); // single video for simplicity

const hands = new Hands({
  locateFile: (file) => `hands_model/${file}`,
  selfieMode: false,
  maxNumHands: 2,
  modelComplexity: 1
});

hands.onResults(results => {
  if(results.multiHandLandmarks){
    // draw dot at palm (landmark[0] is wrist/palm)
    for(const hand of results.multiHandLandmarks){
      const palm = hand[0];
      // TODO: map palm.x/y to overlay coordinates
    }
  }
});

async function startCamera() {
  const stream = await navigator.mediaDevices.getUserMedia({video:{ facingMode:'environment' }, audio:false});
  video.srcObject = stream;
  await video.play();

  async function detectLoop(){
    await hands.send({image:video});
    requestAnimationFrame(detectLoop);
  }
  detectLoop();
}

startBtn.addEventListener('click', startCamera);
