// mediapipehands.js
import { Hands } from 'https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js';
import { Camera } from 'https://cdn.jsdelivr.net/npm/@mediapipe/camera_utils/camera_utils.js';

export class HandOverlay {
  constructor(videoEl, overlayScene, leftWin, rightWin) {
    this.videoEl = videoEl;
    this.overlayScene = overlayScene;
    this.leftWin = leftWin;
    this.rightWin = rightWin;
    this.smoothing = 0.75; // 0=no smoothing, 1=max
    this.palmPos = new THREE.Vector3();
    this.smoothedPos = new THREE.Vector3();
    this.dotMesh = null;
    this.init();
  }

  init() {
    // create a small sphere for the palm center
    const geom = new THREE.SphereGeometry(0.02, 16, 16);
    const mat = new THREE.MeshStandardMaterial({ color: 0xffffff, emissive: 0xffffff, emissiveIntensity: 0.6 });
    this.dotMesh = new THREE.Mesh(geom, mat);
    this.dotMesh.visible = false;
    this.overlayScene.add(this.dotMesh);

    this.hands = new Hands({
      locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
    });

    this.hands.setOptions({
      maxNumHands: 2,
      modelComplexity: 1,
      minDetectionConfidence: 0.7,
      minTrackingConfidence: 0.7
    });

    this.hands.onResults((results) => this.onResults(results));

    this.camera = new Camera(this.videoEl, {
      onFrame: async () => { await this.hands.send({ image: this.videoEl }); },
      width: 640,
      height: 480
    });
    this.camera.start();
  }

  onResults(results) {
    if (!results.multiHandLandmarks || results.multiHandLandmarks.length === 0) {
      this.dotMesh.visible = false;
      return;
    }

    // Use palm landmark 0 (center of palm)
    const lm = results.multiHandLandmarks[0][0];
    const x = (lm.x - 0.5) * 2; // NDC space
    const y = -(lm.y - 0.5) * 2;
    const z = -lm.z;

    this.palmPos.set(x, y, z);

    // smoothing
    this.smoothedPos.lerp(this.palmPos, 1 - this.smoothing);

    // project into overlay space
    this.dotMesh.position.copy(this.smoothedPos);
    this.dotMesh.visible = true;

    // clamp to left/right eye window bounds
    const leftRect = this.leftWin.getBoundingClientRect();
    const rightRect = this.rightWin.getBoundingClientRect();
    const clampX = THREE.MathUtils.clamp(this.dotMesh.position.x, -1, 1);
    const clampY = THREE.MathUtils.clamp(this.dotMesh.position.y, -1, 1);
    this.dotMesh.position.set(clampX, clampY, 0);
  }
}
AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAazu
