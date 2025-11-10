let renderer, scene, camera, menuMesh;
const overlay = document.getElementById('overlay');
const startBtn = document.getElementById('startBtn');

startBtn.addEventListener('click', async()=>{
  startBtn.style.display='none';
  initThree();
});

function initThree(){
  renderer = new THREE.WebGLRenderer({canvas: overlay, alpha:true, antialias:true});
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.autoClear = false;

  scene = new THREE.Scene();
  scene.add(new THREE.AmbientLight(0xffffff,0.7));
  const dirLight = new THREE.DirectionalLight(0xffffff,0.3); dirLight.position.set(1,2,2); scene.add(dirLight);

  camera = new THREE.PerspectiveCamera(70, window.innerWidth/window.innerHeight, 0.01, 1000);
  camera.position.set(0,0,0);

  // Frosted glass menu
  const menuGeo = new THREE.PlaneGeometry(0.8,0.45,1,1);
  const menuMat = new THREE.MeshPhysicalMaterial({
    color:0x111122, metalness:0, roughness:0.5, transparent:true, opacity:0.6, clearcoat:0.3, clearcoatRoughness:0.2
  });
  menuMesh = new THREE.Mesh(menuGeo, menuMat);
  menuMesh.position.set(0,0,-1.5);
  scene.add(menuMesh);

  window.addEventListener('resize', ()=>{ renderer.setSize(window.innerWidth, window.innerHeight); camera.aspect=window.innerWidth/window.innerHeight; camera.updateProjectionMatrix(); });
  
  overlay.addEventListener('dblclick', ()=>{ menuMesh.visible = !menuMesh.visible; });

  animate();
}

function animate(){
  requestAnimationFrame(animate);
  renderer.clear();
  renderer.render(scene, camera);
}
