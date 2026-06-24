// ══════════════════════════════════════════
//  WALL THICKNESS
//  For each surface vertex, cast a ray inward along the reverse normal and
//  measure the distance to the opposite wall. The result is a per-vertex scalar
//  field, colour-mapped like curvature. Vertices whose ray finds no opposite
//  surface (open boundaries) come back NaN and render neutral.
//
//  To stay local-first (no BVH dependency) the triangles are binned into a
//  uniform grid; each ray walks the grid cell by cell (Amanatides and Woo) and
//  tests only the triangles it meets (Möller and Trumbore), which is near-linear
//  in practice instead of the naive vertices x triangles.
// ══════════════════════════════════════════

import { App } from '../core/state.js';

export function computeThickness(geo) {
  const posAttr = geo.attributes.position, norAttr = geo.attributes.normal;
  const pos = posAttr.array, nor = norAttr.array;
  const index = geo.index ? geo.index.array : null;
  const nV = posAttr.count;
  const nF = index ? index.length / 3 : nV / 3;
  const vi = index ? (f, k) => index[f * 3 + k] : (f, k) => f * 3 + k;

  // ── Bounds ──
  let minx = Infinity, miny = Infinity, minz = Infinity, maxx = -Infinity, maxy = -Infinity, maxz = -Infinity;
  for (let i = 0; i < nV; i++) {
    const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
    if (x < minx) minx = x; if (y < miny) miny = y; if (z < minz) minz = z;
    if (x > maxx) maxx = x; if (y > maxy) maxy = y; if (z > maxz) maxz = z;
  }
  const ex = maxx - minx || 1e-6, ey = maxy - miny || 1e-6, ez = maxz - minz || 1e-6;
  const diag = Math.hypot(ex, ey, ez);
  const eps = diag * 1e-4;

  // ── Grid resolution: aim for roughly cubic cells, a few triangles each ──
  const cell = Math.cbrt((ex * ey * ez) / Math.max(1, nF));
  const cs = Math.max(cell, diag / 64);
  const nx = Math.max(1, Math.min(64, Math.ceil(ex / cs)));
  const ny = Math.max(1, Math.min(64, Math.ceil(ey / cs)));
  const nz = Math.max(1, Math.min(64, Math.ceil(ez / cs)));
  const csx = ex / nx, csy = ey / ny, csz = ez / nz;
  const cidx = (ix, iy, iz) => (iz * ny + iy) * nx + ix;
  const clamp = (v, n) => v < 0 ? 0 : v >= n ? n - 1 : v;

  // ── Bin triangles into cells (lazy arrays so empty cells cost nothing) ──
  // The signed volume is accumulated alongside, to tell which way the normals
  // face on a closed mesh.
  const cells = new Array(nx * ny * nz);
  const tri = new Float32Array(nF * 9);                    // a,b,c packed per face
  let vol6 = 0;
  for (let f = 0; f < nF; f++) {
    const i0 = vi(f, 0) * 3, i1 = vi(f, 1) * 3, i2 = vi(f, 2) * 3;
    const o = f * 9;
    tri[o] = pos[i0]; tri[o + 1] = pos[i0 + 1]; tri[o + 2] = pos[i0 + 2];
    tri[o + 3] = pos[i1]; tri[o + 4] = pos[i1 + 1]; tri[o + 5] = pos[i1 + 2];
    tri[o + 6] = pos[i2]; tri[o + 7] = pos[i2 + 1]; tri[o + 8] = pos[i2 + 2];
    vol6 += tri[o] * (tri[o + 4] * tri[o + 8] - tri[o + 5] * tri[o + 7])
          + tri[o + 1] * (tri[o + 5] * tri[o + 6] - tri[o + 3] * tri[o + 8])
          + tri[o + 2] * (tri[o + 3] * tri[o + 7] - tri[o + 4] * tri[o + 6]);
    const lx = Math.min(tri[o], tri[o + 3], tri[o + 6]), hx = Math.max(tri[o], tri[o + 3], tri[o + 6]);
    const ly = Math.min(tri[o + 1], tri[o + 4], tri[o + 7]), hy = Math.max(tri[o + 1], tri[o + 4], tri[o + 7]);
    const lz = Math.min(tri[o + 2], tri[o + 5], tri[o + 8]), hz = Math.max(tri[o + 2], tri[o + 5], tri[o + 8]);
    const ax0 = clamp(Math.floor((lx - minx) / csx), nx), ax1 = clamp(Math.floor((hx - minx) / csx), nx);
    const ay0 = clamp(Math.floor((ly - miny) / csy), ny), ay1 = clamp(Math.floor((hy - miny) / csy), ny);
    const az0 = clamp(Math.floor((lz - minz) / csz), nz), az1 = clamp(Math.floor((hz - minz) / csz), nz);
    for (let iz = az0; iz <= az1; iz++)
      for (let iy = ay0; iy <= ay1; iy++)
        for (let ix = ax0; ix <= ax1; ix++) {
          const c = cidx(ix, iy, iz);
          (cells[c] || (cells[c] = [])).push(f);
        }
  }

  // ── Möller-Trumbore, two-sided, forward hits beyond eps ──
  function hit(f, ox, oy, oz, dx, dy, dz) {
    const o = f * 9;
    const ax = tri[o], ay = tri[o + 1], az = tri[o + 2];
    const e1x = tri[o + 3] - ax, e1y = tri[o + 4] - ay, e1z = tri[o + 5] - az;
    const e2x = tri[o + 6] - ax, e2y = tri[o + 7] - ay, e2z = tri[o + 8] - az;
    const px = dy * e2z - dz * e2y, py = dz * e2x - dx * e2z, pz = dx * e2y - dy * e2x;
    const det = e1x * px + e1y * py + e1z * pz;
    if (det > -1e-12 && det < 1e-12) return Infinity;
    const inv = 1 / det;
    const tx = ox - ax, ty = oy - ay, tz = oz - az;
    const u = (tx * px + ty * py + tz * pz) * inv;
    if (u < -1e-6 || u > 1 + 1e-6) return Infinity;
    const qx = ty * e1z - tz * e1y, qy = tz * e1x - tx * e1z, qz = tx * e1y - ty * e1x;
    const v = (dx * qx + dy * qy + dz * qz) * inv;
    if (v < -1e-6 || u + v > 1 + 1e-6) return Infinity;
    const t = (e2x * qx + e2y * qy + e2z * qz) * inv;
    return t > eps ? t : Infinity;
  }

  // The ray goes into the solid: -normal for the usual outward winding, +normal
  // if a watertight mesh turns out to be wound inward (negative signed volume).
  const watertight = App.qual ? App.qual.boundaryEdges === 0 : true;
  const dir = (watertight && vol6 < 0) ? 1 : -1;

  // ── One inward ray per vertex ──
  const out = new Float32Array(nV);
  for (let i = 0; i < nV; i++) {
    let nx0 = nor[i * 3], ny0 = nor[i * 3 + 1], nz0 = nor[i * 3 + 2];
    const nl = Math.hypot(nx0, ny0, nz0);
    if (nl < 1e-9) { out[i] = NaN; continue; }
    nx0 /= nl; ny0 /= nl; nz0 /= nl;
    const dx = dir * nx0, dy = dir * ny0, dz = dir * nz0;   // into the solid
    const ox = pos[i * 3] + dx * eps, oy = pos[i * 3 + 1] + dy * eps, oz = pos[i * 3 + 2] + dz * eps;

    let ix = clamp(Math.floor((ox - minx) / csx), nx);
    let iy = clamp(Math.floor((oy - miny) / csy), ny);
    let iz = clamp(Math.floor((oz - minz) / csz), nz);
    const stepX = dx > 0 ? 1 : dx < 0 ? -1 : 0;
    const stepY = dy > 0 ? 1 : dy < 0 ? -1 : 0;
    const stepZ = dz > 0 ? 1 : dz < 0 ? -1 : 0;
    const bound = (o, d, mn, cw, idx, step, n) => step === 0 ? Infinity : (mn + (idx + (step > 0 ? 1 : 0)) * cw - o) / d;
    let tMaxX = bound(ox, dx, minx, csx, ix, stepX, nx);
    let tMaxY = bound(oy, dy, miny, csy, iy, stepY, ny);
    let tMaxZ = bound(oz, dz, minz, csz, iz, stepZ, nz);
    const tDeltaX = stepX ? Math.abs(csx / dx) : Infinity;
    const tDeltaY = stepY ? Math.abs(csy / dy) : Infinity;
    const tDeltaZ = stepZ ? Math.abs(csz / dz) : Infinity;

    let closest = Infinity, guard = nx + ny + nz + 3;
    while (guard-- > 0) {
      const arr = cells[cidx(ix, iy, iz)];
      if (arr) for (let a = 0; a < arr.length; a++) {
        const t = hit(arr[a], ox, oy, oz, dx, dy, dz);
        if (t < closest) closest = t;
      }
      const tExit = Math.min(tMaxX, tMaxY, tMaxZ);
      if (closest <= tExit) break;                          // nearest hit is already behind us
      if (tMaxX <= tMaxY && tMaxX <= tMaxZ) { ix += stepX; if (ix < 0 || ix >= nx) break; tMaxX += tDeltaX; }
      else if (tMaxY <= tMaxZ) { iy += stepY; if (iy < 0 || iy >= ny) break; tMaxY += tDeltaY; }
      else { iz += stepZ; if (iz < 0 || iz >= nz) break; tMaxZ += tDeltaZ; }
    }
    out[i] = isFinite(closest) ? closest : NaN;
  }
  return out;
}
