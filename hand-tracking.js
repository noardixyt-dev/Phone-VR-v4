let handDot;

function initHandTracking() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, window.innerWidth/window.innerHeight, 0.1, 1000);

  // Pointer dot for hand
  const geometry = new THREE.SphereGeometry(0.03,16,16);
  const material = new THREE.MeshBasicMaterial({ color:0xffffff });
  handDot = new THREE.Mesh(geometry, material);
  scene.add(handDot);

  // Simulate hand tracking (replace with MediaPipe TF.js for real tracking)
  function updateHand(x=0, y=1.4, z=-1.5) {
    handDot.position.set(x, y, z);
    requestAnimationFrame(() => updateHand(x,y,z));
  }
  updateHand();
}
