let handDot;

async function initHandTracking() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, window.innerWidth/window.innerHeight, 0.01, 100);

  // Create pointer dot
  const geometry = new THREE.SphereGeometry(0.03,16,16);
  const material = new THREE.MeshBasicMaterial({ color:0xffffff });
  handDot = new THREE.Mesh(geometry, material);
  scene.add(handDot);

  // Load MediaPipe Hands
  const model = await handpose.load(); // TensorFlow.js hands
  const video = document.createElement('video');
  video.autoplay = true;
  video.muted = true;
  video.playsInline = true;
  video.srcObject = await navigator.mediaDevices.getUserMedia({video:{facingMode:'environment'}});

  video.onloadeddata = () => detectHands();
  async function detectHands() {
    const predictions = await model.estimateHands(video);
    if(predictions.length > 0){
      const palm = predictions[0].annotations.palmBase[0];
      const [x,y,z] = [palm[0]/500 - 1, -palm[1]/500 + 1, -palm[2]/500];
      handDot.position.set(x,y,z);
    }
    requestAnimationFrame(detectHands);
  }
}
