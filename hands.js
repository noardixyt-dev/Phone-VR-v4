// hands.js (module)
// Exports: initHands(stream, onPalmCallback), stopHands()

let handsInstance = null;
let cameraUtils = null;
let mediaStreamCamera = null;
let running = false;

/**
 * initHands(stream, onPalm)
 *  - stream: MediaStream (camera stream)
 *  - onPalm: function({x,y}, confidence) called where x,y are normalized [0..1] top-left
 */
export async function initHands(stream, onPalm){
  if (!stream) throw new Error('No stream passed to initHands');

  // Ensure MediaPipe Hands is available (loaded via CDN script in index.html)
  if (typeof Hands === 'undefined') throw new Error('MediaPipe Hands not loaded (check CDN script)');

  // lazy import camera_utils if available
  if (typeof Camera === 'undefined' && typeof window.cameraUtils !== 'undefined') {
    cameraUtils = window.cameraUtils;
  } else {
    // Camera util comes from CDN as well; MediaPipe exposes Camera global in many builds
    cameraUtils = (typeof Camera !== 'undefined') ? Camera : null;
  }

  // Create an offscreen hidden video element to feed into Hands (we use the same stream)
  const video = document.createElement('video');
  video.autoplay = true;
  video.playsInline = true;
  video.muted = true;
  video.srcObject = stream;
  video.style.position = 'fixed';
  video.style.width = '2px';
  video.style.height = '2px';
  video.style.opacity = '0';
  document.body.appendChild(video);

  // Wait a bit for the video to start
  try { await video.play(); } catch(e){ /* ignore */ }

  handsInstance = new Hands({locateFile: (file) => {
    // rely on CDN path used in index.html
    return `https://cdn.jsdelivr.net/npm/@mediapipe/hands@0.4/${file}`;
  }});

  handsInstance.setOptions({
    maxNumHands: 2,
    modelComplexity: 1,
    minDetectionConfidence: 0.55,
    minTrackingConfidence: 0.5
  });

  handsInstance.onResults((results) => {
    // results.multiHandLandmarks array
    // we'll compute palm center as average of wrist + middle finger base
    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0){
      onPalm && onPalm({x:0.5, y:0.5}, 0); // signal no palm
      return;
    }
    // pick first hand
    const lm = results.multiHandLandmarks[0];
    // landmarks indices: 0 = wrist, 9 = middle_finger_mcp
    const wrist = lm[0], mid = lm[9];
    const palmX = (wrist.x + mid.x) / 2;
    const palmY = (wrist.y + mid.y) / 2;
    // confidence approximate from presence of landmarks
    const conf = results.multiHandedness && results.multiHandedness[0] && results.multiHandedness[0].score ? results.multiHandedness[0].score : 0.9;
    // MediaPipe reports normalized coords relative to the video; convert to top-left origin
    onPalm && onPalm({ x: palmX, y: palmY }, conf);
  });

  // camera wrapper
  if (cameraUtils && typeof cameraUtils.Camera === 'function'){
    // Use camera utils to feed frames to hands (preferred)
    mediaStreamCamera = new cameraUtils.Camera(video, {
      onFrame: async () => { await handsInstance.send({image: video}); },
      width: 1280,
      height: 720
    });
    mediaStreamCamera.start();
    running = true;
  } else {
    // fallback: poll frames via interval
    const iv = setInterval(async () => {
      if (!handsInstance) { clearInterval(iv); return; }
      await handsInstance.send({ image: video });
    }, 1000/30);
    running = true;
  }
}

/* stopHands() */
export function stopHands(){
  try {
    if (mediaStreamCamera && typeof mediaStreamCamera.stop === 'function') mediaStreamCamera.stop();
  } catch(e){}
  try { if (handsInstance) handsInstance.close(); } catch(e){}
  handsInstance = null; mediaStreamCamera = null; running = false;
}
