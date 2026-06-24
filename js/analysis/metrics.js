// ══════════════════════════════════════════
//  OBJECT METRICS
//  Surface area (sum of triangle areas), volume (signed-tetrahedron sum, the
//  divergence theorem), and principal-axis dimensions (PCA-oriented bounding
//  box, the honest length/width/height instead of the arbitrary axis-aligned
//  box). Computed in mesh units; shown in physical units when a scale is set.
//  Volume is only valid for a watertight mesh, and is flagged otherwise.
// ══════════════════════════════════════════

import { App } from '../core/state.js';
import { Scale } from './measurement.js';

// ── Symmetric 3x3 eigensolver (cyclic Jacobi) ──
// Returns orthonormal eigenvectors as the columns of `vectors`. We use only the
// directions (the principal axes); extents come from projecting the real points.
function rotate(a, v, p, q) {
  if (Math.abs(a[p][q]) < 1e-20) return;
  const app = a[p][p], aqq = a[q][q], apq = a[p][q];
  const phi = (aqq - app) / (2 * apq);
  const t = Math.sign(phi || 1) / (Math.abs(phi) + Math.sqrt(phi * phi + 1));
  const c = 1 / Math.sqrt(t * t + 1), s = t * c;
  const r = 3 - p - q;
  a[p][p] = app - t * apq;
  a[q][q] = aqq + t * apq;
  a[p][q] = a[q][p] = 0;
  const arp = a[r][p], arq = a[r][q];
  a[r][p] = a[p][r] = c * arp - s * arq;
  a[r][q] = a[q][r] = s * arp + c * arq;
  for (let k = 0; k < 3; k++) {
    const vkp = v[k][p], vkq = v[k][q];
    v[k][p] = c * vkp - s * vkq;
    v[k][q] = s * vkp + c * vkq;
  }
}

function eigenSym3(m) {
  const a = m.map(r => r.slice());
  const v = [[1, 0, 0], [0, 1, 0], [0, 0, 1]];
  for (let sweep = 0; sweep < 16; sweep++) {
    if (Math.abs(a[0][1]) + Math.abs(a[0][2]) + Math.abs(a[1][2]) < 1e-15) break;
    rotate(a, v, 0, 1); rotate(a, v, 0, 2); rotate(a, v, 1, 2);
  }
  return v;
}

