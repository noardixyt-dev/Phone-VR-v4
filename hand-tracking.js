// hand-tracking.js
// Exposes window.HandTracker with init(opts) where opts.videoElement and opts.onPose callback are accepted.
// Uses MediaPipe Hands via CDN. Tracks palm center and pinch (thumb-index).
// Place this file alongside index.html and menu-tracking.js

(function(){
  // Export object
  const HandTracker = {
    _running: false,
    _hands: null,
    _video: null,
    _onPose: null,
    init: async function(opts = {}){
      if(this._running) return;
      this._video = opts.videoElement || null;
      this._onPose = opts.onPose || null;

      // Load MediaPipe Hands library dynamically if not present
      if (!window.Hands) {
        await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/hands/hands.js');
        await loadScript('https://cdn.jsdelivr.net/npm/@mediapipe/drawing_utils/drawing_utils.js');
      }

      // Create Hands object
      this._hands = new Hands({
        locateFile: (file) => `https://cdn.jsdelivr.net/npm/@mediapipe/hands/${file}`
      });

      // Configure: tuned for mobile rear camera
      this._hands.setOptions({
        maxNumHands: 2,
        modelComplexity: 1,
        minDetectionConfidence: 0.6,
        minTrackingConfidence: 0.5
      });

      this._hands.onResults(this._handleResults.bind(this));

      // Create a small offscreen canvas to feed the video frames to MediaPipe if needed
      this._canvas = document.createElement('canvas');
      this._ctx = this._canvas.getContext('2d');

      // Use requestVideoFrameCallback if available for efficient scheduling
      const processFrame = () => {
        if (!this._video || this._video.readyState < 2) {
          if (this._running) setTimeout(processFrame, 100);
          return;
        }
        this._canvas.width = this._video.videoWidth;
        this._canvas.height = this._video.videoHeight;
        this._ctx.drawImage(this._video, 0, 0, this._canvas.width, this._canvas.height);
        this._hands.send({image: this._canvas});
        if (this._running) {
          if (typeof this._video.requestVideoFrameCallback === 'function') {
            this._video.requestVideoFrameCallback(()=> processFrame());
          } else {
            setTimeout(processFrame, 1000/30);
          }
        }
      };

      // Start tracking loop
      this._running = true;
      processFrame();
    },
    stop: function(){
      this._running = false;
      if (this._hands) this._hands.close && this._hands.close();
      this._hands = null;
    },
    _handleResults: function(results){
      // results.multiHandLandmarks is an array per hand
      // We'll compute palm center as average of landmarks 0 (wrist) and 9 (middle-finger MCP)
      if (!results || !results.multiHandLandmarks) {
        if (this._onPose) this._onPose(null);
        return;
      }
      const hands = results.multiHandLandmarks.map((lm, i) => {
        const wrist = lm[0];
        const mcp = lm[9];
        const palm = { x: (wrist.x + mcp.x)/2, y: (wrist.y + mcp.y)/2, z: (wrist.z + mcp.z)/2 };
        // pinch detection: distance between index finger tip (8) and thumb tip (4)
        const idx = lm[8], thumb = lm[4];
        const dx = (idx.x - thumb.x), dy = (idx.y - thumb.y), dz=(idx.z-thumb.z);
        const pinchDist = Math.sqrt(dx*dx + dy*dy + dz*dz);
        const pinch = pinchDist < 0.06; // threshold tuned for normalized coords
        return { landmarks: lm, palm, pinch, handedness: (results.multiHandedness && results.multiHandedness[i] && results.multiHandedness[i].label) || 'unknown' };
      });

      // build best primary hand: choose right or left precedence
      const primary = hands[0] || null;

      // call callback with pose
      if (this._onPose) {
        // provide normalized coords (0..1), origin top-left
        this._onPose({
          hands,
          primary
        });
      }
    }
  };

  // tiny dynamic loader
  function loadScript(src){
    return new Promise((resolve,reject)=>{
      const s=document.createElement('script'); s.src=src; s.onload=resolve; s.onerror=reject; document.head.appendChild(s);
    });
  }

  // expose
  window.HandTracker = HandTracker;
})();
