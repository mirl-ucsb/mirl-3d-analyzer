// ══════════════════════════════════════════
//  SURFACE TEXTURE — ISO 25178 roughness (Sa, Sq, Sz, Sp, Sv, Ssk, Sku)
//
//  Workflow: user paints a region on the mesh with the brush, then clicks
//  Compute. We fit a local plane around each painted vertex (k-ring PCA)
//  and measure signed height deviation.
// ══════════════════════════════════════════

import * as THREE from 'three';
import { App } from '../core/state.js';
import { scene, camera, renderer, raycaster } from '../core/scenes.js';
import { showLoad, hideLoad } from '../core/loading.js';
import { getMeshAdj } from './adjacency.js';
import { getCmap, legendGradient } from './color-maps.js';
import { Measure, Scale } from './measurement.js';
import { computeSdrSdq } from './textureHybrid.js';

export const Brush = { active: false, radius: 5, kRing: 2, selected: new Set(), overlay: null };

export function deactivateBrush() {
  Brush.active = false;
  document.getElementById('btn-brush-toggle').textContent = 'Enable Region Brush';
  document.getElementById('btn-brush-toggle').classList.remove('btn-primary');
  if (!Measure.active) renderer.domElement.style.cursor = '';
}

document.getElementById('btn-brush-toggle').addEventListener('click', () => {
  if (!App.mesh) { alert('Load a model first.'); return; }
  Brush.active = !Brush.active;
  if (Brush.active) {
    document.getElementById('btn-brush-toggle').textContent = '✓ Brush Active: click or drag';
    document.getElementById('btn-brush-toggle').classList.add('btn-primary');
    renderer.domElement.style.cursor = 'crosshair';
    if (Measure.active) {
      Measure.active = false;
      document.getElementById('btn-measure-toggle').textContent = 'Enable Measurement Mode';
      document.getElementById('btn-measure-toggle').classList.remove('btn-primary');
    }
  } else {
    deactivateBrush();
  }
});
document.getElementById('brush-radius').addEventListener('input', e => {
  Brush.radius = +e.target.value;
  document.getElementById('brush-radius-v').textContent = e.target.value;
});
document.getElementById('kring-tg').addEventListener('click', e => {
  const b = e.target.closest('.tb'); if (!b) return;
  document.querySelectorAll('#kring-tg .tb').forEach(x => x.classList.remove('active'));
  b.classList.add('active'); Brush.kRing = +b.dataset.k;
});
document.getElementById('btn-brush-clear').addEventListener('click', () => {
  Brush.selected.clear();
  if (Brush.overlay) { scene.remove(Brush.overlay); Brush.overlay = null; }
  document.getElementById('roughness-inline').style.display = 'none';
});

let _brushPainting = false;
renderer.domElement.addEventListener('mousedown', () => { if (Brush.active) _brushPainting = true; });
renderer.domElement.addEventListener('mouseup', () => { _brushPainting = false; });
renderer.domElement.addEventListener('mousemove', e => { if (_brushPainting && Brush.active) doBrushPaint(e); });
renderer.domElement.addEventListener('click', e => { if (Brush.active && App.mesh) doBrushPaint(e); });

function doBrushPaint(e) {
  if (!App.mesh || !App.geo.boundingBox) return;
  const rect = renderer.domElement.getBoundingClientRect();
  const mouse = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObject(App.mesh);
  if (!hits.length) return;
  const hp = hits[0].point;
  const diag = App.geo.boundingBox.min.distanceTo(App.geo.boundingBox.max);
  const r2 = Math.pow((Brush.radius / 100) * diag, 2);
  const pos = App.geo.attributes.position;
  let added = 0;
  for (let i = 0; i < pos.count; i++) {
    const dx = pos.getX(i) - hp.x, dy = pos.getY(i) - hp.y, dz = pos.getZ(i) - hp.z;
    if (dx * dx + dy * dy + dz * dz <= r2) { Brush.selected.add(i); added++; }
  }
  if (added > 0) refreshBrushOverlay();
}

