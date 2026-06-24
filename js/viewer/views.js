// ══════════════════════════════════════════
//  CAMERA VIEWS + TURNTABLE
//  Canonical preset views (front, back, left, right, top, bottom) for
//  repeatable figure capture, and a turntable that records one full rotation to
//  a WebM video for talks. The video uses the browser's MediaRecorder on the
//  live canvas, so it needs no encoding dependency.
// ══════════════════════════════════════════

import * as THREE from 'three';
import { App } from '../core/state.js';
import { camera, controls, renderer, scene } from '../core/scenes.js';

// Direction from the target to the camera, and the up vector, for each preset.
const VIEWS = {
  front:  { dir: [0, 0, 1],  up: [0, 1, 0] },
  back:   { dir: [0, 0, -1], up: [0, 1, 0] },
  right:  { dir: [1, 0, 0],  up: [0, 1, 0] },
  left:   { dir: [-1, 0, 0], up: [0, 1, 0] },
  top:    { dir: [0, 1, 0],  up: [0, 0, -1] },
  bottom: { dir: [0, -1, 0], up: [0, 0, 1] },
};

// Snap the camera to a preset, preserving the current distance so zoom holds.
function setView(key) {
  const v = VIEWS[key]; if (!v) return;
  const d = camera.position.distanceTo(controls.target) || 3;
  camera.up.set(v.up[0], v.up[1], v.up[2]);
  camera.position.set(
    controls.target.x + v.dir[0] * d,
    controls.target.y + v.dir[1] * d,
    controls.target.z + v.dir[2] * d,
  );
  camera.lookAt(controls.target);
  controls.update();
}

// ── Turntable: record one orbit to WebM ──
let recording = false;

function turntable() {
  if (recording) return;
  if (!App.mesh) { alert('Load a model first.'); return; }
  if (typeof MediaRecorder === 'undefined' || !renderer.domElement.captureStream) {
    alert('Video capture is not available in this browser. Try a recent Chrome.');
    return;
  }
  const btn = document.getElementById('btn-turntable');
  const mime = ['video/webm;codecs=vp9', 'video/webm;codecs=vp8', 'video/webm']
    .find(m => MediaRecorder.isTypeSupported(m)) || 'video/webm';
  const stream = renderer.domElement.captureStream(30);
  const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 8_000_000 });
  const chunks = [];
  rec.ondataavailable = e => { if (e.data.size) chunks.push(e.data); };
  rec.onstop = () => {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(new Blob(chunks, { type: 'video/webm' }));
    a.download = `MIRL_${(App.fileName || 'model').replace(/\.\w+$/, '')}_turntable.webm`;
    a.click();
    recording = false;
    controls.enabled = true;
    if (btn) { btn.textContent = 'Turntable (WebM)'; btn.disabled = false; }
  };

  recording = true;
  controls.enabled = false;                                // hold input while the camera drives itself
  if (btn) { btn.textContent = 'Recording…'; btn.disabled = true; }
  rec.start();

  // Driven by setTimeout with an explicit render each frame, so the canvas
  // repaints (and captureStream sees frames) even where requestAnimationFrame is
  // throttled, and it can never stick recording.
  const target = controls.target.clone();
  const startOffset = camera.position.clone().sub(target);
  const axis = new THREE.Vector3(0, 1, 0);
  const dur = 5000, t0 = performance.now();
  const stop = () => { if (rec.state !== 'inactive') rec.stop(); };
  function step() {
    const k = (performance.now() - t0) / dur;           // wall-clock, so it always ends near 5s
    if (k >= 1) { stop(); return; }
    camera.position.copy(target).add(startOffset.clone().applyAxisAngle(axis, k * Math.PI * 2));
    camera.lookAt(target);
    controls.update();
    renderer.render(scene, camera);
    setTimeout(step, 1000 / 30);
  }
  step();
}

// ── UI wiring ──
document.getElementById('view-presets').addEventListener('click', e => {
  const b = e.target.closest('.tb'); if (!b) return;
  setView(b.dataset.view);
});
document.getElementById('btn-turntable').addEventListener('click', turntable);
