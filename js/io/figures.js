// ══════════════════════════════════════════
//  FIGURES — publication output
//  1) Composite a scale bar and an orientation triad onto the rendered frame,
//     so a screenshot is publication-ready the moment a physical scale is set.
//  2) Assemble a one-page specimen record (the object's record sheet) from the
//     model, its quality, surface analysis, measurements, and annotations,
//     shown as a print preview the browser can save to PDF.
//  Pure canvas and HTML, no dependencies.
// ══════════════════════════════════════════

import * as THREE from 'three';
import { App } from '../core/state.js';
import { renderer, scene, camera, controls } from '../core/scenes.js';
import { Measure, Scale, fmtDist } from '../analysis/measurement.js';
import { formatMetrics } from '../analysis/metrics.js';
import { setGizmoVisibleForCapture } from '../viewer/gizmo.js';

const INK = '#211d12', PAPER = '#f4efe1';

// Device pixels the renderer is drawing into, vs the CSS pixels on screen.
const dpr = () => renderer.domElement.width / renderer.domElement.clientWidth;

// Screen pixels spanned by one mesh unit at the orbit target's depth. Exact on
// that plane, which is where a centred object sits, so it reads as true.
function pxPerUnit() {
  const o = controls.target.clone();
  const right = new THREE.Vector3().setFromMatrixColumn(camera.matrixWorld, 0);
  const p0 = o.clone().project(camera), p1 = o.add(right).project(camera);
  const w = renderer.domElement.width, h = renderer.domElement.height;
  return Math.hypot(((p1.x - p0.x) / 2) * w, ((p1.y - p0.y) / 2) * h);
}

function niceLength(x) {
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  const f = x / p;
  return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * p;
}

function drawScaleBar(ctx, w, h) {
  const k = dpr();
  const perUnit = pxPerUnit();
  if (!isFinite(perUnit) || perUnit <= 0) return;
  const perPhys = perUnit / Scale.mmPerUnit;            // px per physical unit
  const target = (w * 0.25) / perPhys;                  // aim for ~quarter width
  const len = niceLength(target);
  const barPx = len * perPhys;
  const x = 26 * k, y = h - 30 * k;
  ctx.save();
  ctx.fillStyle = 'rgba(244,239,225,0.82)';
  ctx.fillRect(x - 10 * k, y - 20 * k, barPx + 20 * k, 42 * k);
  ctx.strokeStyle = INK; ctx.fillStyle = INK;
  ctx.lineWidth = 2 * k;
  ctx.beginPath();
  ctx.moveTo(x, y); ctx.lineTo(x + barPx, y);
  ctx.moveTo(x, y - 6 * k); ctx.lineTo(x, y + 6 * k);
  ctx.moveTo(x + barPx, y - 6 * k); ctx.lineTo(x + barPx, y + 6 * k);
  ctx.stroke();
  ctx.font = `${13 * k}px 'IBM Plex Mono','Plex Mono',monospace`;
  ctx.textBaseline = 'top'; ctx.textAlign = 'center';
  ctx.fillText(`${len} ${Scale.unit}`, x + barPx / 2, y + 9 * k);
  ctx.restore();
}

function drawAxisIndicator(ctx, w, h) {
  const k = dpr();
  const cx = w - 56 * k, cy = 56 * k, L = 30 * k;
  const rot = new THREE.Matrix4().extractRotation(camera.matrixWorldInverse);
  const axes = [
    { v: new THREE.Vector3(1, 0, 0), c: '#8a2a17', t: 'X' },
    { v: new THREE.Vector3(0, 1, 0), c: '#2d4f6e', t: 'Y' },
    { v: new THREE.Vector3(0, 0, 1), c: '#6b7a3a', t: 'Z' },
  ].map(a => ({ ...a, d: a.v.applyMatrix4(rot) }))
    .sort((p, q) => p.d.z - q.d.z);                      // draw back-to-front
  ctx.save();
  ctx.lineWidth = 2.2 * k;
  ctx.font = `${12 * k}px 'IBM Plex Mono','Plex Mono',monospace`;
  ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
  for (const a of axes) {
    const ex = cx + a.d.x * L, ey = cy - a.d.y * L;
    ctx.strokeStyle = a.c; ctx.fillStyle = a.c;
    ctx.beginPath(); ctx.moveTo(cx, cy); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.beginPath(); ctx.arc(ex, ey, 7 * k, 0, Math.PI * 2); ctx.fillStyle = PAPER; ctx.fill();
    ctx.strokeStyle = a.c; ctx.lineWidth = 1.4 * k; ctx.stroke();
    ctx.fillStyle = a.c; ctx.fillText(a.t, ex, ey + 0.5 * k);
    ctx.lineWidth = 2.2 * k;
  }
  ctx.restore();
}

// Render the current viewer frame to a PNG data URL, with optional overlays and
// without the orient/move handles.
export function captureFigureDataURL({ scaleBar = true, axis = true } = {}) {
  setGizmoVisibleForCapture(false);
  renderer.render(scene, camera);
  const src = renderer.domElement;
  const cv = document.createElement('canvas');
  cv.width = src.width; cv.height = src.height;
  const ctx = cv.getContext('2d');
  ctx.drawImage(src, 0, 0);
  if (axis) drawAxisIndicator(ctx, cv.width, cv.height);
  if (scaleBar && Scale.mmPerUnit) drawScaleBar(ctx, cv.width, cv.height);
  setGizmoVisibleForCapture(true);
  return cv.toDataURL('image/png');
}