function refreshBrushOverlay() {
  if (Brush.overlay) { scene.remove(Brush.overlay); Brush.overlay = null; }
  if (!Brush.selected.size) return;
  const pos = App.geo.attributes.position;
  const verts = [...Brush.selected];
  const pts = new Float32Array(verts.length * 3);
  verts.forEach((vi, i) => { pts[i * 3] = pos.getX(vi); pts[i * 3 + 1] = pos.getY(vi); pts[i * 3 + 2] = pos.getZ(vi); });
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.BufferAttribute(pts, 3));
  Brush.overlay = new THREE.Points(g, new THREE.PointsMaterial({ size: 0.007, color: 0xe67e22, depthTest: false }));
  scene.add(Brush.overlay);
}

// 3×3 symmetric Jacobi eigensolver
function jacobi3(M) {
  const a = M.map(r => [...r]);
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let it = 0; it < 50; it++) {
    let max = 0, p = 0, q = 1;
    for (let i = 0; i < 3; i++) for (let j = i + 1; j < 3; j++) if (Math.abs(a[i][j]) > max) { max = Math.abs(a[i][j]); p = i; q = j; }
    if (max < 1e-12) break;
    const theta = (a[q][q] - a[p][p]) / (2 * a[p][q]);
    const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta * theta + 1));
    const c = 1 / Math.sqrt(t * t + 1), s = t * c;
    const app = a[p][p], aqq = a[q][q], apq = a[p][q];
    a[p][p] = app - t * apq; a[q][q] = aqq + t * apq; a[p][q] = a[q][p] = 0;
    for (let r = 0; r < 3; r++) if (r !== p && r !== q) { const apr = a[p][r], aqr = a[q][r]; a[p][r] = a[r][p] = c * apr - s * aqr; a[q][r] = a[r][q] = s * apr + c * aqr; }
    for (let r = 0; r < 3; r++) { const vpr = v[r][p], vqr = v[r][q]; v[r][p] = c * vpr - s * vqr; v[r][q] = s * vpr + c * vqr; }
  }
  return { vals: [a[0][0], a[1][1], a[2][2]], vecs: [[v[0][0], v[1][0], v[2][0]], [v[0][1], v[1][1], v[2][1]], [v[0][2], v[1][2], v[2][2]]] };
}

// adjResult is { adj, canon, canonOrig } from getMeshAdj — canonical-indexed.
function kRingNeighbors(adjResult, centerOrig, k) {
  const { adj, canon } = adjResult;
  const cc = canon[centerOrig];
  const visited = new Set([cc]); let frontier = [cc];
  for (let h = 0; h < k; h++) {
    const next = [];
    for (const u of frontier) for (const [nb] of adj[u]) if (!visited.has(nb)) { visited.add(nb); next.push(nb); }
    frontier = next; if (!frontier.length) break;
  }
  return [...visited]; // canonical indices
}

function localHeightDev(geo, adjResult, vi, k) {
  const pos = geo.attributes.position;
  const { canonOrig } = adjResult;
  const ring = kRingNeighbors(adjResult, vi, k); // canonical indices
  if (ring.length < 4) return 0;
  // Use canonOrig to get one position per canonical vertex
  let cx = 0, cy = 0, cz = 0;
  for (const ci of ring) { const o = canonOrig[ci]; cx += pos.getX(o); cy += pos.getY(o); cz += pos.getZ(o); }
  cx /= ring.length; cy /= ring.length; cz /= ring.length;
  let xx = 0, xy = 0, xz = 0, yy = 0, yz = 0, zz = 0;
  for (const ci of ring) {
    const o = canonOrig[ci];
    const dx = pos.getX(o) - cx, dy = pos.getY(o) - cy, dz = pos.getZ(o) - cz;
    xx += dx*dx; xy += dx*dy; xz += dx*dz; yy += dy*dy; yz += dy*dz; zz += dz*dz;
  }
  const eig = jacobi3([[xx, xy, xz], [xy, yy, yz], [xz, yz, zz]]);
  let mi = 0; if (eig.vals[1] < eig.vals[mi]) mi = 1; if (eig.vals[2] < eig.vals[mi]) mi = 2;
  const nx = eig.vecs[0][mi], ny = eig.vecs[1][mi], nz = eig.vecs[2][mi];
  // Height of vi relative to the fitted plane centroid
  return (pos.getX(vi) - cx) * nx + (pos.getY(vi) - cy) * ny + (pos.getZ(vi) - cz) * nz;
}

