let menu, menuVisible=false;

function initMenuTracking() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, window.innerWidth/window.innerHeight, 0.1, 1000);
  const renderer = new THREE.WebGLRenderer({ alpha:true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);

  const geometry = new THREE.PlaneGeometry(1.6, 0.9);
  const material = new THREE.MeshBasicMaterial({ color:0xffffff, opacity:0.95, transparent:true });
  menu = new THREE.Mesh(geometry, material);
  menu.position.set(0,1.5,-2);
  menu.visible = false;
  scene.add(menu);

  // AR/6DOF tracking simulation placeholder
  function animate() {
    requestAnimationFrame(animate);
    renderer.render(scene, camera);
  }
  animate();
}

function spawnMenu() {
  menuVisible = !menuVisible;
  if(menu) menu.visible = menuVisible;
}
