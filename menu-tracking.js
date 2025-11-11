let renderer, scene, camera, menuMesh;
function initMenuTracking() {
  const canvas = document.getElementById('overlay');
  renderer = new THREE.WebGLRenderer({ canvas, alpha:true, antialias:true });
  renderer.setPixelRatio(window.devicePixelRatio);
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.autoClear=false;

  scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff,0.8));
  const dir = new THREE.DirectionalLight(0xffffff,0.2);
  dir.position.set(1,2,2); scene.add(dir);

  camera = new THREE.PerspectiveCamera(70, window.innerWidth/window.innerHeight, 0.01, 1000);
  camera.position.set(0,0,0);

  const geo = new THREE.BoxGeometry(0.8,0.45,0.02);
  const mat = new THREE.MeshStandardMaterial({ color:0x1f6feb, roughness:0.5, metalness:0.05, emissive:0x001030, transparent:true, opacity:0.7 });
  menuMesh = new THREE.Mesh(geo, mat);
  menuMesh.position.set(0,0,-2); // in front
  menuMesh.visible=false;
  scene.add(menuMesh);

  // double tap toggle
  let lastTap=0;
  window.addEventListener('pointerdown', e=>{
    const now=Date.now();
    if(now-lastTap<300){
      menuMesh.visible=!menuMesh.visible;
    }
    lastTap=now;
  });

  animateMenu();
}

function animateMenu(){
  requestAnimationFrame(animateMenu);
  renderer.clear();
  renderer.render(scene,camera);
}
