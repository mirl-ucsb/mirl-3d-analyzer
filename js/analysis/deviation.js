// ══════════════════════════════════════════
//  DEVIATION MAP
//  Signed surface-to-surface distance from a test scan to a reference scan, for
//  before/after conservation monitoring: loss, warping, accretion. For each test
//  vertex we find the nearest point on the reference surface and sign the
//  distance by the reference normal there (outward is a gain, inward a loss).
//
//  Two scans are rarely in the same frame, so an ICP pass (Horn's quaternion
//  method) registers the test to the reference first. To stay local-first the
//  reference triangles are binned into a uniform grid and each nearest-point
//  query expands outward shell by shell, near-linear and with no BVH dependency.
// ══════════════════════════════════════════

import * as THREE from 'three';

// ── Closest point on a triangle (Ericson, Real-Time Collision Detection) ──
// Reads triangle a,b,c from the packed array `tri` at offset o; writes the
// closest point to out[0..2] and returns the squared distance.
function closestOnTri(px, py, pz, tri, o, out) {
  const ax = tri[o], ay = tri[o + 1], az = tri[o + 2];
  const bx = tri[o + 3], by = tri[o + 4], bz = tri[o + 5];
  const cx = tri[o + 6], cy = tri[o + 7], cz = tri[o + 8];
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  if (d1 <= 0 && d2 <= 0) { out[0] = ax; out[1] = ay; out[2] = az; }
  else {
    const bpx = px - bx, bpy = py - by, bpz = pz - bz;
    const d3 = abx * bpx + aby * bpy + abz * bpz;
    const d4 = acx * bpx + acy * bpy + acz * bpz;
    if (d3 >= 0 && d4 <= d3) { out[0] = bx; out[1] = by; out[2] = bz; }
    else {
      const vc = d1 * d4 - d3 * d2;
      if (vc <= 0 && d1 >= 0 && d3 <= 0) {
        const v = d1 / (d1 - d3);
        out[0] = ax + v * abx; out[1] = ay + v * aby; out[2] = az + v * abz;
      } else {
        const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
        const d5 = abx * cpx + aby * cpy + abz * cpz;
        const d6 = acx * cpx + acy * cpy + acz * cpz;
        if (d6 >= 0 && d5 <= d6) { out[0] = cx; out[1] = cy; out[2] = cz; }
        else {
          const vb = d5 * d2 - d1 * d6;
          if (vb <= 0 && d2 >= 0 && d6 <= 0) {
            const w = d2 / (d2 - d6);
            out[0] = ax + w * acx; out[1] = ay + w * acy; out[2] = az + w * acz;
          } else {
            const va = d3 * d6 - d5 * d4;
            if (va <= 0 && (d4 - d3) >= 0 && (d5 - d6) >= 0) {
              const w = (d4 - d3) / ((d4 - d3) + (d5 - d6));
              out[0] = bx + w * (cx - bx); out[1] = by + w * (cy - by); out[2] = bz + w * (cz - bz);
            } else {
              const denom = 1 / (va + vb + vc), v = vb * denom, w = vc * denom;
              out[0] = ax + abx * v + acx * w; out[1] = ay + aby * v + acy * w; out[2] = az + abz * v + acz * w;
            }
          }
        }
      }
    }
  }
  const dx = px - out[0], dy = py - out[1], dz = pz - out[2];
  return dx * dx + dy * dy + dz * dz;
}

