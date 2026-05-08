// ══════════════════════════════════════════
//  QUALITY METRICS — mesh density, uniformity, open edges → A/B/C grade
// ══════════════════════════════════════════

import * as THREE from 'three';
import { App } from '../core/state.js';

export function computeQuality(geo) {
  const pos = geo.attributes.position;
  const idx = geo.index;
  const nV = pos.count;
  const getI = idx ? (f, v) => idx.getX(f * 3 + v) : (f, v) => f * 3 + v;
  const nF = idx ? idx.count / 3 : nV / 3;
  const getP = i => new THREE.Vector3(pos.getX(i), pos.getY(i), pos.getZ(i));

  const areas = [];
  for (let f = 0; f < nF; f++) {
    const pa = getP(getI(f, 0)), pb = getP(getI(f, 1)), pc = getP(getI(f, 2));
    const ab = new THREE.Vector3().subVectors(pb, pa);
    const ac = new THREE.Vector3().subVectors(pc, pa);
    areas.push(new THREE.Vector3().crossVectors(ab, ac).length() * .5);
  }
  const meanA = areas.reduce((a, b) => a + b, 0) / areas.length;
  const varA = areas.reduce((s, a) => s + (a - meanA) ** 2, 0) / areas.length;
  const uniformity = Math.max(0, 1 - Math.sqrt(varA) / (meanA + 1e-12));

  const edgeMap = {};
  const eKey = (a, b) => a < b ? `${a}|${b}` : `${b}|${a}`;
  for (let f = 0; f < nF; f++) {
    const a = getI(f, 0), b = getI(f, 1), c = getI(f, 2);
    [eKey(a, b), eKey(b, c), eKey(c, a)].forEach(k => { edgeMap[k] = (edgeMap[k] || 0) + 1; });
  }
  const boundaryEdges = Object.values(edgeMap).filter(v => v === 1).length;

  // Build adjacency for boundary vertices so we can trace connected loops
  const bAdj = {};
  for (const [k, cnt] of Object.entries(edgeMap)) {
    if (cnt !== 1) continue;
    const [a, b] = k.split('|').map(Number);
    (bAdj[a] = bAdj[a] || []).push(b);
    (bAdj[b] = bAdj[b] || []).push(a);
  }
  const seen = new Set();
  const loops = [];
  for (const v of Object.keys(bAdj).map(Number)) {
    if (seen.has(v)) continue;
    const members = [];
    const stack = [v];
    while (stack.length) {
      const cur = stack.pop();
      if (seen.has(cur)) continue;
      seen.add(cur); members.push(cur);
      for (const nb of bAdj[cur]) if (!seen.has(nb)) stack.push(nb);
    }
    loops.push(members);
  }
  // Largest loop = intended open boundary (e.g. base of vessel); rest = actual holes
  loops.sort((a, b) => b.length - a.length);
  const holeCount = Math.max(0, loops.length - 1);

  const bb = geo.boundingBox;
  const sz = new THREE.Vector3();
  bb.getSize(sz);

  const densityScore = Math.min(55, nV / 5000 * 55);
  const uniformScore = uniformity * 25;   // softer penalty: structured-light scans have inherent density variation
  const holeScore    = Math.max(0, 20 - holeCount * 4);
  const total = Math.round(densityScore + uniformScore + holeScore);

  const grade = total >= 80 ? 'A' : total >= 60 ? 'B' : 'C';
  const label = total >= 80 ? 'Excellent' : total >= 60 ? 'Good' : 'Needs Review';

  return { nV, nF: Math.round(nF), uniformity, boundaryEdges, holeCount, grade, label, score: total, dims: sz };
}

export function updateQualityCard() {
  const q = App.qual; if (!q) return;
  const card = document.getElementById('quality-card');
  card.classList.add('visible');
  const badge = document.getElementById('qc-badge');
  badge.textContent = q.grade;
  badge.className = 'qc-badge ' + q.grade;
  document.getElementById('qc-score-label').textContent = q.label + ` (${q.score}/100)`;
  document.getElementById('qc-verts').textContent = q.nV.toLocaleString();
  document.getElementById('qc-faces').textContent = q.nF.toLocaleString();
  const s = q.dims;
  document.getElementById('qc-dims').textContent = `${s.x.toFixed(2)}×${s.y.toFixed(2)}×${s.z.toFixed(2)}`;
  document.getElementById('qc-uniform').textContent = (q.uniformity * 100).toFixed(1) + '%';
  document.getElementById('qc-holes').textContent =
    q.holeCount === 0 ? 'None' : `${q.holeCount} (${q.boundaryEdges.toLocaleString()} boundary edges)`;
}
