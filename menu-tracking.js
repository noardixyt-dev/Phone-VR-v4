let menu, menuVisible=false, xrSession;

async function initMenuTracking() {
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(70, window.innerWidth/window.innerHeight, 0.01, 100);
  const renderer = new THREE.WebGLRenderer({ alpha:true, antialias:true });
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.xr.enabled = true;
  document.body.appendChild(renderer.domElement);

  const geometry = new THREE.PlaneGeometry(1.6, 0.9);
  const material = new THREE.MeshBasicMaterial({ color:0xffffff, opacity:0.95, transparent:true });
  menu = new THREE.Mesh(geometry, material);
  menu.position.set(0,1.5,-2);
  menu.visible = false;
  scene.add(menu);

  // AR session
  if (navigator.xr) {
    try {
      xrSession = await navigator.xr.requestSession('immersive-ar', { requiredFeatures:['local-floor'] });
      renderer.xr.setSession(xrSession);
    } catch(e) { console.warn("AR/6DOF not supported", e); }
  }

  function animate() {
    renderer.setAnimationLoop(()=>renderer.render(scene, camera));
  }
  animate();
}

function spawnMenu() {
  menuVisible = !menuVisible;
  if(menu) menu.visible = menuVisible;
}