// ── Uniform grid over a mesh's world-space triangles, for nearest queries ──
function buildGrid(geo, matrix) {
  const pos = geo.attributes.position;
  const index = geo.index ? geo.index.array : null;
  const nF = index ? index.length / 3 : pos.count / 3;
  const gi = index ? (f, k) => index[f * 3 + k] : (f, k) => f * 3 + k;
  const v = new THREE.Vector3();
  const tri = new Float32Array(nF * 9), nrm = new Float32Array(nF * 3);

  let minx = Infinity, miny = Infinity, minz = Infinity, maxx = -Infinity, maxy = -Infinity, maxz = -Infinity;
  for (let f = 0; f < nF; f++) {
    const o = f * 9;
    for (let k = 0; k < 3; k++) {
      v.fromBufferAttribute(pos, gi(f, k)).applyMatrix4(matrix);
      tri[o + k * 3] = v.x; tri[o + k * 3 + 1] = v.y; tri[o + k * 3 + 2] = v.z;
      if (v.x < minx) minx = v.x; if (v.y < miny) miny = v.y; if (v.z < minz) minz = v.z;
      if (v.x > maxx) maxx = v.x; if (v.y > maxy) maxy = v.y; if (v.z > maxz) maxz = v.z;
    }
    // face normal
    const e1x = tri[o + 3] - tri[o], e1y = tri[o + 4] - tri[o + 1], e1z = tri[o + 5] - tri[o + 2];
    const e2x = tri[o + 6] - tri[o], e2y = tri[o + 7] - tri[o + 1], e2z = tri[o + 8] - tri[o + 2];
    let nx = e1y * e2z - e1z * e2y, ny = e1z * e2x - e1x * e2z, nz = e1x * e2y - e1y * e2x;
    const nl = Math.hypot(nx, ny, nz) || 1;
    nrm[f * 3] = nx / nl; nrm[f * 3 + 1] = ny / nl; nrm[f * 3 + 2] = nz / nl;
  }
  const ex = maxx - minx || 1e-6, ey = maxy - miny || 1e-6, ez = maxz - minz || 1e-6;
  const cs = Math.max(Math.cbrt((ex * ey * ez) / Math.max(1, nF)), Math.hypot(ex, ey, ez) / 64);
  const nx = Math.max(1, Math.min(64, Math.ceil(ex / cs)));
  const ny = Math.max(1, Math.min(64, Math.ceil(ey / cs)));
  const nz = Math.max(1, Math.min(64, Math.ceil(ez / cs)));
  const csx = ex / nx, csy = ey / ny, csz = ez / nz;
  const clamp = (val, n) => val < 0 ? 0 : val >= n ? n - 1 : val;
  const cidx = (ix, iy, iz) => (iz * ny + iy) * nx + ix;
  const cells = new Array(nx * ny * nz);
  for (let f = 0; f < nF; f++) {
    const o = f * 9;
    const lx = Math.min(tri[o], tri[o + 3], tri[o + 6]), hx = Math.max(tri[o], tri[o + 3], tri[o + 6]);
    const ly = Math.min(tri[o + 1], tri[o + 4], tri[o + 7]), hy = Math.max(tri[o + 1], tri[o + 4], tri[o + 7]);
    const lz = Math.min(tri[o + 2], tri[o + 5], tri[o + 8]), hz = Math.max(tri[o + 2], tri[o + 5], tri[o + 8]);
    for (let iz = clamp(Math.floor((lz - minz) / csz), nz); iz <= clamp(Math.floor((hz - minz) / csz), nz); iz++)
      for (let iy = clamp(Math.floor((ly - miny) / csy), ny); iy <= clamp(Math.floor((hy - miny) / csy), ny); iy++)
        for (let ix = clamp(Math.floor((lx - minx) / csx), nx); ix <= clamp(Math.floor((hx - minx) / csx), nx); ix++) {
          const c = cidx(ix, iy, iz);
          (cells[c] || (cells[c] = [])).push(f);
        }
  }
  return { tri, nrm, cells, minx, miny, minz, nx, ny, nz, csx, csy, csz, cidx, clamp, cellMin: Math.min(csx, csy, csz) };
}