function fastRoughnessMap(geo) {
  const pos = geo.attributes.position;
  const idx = geo.index;
  const nV = pos.count;
  const getI = idx ? (f, v) => idx.getX(f * 3 + v) : (f, v) => f * 3 + v;
  const nF = idx ? idx.count / 3 : nV / 3;
  const S = Array.from({ length: nV }, () => [0, 0, 0, 0]);
  for (let f = 0; f < nF; f++) {
    const a = getI(f, 0), b = getI(f, 1), c = getI(f, 2);
    for (const [u, v] of [[a, b], [b, c], [a, c]]) {
      S[u][0] += pos.getX(v); S[u][1] += pos.getY(v); S[u][2] += pos.getZ(v); S[u][3]++;
      S[v][0] += pos.getX(u); S[v][1] += pos.getY(u); S[v][2] += pos.getZ(u); S[v][3]++;
    }
  }
  const rough = new Float32Array(nV);
  for (let i = 0; i < nV; i++) {
    const n = S[i][3]; if (!n) continue;
    const mx = S[i][0] / n, my = S[i][1] / n, mz = S[i][2] / n;
    const dx = pos.getX(i) - mx, dy = pos.getY(i) - my, dz = pos.getZ(i) - mz;
    rough[i] = Math.sqrt(dx * dx + dy * dy + dz * dz);
  }
  return rough;
}

