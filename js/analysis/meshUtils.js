// ══════════════════════════════════════════
//  MESH UTILITIES — shared geometric primitives used by analysis modules
//  All functions handle non-indexed (OBJ-style) geometry via canonical vertex maps.
// ══════════════════════════════════════════

import * as THREE from 'three';

// ── Canonical vertex map (shared helper) ──────────────────────────────────────
// Returns { canon, canonOrig, nC } for a BufferGeometry.
// canon[i] = compact index 0..nC-1 for original vertex i
// canonOrig[ci] = one original vertex index representing canonical vertex ci
function _buildCanonMap(pos, nV) {
  const posToCanon = new Map();
  const canon = new Int32Array(nV);
  const canonOrig = [];
  for (let i = 0; i < nV; i++) {
    const k = `${pos.getX(i)}|${pos.getY(i)}|${pos.getZ(i)}`;
    if (!posToCanon.has(k)) { posToCanon.set(k, canonOrig.length); canonOrig.push(i); }
    canon[i] = posToCanon.get(k);
  }
  return { canon, canonOrig, nC: canonOrig.length };
}

/**
 * Compute area-weighted vertex normals from mesh faces.
 * Handles non-indexed (OBJ-style) BufferGeometry via canonical deduplication.
 * @param {THREE.BufferGeometry} geometry
 * @returns {Float32Array} length nV*3, packed x0,y0,z0, x1,y1,z1, …
 */
export function computeVertexNormals(geometry) {
  const pos = geometry.attributes.position;
  const idx = geometry.index;
  const nV = pos.count;
  const nF = idx ? idx.count / 3 : nV / 3;
  const getI = idx ? (f, v) => idx.getX(f * 3 + v) : (f, v) => f * 3 + v;
  const { canon, nC } = _buildCanonMap(pos, nV);

  const acc = new Float64Array(nC * 3);
  for (let f = 0; f < nF; f++) {
    const ai = getI(f, 0), bi = getI(f, 1), ci = getI(f, 2);
    const ax = pos.getX(ai), ay = pos.getY(ai), az = pos.getZ(ai);
    const bx = pos.getX(bi), by = pos.getY(bi), bz = pos.getZ(bi);
    const cx = pos.getX(ci), cy = pos.getY(ci), cz = pos.getZ(ci);
    // Cross product AB × AC — magnitude is 2*faceArea, direction is face normal
    const abx = bx-ax, aby = by-ay, abz = bz-az;
    const acx = cx-ax, acy = cy-ay, acz = cz-az;
    const nx = aby*acz - abz*acy;
    const ny = abz*acx - abx*acz;
    const nz = abx*acy - aby*acx;
    for (const vi of [canon[ai], canon[bi], canon[ci]]) {
      acc[vi*3]   += nx;
      acc[vi*3+1] += ny;
      acc[vi*3+2] += nz;
    }
  }

  const out = new Float32Array(nV * 3);
  for (let i = 0; i < nV; i++) {
    const ci = canon[i];
    let nx = acc[ci*3], ny = acc[ci*3+1], nz = acc[ci*3+2];
    const len = Math.sqrt(nx*nx + ny*ny + nz*nz);
    if (len > 1e-12) { nx /= len; ny /= len; nz /= len; }
    out[i*3] = nx; out[i*3+1] = ny; out[i*3+2] = nz;
  }
  return out;
}

/**
 * Compute per-vertex Voronoi area (⅓ of sum of adjacent face areas).
 * @param {THREE.BufferGeometry} geometry
 * @returns {Float32Array} length nV
 */
export function computeVertexAreas(geometry) {
  const pos = geometry.attributes.position;
  const idx = geometry.index;
  const nV = pos.count;
  const nF = idx ? idx.count / 3 : nV / 3;
  const getI = idx ? (f, v) => idx.getX(f * 3 + v) : (f, v) => f * 3 + v;
  const { canon, nC } = _buildCanonMap(pos, nV);

  const canonArea = new Float64Array(nC);
  for (let f = 0; f < nF; f++) {
    const ai = getI(f, 0), bi = getI(f, 1), ci = getI(f, 2);
    const ax = pos.getX(ai), ay = pos.getY(ai), az = pos.getZ(ai);
    const bx = pos.getX(bi), by = pos.getY(bi), bz = pos.getZ(bi);
    const cx = pos.getX(ci), cy = pos.getY(ci), cz = pos.getZ(ci);
    const abx = bx-ax, aby = by-ay, abz = bz-az;
    const acx = cx-ax, acy = cy-ay, acz = cz-az;
    const nx = aby*acz - abz*acy, ny = abz*acx - abx*acz, nz = abx*acy - aby*acx;
    const share = Math.sqrt(nx*nx + ny*ny + nz*nz) * 0.5 / 3;
    canonArea[canon[ai]] += share;
    canonArea[canon[bi]] += share;
    canonArea[canon[ci]] += share;
  }

  const out = new Float32Array(nV);
  for (let i = 0; i < nV; i++) out[i] = canonArea[canon[i]];
  return out;
}

/**
 * Fit a plane to a set of 3D points using PCA on the covariance matrix.
 * The plane normal is the eigenvector of the smallest eigenvalue.
 * @param {THREE.Vector3[]} points
 * @returns {{ normal: THREE.Vector3, centroid: THREE.Vector3, u: THREE.Vector3, v: THREE.Vector3 }}
 */
