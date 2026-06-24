// ══════════════════════════════════════════
//  SCALE + MEASUREMENT TOOL
//  - Scale: physical unit calibration (1 mesh unit = N mm/cm/m/in)
//  - Measure: click two surface points for Euclidean or geodesic distance
//
//  Note: deactivateBrush is imported lazily via dynamic import inside
//  the click handler to avoid a circular-import edge case at module load.
// ══════════════════════════════════════════

import * as THREE from 'three';
import { App } from '../core/state.js';
import { scene, camera, renderer, raycaster } from '../core/scenes.js';
import { dijkstraGeodesic } from './adjacency.js';

// ──── Scale ────
export const Scale = { mmPerUnit: null, unit: 'mm' };

export function fmtDist(d) {
  if (!Scale.mmPerUnit) return d.toFixed(5) + ' units';
  return (d * Scale.mmPerUnit).toFixed(3) + ' ' + Scale.unit;
}

document.getElementById('scale-mm').addEventListener('input', e => {
  const v = parseFloat(e.target.value);
  const st = document.getElementById('scale-status');
  if (v > 0) {
    Scale.mmPerUnit = v; Scale.unit = document.getElementById('scale-unit').value;
    st.textContent = `Scale active: 1 unit = ${v} ${Scale.unit}`;
    st.style.color = 'var(--green)';
  } else {
    Scale.mmPerUnit = null;
    st.textContent = 'No scale set: results shown in mesh units.';
    st.style.color = 'var(--text2)';
  }
});
document.getElementById('scale-unit').addEventListener('change', e => {
  Scale.unit = e.target.value;
  const v = parseFloat(document.getElementById('scale-mm').value);
  if (v > 0) {
    Scale.mmPerUnit = v;
    document.getElementById('scale-status').textContent = `Scale active: 1 unit = ${v} ${Scale.unit}`;
  }
});

// ──── Measurement ────
export const Measure = { active: false, mode: 'euclidean', pending: null, pendingMarker: null, objects: [], downPos: null };

function nearestVertIdx(geo, pt) {
  const pos = geo.attributes.position;
  let best = 0, bestD = Infinity;
  for (let i = 0; i < pos.count; i++) {
    const dx = pos.getX(i) - pt.x, dy = pos.getY(i) - pt.y, dz = pos.getZ(i) - pt.z;
    const d2 = dx * dx + dy * dy + dz * dz;
    if (d2 < bestD) { bestD = d2; best = i; }
  }
  return best;
}

// Track mouse-down to distinguish click from drag
renderer.domElement.addEventListener('mousedown', e => { Measure.downPos = { x: e.clientX, y: e.clientY }; });

renderer.domElement.addEventListener('click', e => {
  if (Measure.downPos) {
    const dx = Math.abs(e.clientX - Measure.downPos.x), dy = Math.abs(e.clientY - Measure.downPos.y);
    if (dx > 4 || dy > 4) return;
  }
  if (!Measure.active || !App.mesh) return;
  const rect = renderer.domElement.getBoundingClientRect();
  const mouse = new THREE.Vector2(((e.clientX - rect.left) / rect.width) * 2 - 1, -((e.clientY - rect.top) / rect.height) * 2 + 1);
  raycaster.setFromCamera(mouse, camera);
  const hits = raycaster.intersectObject(App.mesh);
  if (!hits.length) return;
  const pt = hits[0].point.clone();
  const vi = nearestVertIdx(App.geo, pt);

  if (!Measure.pending) {
    Measure.pending = { point: pt, vertIdx: vi };
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 8), new THREE.MeshBasicMaterial({ color: 0xe67e22, depthTest: false }));
    m.position.copy(pt); scene.add(m); Measure.pendingMarker = m;
  } else {
    const p1 = Measure.pending.point, v1 = Measure.pending.vertIdx, p2 = pt, v2 = vi;
    const m1 = Measure.pendingMarker; Measure.pendingMarker = null; Measure.pending = null;
    const m2 = new THREE.Mesh(new THREE.SphereGeometry(0.014, 8, 8), new THREE.MeshBasicMaterial({ color: 0xe67e22, depthTest: false }));
    m2.position.copy(p2); scene.add(m2);
    const line = new THREE.Line(new THREE.BufferGeometry().setFromPoints([p1, p2]), new THREE.LineBasicMaterial({ color: 0xe67e22, depthTest: false }));
    scene.add(line); Measure.objects.push({ m1, m2, line });
    document.getElementById('m-eucl').textContent = fmtDist(p1.distanceTo(p2));
    document.getElementById('m-geod-row').style.display = Measure.mode === 'geodesic' ? '' : 'none';
    document.getElementById('measure-overlay').classList.add('visible');
    if (Measure.mode === 'geodesic') {
      document.getElementById('m-geod').textContent = 'Computing…';
      setTimeout(() => {
        const g = dijkstraGeodesic(App.geo, v1, v2);
        document.getElementById('m-geod').textContent = g === Infinity ? 'Not connected' : fmtDist(g);
      }, 20);
    }
  }
});

document.getElementById('btn-measure-toggle').addEventListener('click', () => {
  if (!App.mesh) { alert('Load a model first.'); return; }
  Measure.active = !Measure.active;
  const btn = document.getElementById('btn-measure-toggle');
  if (Measure.active) {
    btn.textContent = '✓ Measurement Active'; btn.classList.add('btn-primary');
    renderer.domElement.style.cursor = 'crosshair';
    // Deactivate brush — late import to avoid circular-load edge case
    import('./surface-texture.js').then(m => m.deactivateBrush());
  } else {
    btn.textContent = 'Enable Measurement Mode'; btn.classList.remove('btn-primary');
    renderer.domElement.style.cursor = '';
    if (Measure.pendingMarker) { scene.remove(Measure.pendingMarker); Measure.pendingMarker = null; }
    Measure.pending = null;
  }
});
document.getElementById('measure-mode-tg').addEventListener('click', e => {
  const b = e.target.closest('.tb'); if (!b) return;
  document.querySelectorAll('#measure-mode-tg .tb').forEach(x => x.classList.remove('active'));
  b.classList.add('active'); Measure.mode = b.dataset.mmode;
});
document.getElementById('btn-measure-clear').addEventListener('click', () => {
  Measure.objects.forEach(o => { scene.remove(o.m1); scene.remove(o.m2); scene.remove(o.line); });
  Measure.objects = [];
  if (Measure.pendingMarker) { scene.remove(Measure.pendingMarker); Measure.pendingMarker = null; }
  Measure.pending = null;
  document.getElementById('measure-overlay').classList.remove('visible');
});