document.getElementById('btn-roughness-compute').addEventListener('click', () => {
  if (!App.geo) { alert('Load a model first.'); return; }
  if (Brush.selected.size < 10) { alert('Paint a region with at least 10 vertices first.'); return; }
  const verts = [...Brush.selected];
  const adjResult = getMeshAdj(App.geo);
  const k = Brush.kRing;
  const heights = verts.map(vi => localHeightDev(App.geo, adjResult, vi, k));
  const n = heights.length;
  const Sa = heights.reduce((s, h) => s + Math.abs(h), 0) / n;
  const Sq = Math.sqrt(heights.reduce((s, h) => s + h * h, 0) / n);
  const sorted = [...heights].sort((a, b) => a - b);
  const nP = Math.min(5, Math.floor(sorted.length / 2));
  const Sp = sorted.slice(-nP).reduce((s, h) => s + h, 0) / nP;
  const Sv = Math.abs(sorted.slice(0, nP).reduce((s, h) => s + h, 0) / nP);
  const Sz = Sp + Sv;
  const Ssk = Sq > 0 ? heights.reduce((s, h) => s + h * h * h, 0) / (n * Math.pow(Sq, 3)) : 0;
  const Sku = Sq > 0 ? heights.reduce((s, h) => s + h * h * h * h, 0) / (n * Math.pow(Sq, 4)) : 0;
  const sc = Scale.mmPerUnit || 1, u = Scale.mmPerUnit ? Scale.unit : 'units';
  const fmt = v => (v * sc).toExponential(3) + ' ' + u;
  document.getElementById('roughness-inline').innerHTML = `
    <div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text2);margin-bottom:7px">
      ISO 25178 · ${n.toLocaleString()} verts · k=${k}
    </div>
    <div class="rrow"><span class="rkey">Sa: mean roughness</span><span class="rval">${fmt(Sa)}</span></div>
    <div class="rrow"><span class="rkey">Sq: RMS roughness</span><span class="rval">${fmt(Sq)}</span></div>
    <div class="rrow"><span class="rkey">Sz: 10-point height</span><span class="rval">${fmt(Sz)}</span></div>
    <div class="rrow"><span class="rkey">Sp: max peak</span><span class="rval">${fmt(Sp)}</span></div>
    <div class="rrow"><span class="rkey">Sv: max valley</span><span class="rval">${fmt(Sv)}</span></div>
    <div class="rrow"><span class="rkey">Ssk: skewness</span><span class="rval">${Ssk.toFixed(3)}</span></div>
    <div class="rrow"><span class="rkey">Sku: kurtosis</span><span class="rval">${Sku.toFixed(3)}</span></div>`;

  // Compute Sdr/Sdq on the same brushed region (converted to face indices)
  try {
    const selectedVerts = new Set(verts);
    const geo = App.geo;
    const idx = geo.index;
    const nF = idx ? idx.count / 3 : geo.attributes.position.count / 3;
    const brushedFaces = new Set();
    for (let f = 0; f < nF; f++) {
      const a = idx ? idx.getX(f*3) : f*3;
      const b = idx ? idx.getX(f*3+1) : f*3+1;
      const c = idx ? idx.getX(f*3+2) : f*3+2;
      if (selectedVerts.has(a) || selectedVerts.has(b) || selectedVerts.has(c)) brushedFaces.add(f);
    }
    if (brushedFaces.size >= 3) {
      const { Sdr, SdrPercent, Sdq, warnings: sdWarn } = computeSdrSdq(geo, brushedFaces);
      const fmtDim = v => isNaN(v) ? 'N/A' : v.toExponential(3);
      document.getElementById('roughness-inline').innerHTML +=
        `<div style="margin-top:7px;padding-top:5px;border-top:1px solid var(--border)"></div>` +
        `<div class="rrow"><span class="rkey">Sdr: developed area ratio</span><span class="rval">${fmtDim(SdrPercent)} %</span></div>` +
        `<div class="rrow"><span class="rkey">Sdq: RMS gradient</span><span class="rval">${fmtDim(Sdq)}</span></div>`;
      if (sdWarn.length) console.warn('Sdr/Sdq warnings:', sdWarn);
      Brush.lastResults = { n, k, Sa, Sq, Sz, Sp, Sv, Ssk, Sku, Sdr: SdrPercent, Sdq, scale: sc, unit: u };
    } else {
      Brush.lastResults = { n, k, Sa, Sq, Sz, Sp, Sv, Ssk, Sku, scale: sc, unit: u };
    }
  } catch(e) {
    console.error('Sdr/Sdq computation failed:', e);
    Brush.lastResults = { n, k, Sa, Sq, Sz, Sp, Sv, Ssk, Sku, scale: sc, unit: u };
  }

  document.getElementById('roughness-inline').style.display = '';
  showLoad('Applying roughness colormap…');
  setTimeout(() => {
    const rough = fastRoughnessMap(App.geo);
    const s2 = [...rough].sort((a, b) => a - b);
    const lo = s2[Math.floor(s2.length * .02)] || 0;
    const hi = s2[Math.floor(s2.length * .98)] || 1;
    const range = hi - lo || 1, nV = rough.length;
    const cols = new Float32Array(nV * 3);
    const cm = getCmap('turbo');
    for (let i = 0; i < nV; i++) { const t = (rough[i] - lo) / range; const [r, g, b] = cm(t); cols[i * 3] = r; cols[i * 3 + 1] = g; cols[i * 3 + 2] = b; }
    App.geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    App.mesh.material.vertexColors = true; App.mesh.material.color.set(0xffffff); App.mesh.material.needsUpdate = true;
    const scl = Scale.mmPerUnit || 1, ul = Scale.mmPerUnit ? Scale.unit : 'units';
    document.getElementById('legend-title').textContent = 'Surface Roughness';
    document.getElementById('legend-bar').style.background = legendGradient('turbo');
    document.getElementById('legend-min').textContent = (lo * scl).toExponential(2) + ' ' + ul;
    document.getElementById('legend-max').textContent = (hi * scl).toExponential(2) + ' ' + ul;
    document.getElementById('color-legend').classList.add('visible');
    hideLoad();
  }, 30);
});