// Nearest point on the reference surface, with the face normal there. Expands in
// Chebyshev shells until no nearer cell can hold a closer triangle.
const _cp = new Float32Array(3);
function nearest(g, px, py, pz, res) {
  const ix0 = g.clamp(Math.floor((px - g.minx) / g.csx), g.nx);
  const iy0 = g.clamp(Math.floor((py - g.miny) / g.csy), g.ny);
  const iz0 = g.clamp(Math.floor((pz - g.minz) / g.csz), g.nz);
  let best = Infinity, bestF = -1;
  const maxR = g.nx + g.ny + g.nz;
  for (let r = 0; r <= maxR; r++) {
    const zlo = Math.max(0, iz0 - r), zhi = Math.min(g.nz - 1, iz0 + r);
    const ylo = Math.max(0, iy0 - r), yhi = Math.min(g.ny - 1, iy0 + r);
    const xlo = Math.max(0, ix0 - r), xhi = Math.min(g.nx - 1, ix0 + r);
    for (let iz = zlo; iz <= zhi; iz++) for (let iy = ylo; iy <= yhi; iy++) for (let ix = xlo; ix <= xhi; ix++) {
      if (Math.max(Math.abs(ix - ix0), Math.abs(iy - iy0), Math.abs(iz - iz0)) !== r) continue; // shell only
      const arr = g.cells[g.cidx(ix, iy, iz)];
      if (!arr) continue;
      for (let a = 0; a < arr.length; a++) {
        const f = arr[a], d2 = closestOnTri(px, py, pz, g.tri, f * 9, _cp);
        if (d2 < best) { best = d2; bestF = f; res.qx = _cp[0]; res.qy = _cp[1]; res.qz = _cp[2]; }
      }
    }
    if (bestF >= 0 && Math.sqrt(best) <= r * g.cellMin) break; // nothing nearer can remain
  }
  res.d2 = best; res.f = bestF;
  return bestF >= 0;
}

// ── Signed deviation of the test mesh against a reference grid ──
export function computeDeviation(testGeo, testMatrix, grid) {
  const pos = testGeo.attributes.position, nV = pos.count;
  const dev = new Float32Array(nV);
  const v = new THREE.Vector3(), res = {};
  let sum2 = 0, n = 0, min = Infinity, max = -Infinity;
  for (let i = 0; i < nV; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(testMatrix);
    if (!nearest(grid, v.x, v.y, v.z, res)) { dev[i] = NaN; continue; }
    const d = Math.sqrt(res.d2);
    const o = res.f * 3;
    const dot = (v.x - res.qx) * grid.nrm[o] + (v.y - res.qy) * grid.nrm[o + 1] + (v.z - res.qz) * grid.nrm[o + 2];
    const s = dot < 0 ? -d : d;
    dev[i] = s;
    sum2 += s * s; n++; if (s < min) min = s; if (s > max) max = s;
  }
  return { dev, rms: n ? Math.sqrt(sum2 / n) : 0, min: isFinite(min) ? min : 0, max: isFinite(max) ? max : 0 };
}

// ── Symmetric eigensolver (cyclic Jacobi), any size; used 4x4 for Horn ──
function jacobi(Ain, n) {
  const a = Ain.map(r => r.slice());
  const v = Array.from({ length: n }, (_, i) => Array.from({ length: n }, (_, j) => i === j ? 1 : 0));
  for (let sweep = 0; sweep < 60; sweep++) {
    let off = 0;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) off += Math.abs(a[p][q]);
    if (off < 1e-14) break;
    for (let p = 0; p < n; p++) for (let q = p + 1; q < n; q++) {
      if (Math.abs(a[p][q]) < 1e-18) continue;
      const phi = 0.5 * Math.atan2(2 * a[p][q], a[q][q] - a[p][p]);
      const c = Math.cos(phi), s = Math.sin(phi);
      for (let k = 0; k < n; k++) { const akp = a[k][p], akq = a[k][q]; a[k][p] = c * akp - s * akq; a[k][q] = s * akp + c * akq; }
      for (let k = 0; k < n; k++) { const apk = a[p][k], aqk = a[q][k]; a[p][k] = c * apk - s * aqk; a[q][k] = s * apk + c * aqk; }
      for (let k = 0; k < n; k++) { const vkp = v[k][p], vkq = v[k][q]; v[k][p] = c * vkp - s * vkq; v[k][q] = s * vkp + c * vkq; }
    }
  }
  return { vals: a.map((r, i) => r[i]), vecs: v };
}

