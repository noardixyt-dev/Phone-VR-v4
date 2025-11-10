let renderer, scene3D, cam, menuMesh;
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('startBtn');

function initMenuOverlay() {
  renderer = new THREE.WebGLRenderer({ canvas: overlay, alpha: true, antialias:true });
  renderer.setPixelRatio(window.devicePixelRatio || 1);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.autoClear = false;

  scene3D = new THREE.Scene();
  scene3D.add(new THREE.AmbientLight(0xffffff, 0.8));

  cam = new THREE.PerspectiveCamera(70, window.innerWidth/window.innerHeight, 0.01, 1000);
  cam.position.set(0,0,0);

  // menu mesh
  const mat = new THREE.MeshStandardMaterial({ color:0x1f6feb, roughness:0.5, metalness:0.05, transparent:true, opacity:0.6 });
  const geo = new THREE.BoxGeometry(0.6,0.34,0.02);
  menuMesh = new THREE.Mesh(geo, mat);
  menuMesh.position.set(0,0,-1.5);
  scene3D.add(menuMesh);

  animate();
}

function animate() {
  requestAnimationFrame(animate);
  if(!renderer) return;
  renderer.clear();
  renderer.render(scene3D, cam);
}

startBtn.addEventListener('click', ()=>{
  startBtn.style.display='none';
  initMenuOverlay();
});
