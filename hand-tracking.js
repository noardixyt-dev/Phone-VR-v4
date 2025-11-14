let handDot;

function initHandTracking() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, window.innerWidth/window.innerHeight, 0.1, 1000);

  const geometry = new THREE.SphereGeometry(0.03,16,16);
  const material = new THREE.MeshBasicMaterial({ color:0xffffff });
  handDot = new THREE.Mesh(geometry, material);
  scene.add(handDot);

  // Dummy hand tracking simulation
  function updateHandPosition(x=0,y=1.4,z=-1.5) {
    handDot.position.set(x,y,z);
    requestAnimationFrame(() => updateHandPosition(x,y,z));
  }
  updateHandPosition();
}