// One rigid alignment from corresponding point sets P (test) → Q (ref), Horn 1987.
function rigidFromCorrespondences(P, Q, n) {
  let pcx = 0, pcy = 0, pcz = 0, qcx = 0, qcy = 0, qcz = 0;
  for (let i = 0; i < n; i++) {
    pcx += P[i * 3]; pcy += P[i * 3 + 1]; pcz += P[i * 3 + 2];
    qcx += Q[i * 3]; qcy += Q[i * 3 + 1]; qcz += Q[i * 3 + 2];
  }
  pcx /= n; pcy /= n; pcz /= n; qcx /= n; qcy /= n; qcz /= n;
  let Sxx = 0, Sxy = 0, Sxz = 0, Syx = 0, Syy = 0, Syz = 0, Szx = 0, Szy = 0, Szz = 0;
  for (let i = 0; i < n; i++) {
    const px = P[i * 3] - pcx, py = P[i * 3 + 1] - pcy, pz = P[i * 3 + 2] - pcz;
    const qx = Q[i * 3] - qcx, qy = Q[i * 3 + 1] - qcy, qz = Q[i * 3 + 2] - qcz;
    Sxx += px * qx; Sxy += px * qy; Sxz += px * qz;
    Syx += py * qx; Syy += py * qy; Syz += py * qz;
    Szx += pz * qx; Szy += pz * qy; Szz += pz * qz;
  }
  const N = [
    [Sxx + Syy + Szz, Syz - Szy, Szx - Sxz, Sxy - Syx],
    [Syz - Szy, Sxx - Syy - Szz, Sxy + Syx, Szx + Sxz],
    [Szx - Sxz, Sxy + Syx, -Sxx + Syy - Szz, Syz + Szy],
    [Sxy - Syx, Szx + Sxz, Syz + Szy, -Sxx - Syy + Szz],
  ];
  const { vals, vecs } = jacobi(N, 4);
  let mi = 0; for (let i = 1; i < 4; i++) if (vals[i] > vals[mi]) mi = i;
  const qw = vecs[0][mi], qx = vecs[1][mi], qy = vecs[2][mi], qz = vecs[3][mi];
  const quat = new THREE.Quaternion(qx, qy, qz, qw).normalize();
  const R = new THREE.Matrix4().makeRotationFromQuaternion(quat);
  const cP = new THREE.Vector3(pcx, pcy, pcz).applyMatrix4(R);
  const t = new THREE.Vector3(qcx, qcy, qcz).sub(cP);
  return new THREE.Matrix4().setPosition(t).multiply(R);
}

// Register the test mesh onto the reference grid. Returns the world-space
// transform to apply to the test object (and the final RMS correspondence error).
export function icpAlign(testGeo, testMatrix, grid, iterations = 18, sampleMax = 4000) {
  const pos = testGeo.attributes.position, nV = pos.count;
  const stride = Math.max(1, Math.floor(nV / sampleMax));
  const sample = [];
  const v = new THREE.Vector3();
  for (let i = 0; i < nV; i += stride) { v.fromBufferAttribute(pos, i).applyMatrix4(testMatrix); sample.push(v.x, v.y, v.z); }
  const n = sample.length / 3;
  let P = new Float32Array(sample);
  const Q = new Float32Array(n * 3);
  const accum = new THREE.Matrix4();
  const res = {}, p = new THREE.Vector3();
  let rms = 0;
  for (let it = 0; it < iterations; it++) {
    let sum2 = 0;
    for (let i = 0; i < n; i++) {
      nearest(grid, P[i * 3], P[i * 3 + 1], P[i * 3 + 2], res);
      Q[i * 3] = res.qx; Q[i * 3 + 1] = res.qy; Q[i * 3 + 2] = res.qz;
      sum2 += res.d2;
    }
    rms = Math.sqrt(sum2 / n);
    const T = rigidFromCorrespondences(P, Q, n);
    accum.premultiply(T);
    for (let i = 0; i < n; i++) { p.set(P[i * 3], P[i * 3 + 1], P[i * 3 + 2]).applyMatrix4(T); P[i * 3] = p.x; P[i * 3 + 1] = p.y; P[i * 3 + 2] = p.z; }
    // Stop once the step is tiny relative to the cell size.
    const step = Math.hypot(T.elements[12], T.elements[13], T.elements[14]);
    if (step < grid.cellMin * 1e-3 && it > 2) break;
  }
  return { transform: accum, rms };
}

export { buildGrid };