export function figureOptsFromUI() {
  const sb = document.getElementById('chk-fig-scalebar');
  const ax = document.getElementById('chk-fig-axis');
  return { scaleBar: sb ? sb.checked : true, axis: ax ? ax.checked : true };
}

// ── Specimen sheet ──
const esc = s => String(s == null ? '' : s).replace(/[&<>]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;' }[c]));

function roughnessRows() {
  const el = document.getElementById('roughness-inline');
  if (!el || el.style.display === 'none') return [];
  return [...el.querySelectorAll('.rrow')].map(r => [
    r.querySelector('.rkey')?.textContent?.trim() || '',
    r.querySelector('.rval')?.textContent?.trim() || '',
  ]).filter(([k]) => k);
}

function buildSheet() {
  const q = App.qual, s = q?.dims;
  const phys = Scale.mmPerUnit;
  const dimUnits = s ? `${s.x.toFixed(2)} × ${s.y.toFixed(2)} × ${s.z.toFixed(2)} mesh units` : '—';
  const dimPhys = s && phys ? `${(s.x * phys).toFixed(1)} × ${(s.y * phys).toFixed(1)} × ${(s.z * phys).toFixed(1)} ${Scale.unit}` : null;
  const name = (document.getElementById('sdb-name')?.value || '').trim() || App.fileName || 'Untitled specimen';
  const date = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });
  const curvLabel = { none: 'None', mean: 'Mean curvature', gaussian: 'Gaussian curvature', curvedness: 'Curvedness' }[App.curvMode] || App.curvMode;

  const row = (k, v) => `<div class="sp-row"><span class="sp-k">${esc(k)}</span><span class="sp-v">${esc(v)}</span></div>`;

  const fm = formatMetrics();
  const specimen = [
    row('File', App.fileName || '—'),
    row('Scan quality', q ? `${q.grade} · ${q.label} (${q.score}/100)` : '—'),
    row('Dimensions (bounding box)', dimUnits),
    dimPhys ? row('', dimPhys) : '',
    fm ? row('Oriented L × W × H', fm.oriented) : '',
    fm ? row('Surface area', fm.area) : '',
    fm ? row('Volume', fm.volume + (fm.watertight ? '' : ' (approx., open mesh)')) : '',
    row('Scale', phys ? `1 mesh unit = ${phys} ${Scale.unit}` : 'not set'),
    row('Vertices', q ? q.nV.toLocaleString() : '—'),
    row('Faces', q ? q.nF.toLocaleString() : '—'),
    row('Uniformity', q ? (q.uniformity * 100).toFixed(1) + '%' : '—'),
    row('Holes', q ? (q.holeCount === 0 ? 'None' : `${q.holeCount} (${q.boundaryEdges.toLocaleString()} boundary edges)`) : '—'),
  ].join('');

  const rough = roughnessRows();
  const analysis = [
    row('Curvature map', curvLabel),
    ...rough.map(([k, v]) => row(k, v)),
  ].join('') || row('Surface analysis', 'none recorded');

  const measRows = Measure.objects.map((o, i) =>
    `<tr><td>${i + 1}</td><td>${fmtDist(o.m1.position.distanceTo(o.m2.position))}</td></tr>`).join('');
  const measures = measRows
    ? `<table class="sp-table"><thead><tr><th>#</th><th>Euclidean distance</th></tr></thead><tbody>${measRows}</tbody></table>`
    : `<div class="sp-empty">No measurements recorded.</div>`;

  const annItems = App.annotations.map((a, i) =>
    `<div class="sp-ann"><span class="sp-dot" style="background:${esc(a.color)}"></span><b>${i + 1}. ${esc(a.title)}</b>${a.note ? `: ${esc(a.note)}` : ''}</div>`).join('');
  const annotations = annItems || `<div class="sp-empty">No annotations recorded.</div>`;

  const img = captureFigureDataURL(figureOptsFromUI());

  return `
    <div class="sp-toolbar">
      <button class="btn btn-sm btn-primary" id="sp-print">Print / Save PDF</button>
      <button class="btn btn-sm" id="sp-close">Close</button>
    </div>
    <div id="specimen-sheet">
      <header class="sp-head">
        <div>
          <div class="sp-title">Specimen Record</div>
          <div class="sp-sub">${esc(name)}</div>
        </div>
        <div class="sp-stamp">MIRL<span>Material / Image Research Lab</span></div>
      </header>
      <img class="sp-fig" src="${img}" alt="Specimen view">
      <div class="sp-grid">
        <section><h3>Specimen</h3>${specimen}</section>
        <section><h3>Surface analysis</h3>${analysis}</section>
      </div>
      <section class="sp-block"><h3>Measurements</h3>${measures}</section>
      <section class="sp-block"><h3>Annotations</h3>${annotations}</section>
      <footer class="sp-foot">
        <span>MIRL 3D Artifact Analyzer · Material / Image Research Lab, UC Santa Barbara</span>
        <span>${esc(date)}</span>
      </footer>
    </div>`;
}

export function exportSpecimenSheet() {
  if (!App.geo) { alert('Load a model first.'); return; }
  const overlay = document.getElementById('specimen-overlay');
  overlay.innerHTML = buildSheet();
  overlay.classList.add('open');
  document.getElementById('sp-print').addEventListener('click', () => window.print());
  document.getElementById('sp-close').addEventListener('click', () => overlay.classList.remove('open'));
}

document.getElementById('btn-specimen-sheet').addEventListener('click', exportSpecimenSheet);