export function computeMetrics(geo) {
  const pos = geo.attributes.position, index = geo.index;
  const nV = pos.count;
  const nF = index ? index.count / 3 : nV / 3;
  const gi = index ? (f, v) => index.getX(f * 3 + v) : (f, v) => f * 3 + v;

  // Area + signed volume in one pass over the faces
  let area = 0, vol6 = 0;
  for (let f = 0; f < nF; f++) {
    const i0 = gi(f, 0), i1 = gi(f, 1), i2 = gi(f, 2);
    const ax = pos.getX(i0), ay = pos.getY(i0), az = pos.getZ(i0);
    const bx = pos.getX(i1), by = pos.getY(i1), bz = pos.getZ(i1);
    const cx = pos.getX(i2), cy = pos.getY(i2), cz = pos.getZ(i2);
    const e1x = bx - ax, e1y = by - ay, e1z = bz - az;
    const e2x = cx - ax, e2y = cy - ay, e2z = cz - az;
    const crx = e1y * e2z - e1z * e2y, cry = e1z * e2x - e1x * e2z, crz = e1x * e2y - e1y * e2x;
    area += 0.5 * Math.hypot(crx, cry, crz);
    // 6V contribution = a · (b × c)
    vol6 += ax * (by * cz - bz * cy) + ay * (bz * cx - bx * cz) + az * (bx * cy - by * cx);
  }

  // Centroid → covariance → principal axes → extent along each axis
  let mx = 0, my = 0, mz = 0;
  for (let i = 0; i < nV; i++) { mx += pos.getX(i); my += pos.getY(i); mz += pos.getZ(i); }
  mx /= nV; my /= nV; mz /= nV;

  let c00 = 0, c01 = 0, c02 = 0, c11 = 0, c12 = 0, c22 = 0;
  for (let i = 0; i < nV; i++) {
    const dx = pos.getX(i) - mx, dy = pos.getY(i) - my, dz = pos.getZ(i) - mz;
    c00 += dx * dx; c01 += dx * dy; c02 += dx * dz;
    c11 += dy * dy; c12 += dy * dz; c22 += dz * dz;
  }
  const v = eigenSym3([[c00 / nV, c01 / nV, c02 / nV], [c01 / nV, c11 / nV, c12 / nV], [c02 / nV, c12 / nV, c22 / nV]]);
  const axes = [[v[0][0], v[1][0], v[2][0]], [v[0][1], v[1][1], v[2][1]], [v[0][2], v[1][2], v[2][2]]];
  const mn = [Infinity, Infinity, Infinity], mxp = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < nV; i++) {
    const dx = pos.getX(i) - mx, dy = pos.getY(i) - my, dz = pos.getZ(i) - mz;
    for (let k = 0; k < 3; k++) {
      const d = dx * axes[k][0] + dy * axes[k][1] + dz * axes[k][2];
      if (d < mn[k]) mn[k] = d;
      if (d > mxp[k]) mxp[k] = d;
    }
  }
  const ext = [mxp[0] - mn[0], mxp[1] - mn[1], mxp[2] - mn[2]].sort((a, b) => b - a);

  const watertight = App.qual ? App.qual.boundaryEdges === 0 : false;
  return { area, volume: Math.abs(vol6) / 6, watertight, oriented: { l: ext[0], w: ext[1], h: ext[2] } };
}

// ── Formatting (physical units when a scale is set, mesh units otherwise) ──
const k = () => Scale.mmPerUnit;
const grp = (n, d) => n.toLocaleString(undefined, { minimumFractionDigits: d, maximumFractionDigits: d });
const fmtArea = u => k() ? `${grp(u * k() ** 2, 2)} ${Scale.unit}²` : `${u.toFixed(3)} sq units`;
const fmtVol = u => k() ? `${grp(u * k() ** 3, 2)} ${Scale.unit}³` : `${u.toFixed(3)} cu units`;
const fmtDims = (l, w, h) => k()
  ? `${grp(l * k(), 1)} × ${grp(w * k(), 1)} × ${grp(h * k(), 1)} ${Scale.unit}`
  : `${l.toFixed(3)} × ${w.toFixed(3)} × ${h.toFixed(3)} units`;

// Display strings for the panel, the specimen sheet, and anywhere else.
export function formatMetrics() {
  const m = App.metrics;
  if (!m) return null;
  return {
    area: fmtArea(m.area),
    volume: fmtVol(m.volume),
    oriented: fmtDims(m.oriented.l, m.oriented.w, m.oriented.h),
    watertight: m.watertight,
  };
}

export function renderMetrics() {
  const f = formatMetrics();
  const set = (id, val) => { const el = document.getElementById(id); if (el) el.textContent = val; };
  if (!f) { set('mt-area', '—'); set('mt-vol', '—'); set('mt-oriented', '—'); set('mt-note', ''); return; }
  set('mt-area', f.area);
  set('mt-vol', f.volume + (f.watertight ? '' : ' *'));
  set('mt-oriented', f.oriented);
  set('mt-note', f.watertight ? '' : '* Volume needs a watertight mesh; this is approximate.');
}

// Refresh the physical figures when the scale changes. Deferred a tick so the
// scale handler in measurement.js has updated Scale first.
['scale-mm', 'scale-unit'].forEach(id => {
  const el = document.getElementById(id);
  if (el) el.addEventListener(id === 'scale-mm' ? 'input' : 'change', () => setTimeout(renderMetrics, 0));
});