export function computePCAPlane(points) {
  const n = points.length;
  let cx = 0, cy = 0, cz = 0;
  for (const p of points) { cx += p.x; cy += p.y; cz += p.z; }
  cx /= n; cy /= n; cz /= n;

  let xx=0, xy=0, xz=0, yy=0, yz=0, zz=0;
  for (const p of points) {
    const dx = p.x-cx, dy = p.y-cy, dz = p.z-cz;
    xx+=dx*dx; xy+=dx*dy; xz+=dx*dz; yy+=dy*dy; yz+=dy*dz; zz+=dz*dz;
  }

  const { vals, vecs } = _jacobi3([[xx,xy,xz],[xy,yy,yz],[xz,yz,zz]]);

  // Smallest eigenvalue → plane normal; largest → principal tangent u
  let minI = 0, maxI = 0;
  for (let i = 1; i < 3; i++) {
    if (vals[i] < vals[minI]) minI = i;
    if (vals[i] > vals[maxI]) maxI = i;
  }

  const normal   = new THREE.Vector3(vecs[0][minI], vecs[1][minI], vecs[2][minI]).normalize();
  const centroid = new THREE.Vector3(cx, cy, cz);
  const u        = new THREE.Vector3(vecs[0][maxI], vecs[1][maxI], vecs[2][maxI]).normalize();
  const v        = new THREE.Vector3().crossVectors(normal, u).normalize();

  return { normal, centroid, u, v };
}

// 3×3 symmetric Jacobi eigensolver — converges in <10 iterations for typical covariance matrices
function _jacobi3(M) {
  const a = M.map(r => [...r]);
  const V = [[1,0,0],[0,1,0],[0,0,1]];
  for (let it = 0; it < 50; it++) {
    let max = 0, p = 0, q = 1;
    for (let i = 0; i < 3; i++) for (let j = i+1; j < 3; j++)
      if (Math.abs(a[i][j]) > max) { max = Math.abs(a[i][j]); p = i; q = j; }
    if (max < 1e-12) break;
    const theta = (a[q][q]-a[p][p]) / (2*a[p][q]);
    const t = (theta >= 0 ? 1 : -1) / (Math.abs(theta) + Math.sqrt(theta*theta+1));
    const c = 1/Math.sqrt(t*t+1), s = t*c;
    const app=a[p][p], aqq=a[q][q], apq=a[p][q];
    a[p][p]=app-t*apq; a[q][q]=aqq+t*apq; a[p][q]=a[q][p]=0;
    for (let r = 0; r < 3; r++) if (r!==p&&r!==q) {
      const apr=a[p][r], aqr=a[q][r];
      a[p][r]=a[r][p]=c*apr-s*aqr; a[q][r]=a[r][q]=s*apr+c*aqr;
    }
    for (let r = 0; r < 3; r++) {
      const vpr=V[r][p], vqr=V[r][q];
      V[r][p]=c*vpr-s*vqr; V[r][q]=s*vpr+c*vqr;
    }
  }
  return { vals:[a[0][0],a[1][1],a[2][2]], vecs:V };
}

/**
 * 2D convex hull via Graham scan. O(n log n).
 * @param {{ x: number, y: number }[]} points
 * @returns {{ x: number, y: number }[]} hull vertices in CCW order
 */
export function convexHull2D(points) {
  if (points.length < 3) return [...points];

  // Bottom-most (then left-most) point as pivot
  let pivotIdx = 0;
  for (let i = 1; i < points.length; i++) {
    const p = points[i], q = points[pivotIdx];
    if (p.y < q.y || (p.y === q.y && p.x < q.x)) pivotIdx = i;
  }
  const pivot = points[pivotIdx];

  const others = points.filter((_, i) => i !== pivotIdx).sort((a, b) => {
    const ax = a.x-pivot.x, ay = a.y-pivot.y;
    const bx = b.x-pivot.x, by = b.y-pivot.y;
    const cross = ax*by - ay*bx;
    if (Math.abs(cross) > 1e-12) return cross > 0 ? -1 : 1;
    // Collinear: closer first (farther survives pop in scan)
    return (ax*ax+ay*ay) - (bx*bx+by*by);
  });

  if (others.length === 0) return [pivot];
  const hull = [pivot, others[0]];
  for (let i = 1; i < others.length; i++) {
    const c = others[i];
    while (hull.length >= 2) {
      const a = hull[hull.length-2], b = hull[hull.length-1];
      // Cross product (b-a)×(c-a): >0 = CCW turn, keep b; ≤0 = CW/collinear, pop b
      if ((b.x-a.x)*(c.y-a.y) - (b.y-a.y)*(c.x-a.x) > 0) break;
      hull.pop();
    }
    hull.push(c);
  }
  return hull;
}

/**
 * Signed area of a 2D polygon via the shoelace formula.
 * @param {{ x: number, y: number }[]} hull — ordered vertices
 * @returns {number}
 */
export function polygonArea2D(hull) {
  let area = 0;
  const n = hull.length;
  for (let i = 0; i < n; i++) {
    const j = (i+1) % n;
    area += hull[i].x * hull[j].y - hull[j].x * hull[i].y;
  }
  return Math.abs(area) / 2;
}

/**
 * Median of a numeric array, NaN values excluded. O(n log n).
 * @param {number[]|Float32Array} arr
 * @returns {number}
 */
export function medianOfArray(arr) {
  const valid = Array.from(arr).filter(v => isFinite(v)).sort((a, b) => a-b);
  if (!valid.length) return NaN;
  const mid = Math.floor(valid.length / 2);
  return valid.length % 2 === 0 ? (valid[mid-1]+valid[mid])/2 : valid[mid];
}
