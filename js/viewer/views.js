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

// ── Live corner axis cube ──
// A small triad in the viewport corner that tracks the camera. Click an axis to
// snap to that view. Shows world axes relative to the camera, the usual
// navigation-cube convention.
const NS = 'http://www.w3.org/2000/svg';
const CUBE_C = 39, CUBE_L = 25;
const AXES = [
  { key: 'x', view: 'right', col: '#8a2a17', label: 'X', v: new THREE.Vector3(1, 0, 0) },
  { key: 'y', view: 'top',   col: '#2d4f6e', label: 'Y', v: new THREE.Vector3(0, 1, 0) },
  { key: 'z', view: 'front', col: '#6b7a3a', label: 'Z', v: new THREE.Vector3(0, 0, 1) },
];

function buildCube() {
  const vp = document.getElementById('viewer-vp');
  if (!vp || document.getElementById('axis-cube')) return;
  const svg = document.createElementNS(NS, 'svg');
  svg.id = 'axis-cube';
  svg.setAttribute('viewBox', '0 0 78 78');
  svg.style.cssText = 'position:absolute;right:14px;bottom:14px;width:78px;height:78px;pointer-events:none;z-index:5';
  const bg = document.createElementNS(NS, 'circle');
  bg.setAttribute('cx', '39'); bg.setAttribute('cy', '39'); bg.setAttribute('r', '37');
  bg.setAttribute('fill', '#fcf9ef'); bg.setAttribute('fill-opacity', '0.72');
  bg.setAttribute('stroke', '#bfb494'); bg.setAttribute('stroke-width', '1');
  svg.appendChild(bg);
  for (const a of AXES) {
    a.line = document.createElementNS(NS, 'line');
    a.line.setAttribute('x1', '39'); a.line.setAttribute('y1', '39');
    a.line.setAttribute('stroke', a.col); a.line.setAttribute('stroke-width', '2');
    a.dot = document.createElementNS(NS, 'circle');
    a.dot.setAttribute('r', '8'); a.dot.setAttribute('fill', a.col);
    a.dot.style.cssText = 'pointer-events:auto;cursor:pointer';
    a.dot.addEventListener('click', () => setView(a.view));
    a.txt = document.createElementNS(NS, 'text');
    a.txt.setAttribute('fill', '#fcf9ef'); a.txt.setAttribute('font-size', '9');
    a.txt.setAttribute('font-family', "'IBM Plex Mono','Plex Mono',monospace");
    a.txt.setAttribute('text-anchor', 'middle'); a.txt.setAttribute('dominant-baseline', 'central');
    a.txt.style.pointerEvents = 'none'; a.txt.textContent = a.label;
    svg.append(a.line, a.dot, a.txt);
  }
  vp.appendChild(svg);
}

function updateCube() {
  if (!document.getElementById('axis-cube')) return;
  const q = camera.quaternion.clone().invert();
  const proj = AXES.map(a => ({ a, p: a.v.clone().applyQuaternion(q) })).sort((m, n) => m.p.z - n.p.z);
  for (const { a, p } of proj) {
    const x = CUBE_C + p.x * CUBE_L, y = CUBE_C - p.y * CUBE_L;
    a.line.setAttribute('x2', x.toFixed(1)); a.line.setAttribute('y2', y.toFixed(1));
    a.dot.setAttribute('cx', x.toFixed(1)); a.dot.setAttribute('cy', y.toFixed(1));
    a.txt.setAttribute('x', x.toFixed(1)); a.txt.setAttribute('y', y.toFixed(1));
    a.line.parentNode.append(a.line, a.dot, a.txt);   // re-stack back-to-front
  }
}

// ── UI wiring ──
document.getElementById('view-presets').addEventListener('click', e => {
  const b = e.target.closest('.tb'); if (!b) return;
  setView(b.dataset.view);
});
document.getElementById('btn-turntable').addEventListener('click', turntable);

buildCube();
updateCube();
controls.addEventListener('change', updateCube);
