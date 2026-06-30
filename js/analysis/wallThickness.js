// ══════════════════════════════════════════
//  WALL THICKNESS — Shape Diameter Function via cone-median ray-casting
//
//  At each vertex, casts numRays rays inward within a cone of half-angle
//  coneAngleDeg around the inverted vertex normal, then takes the MEDIAN
//  of valid hit distances as the local wall thickness.
//
//  The median (vs. minimum or mean) suppresses noise from mesh irregularities,
//  self-intersections, and surface holes — critical for thin ceramic walls.
//
//  Reference: Shapira et al. (2008), "Consistent mesh partitioning and
//  skeletonisation using the shape diameter function." The Visual Computer.
//
//  Dependencies: three-mesh-bvh (added to importmap in index.html)
//
//  Performance: O(n × numRays × log n).  For meshes with >50,000 vertices,
//  use subsample ≥ 2.  For >200,000 vertices, use subsample ≥ 4.
//  TODO: offload to a Web Worker for large meshes to avoid main-thread blocking.
// ══════════════════════════════════════════

import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { computeVertexNormals } from './meshUtils.js';

/**
 * Compute local wall thickness at each vertex via cone-median ray-casting.
 *
 * @param {THREE.Mesh} mesh — near-closed geometry (open meshes work but coverage drops)
 * @param {{
 *   numRays?:              number,  — rays per cone (default: 11; odd for clean median)
 *   coneAngleDeg?:         number,  — cone half-angle in degrees (default: 30)
 *   maxThickness?:         number,  — discard hits farther than this (default: Infinity)
 *   minThickness?:         number,  — discard hits closer than this; avoids self-hit (default: 0.001)
 *   onlyOppositeNormals?:  boolean, — only count hits where face normal opposes ray (default: true)
 *   subsample?:            number,  — compute every Nth vertex; gaps filled by nearest (default: 1)
 * }} [options]
 * @returns {{
 *   perVertexThickness: Float32Array, — NaN where no reliable measurement
 *   mean:     number,
 *   median:   number,
 *   stddev:   number,
 *   cv:       number,  — coefficient of variation (stddev/mean); proxy for uniformity
 *   min:      number,
 *   max:      number,
 *   histogram: { bins: number[], counts: number[], edges: number[] },
 *   validVertexCount:  number,
 *   coveragePercent:   number,
 * }}
 */
export function computeWallThickness(mesh, options = {}) {
  const {
    numRays             = 11,
    coneAngleDeg        = 30,
    maxThickness        = Infinity,
    minThickness        = 0.001,
    onlyOppositeNormals = true,
    subsample           = 1,
  } = options;

  const geometry  = mesh.geometry;
  const bvh       = new MeshBVH(geometry);
  const pos       = geometry.attributes.position;
  const nV        = pos.count;
  const coneRad   = coneAngleDeg * (Math.PI / 180);
  const offsetDist = minThickness * 0.5; // origin offset to clear self-intersection

  // Use existing normals or compute from geometry
  const normArray = geometry.attributes.normal
    ? geometry.attributes.normal.array
    : computeVertexNormals(geometry);

  const perVertexThickness = new Float32Array(nV).fill(NaN);

  // Reusable objects (avoid per-vertex allocation)
  const _origin = new THREE.Vector3();
  const _dir    = new THREE.Vector3();
  const _u      = new THREE.Vector3();
  const _v      = new THREE.Vector3();
  const _nIn    = new THREE.Vector3(); // inward normal
  const _ray    = new THREE.Ray();

  for (let i = 0; i < nV; i += subsample) {
    const nx = normArray[i*3], ny = normArray[i*3+1], nz = normArray[i*3+2];
    const nLen = Math.sqrt(nx*nx + ny*ny + nz*nz);
    if (nLen < 1e-8) continue;

    // Inward normal: negate the outward vertex normal
    _nIn.set(-nx/nLen, -ny/nLen, -nz/nLen);

    // Build local tangent frame (u, v) perpendicular to the inward normal
    _u.set(1, 0, 0);
    if (Math.abs(_nIn.dot(_u)) > 0.9) _u.set(0, 1, 0);
    _v.crossVectors(_nIn, _u).normalize();
    _u.crossVectors(_v, _nIn).normalize();

    // Offset ray origin along inward normal to avoid self-intersection
    const px = pos.getX(i), py = pos.getY(i), pz = pos.getZ(i);
    _origin.set(
      px + _nIn.x * offsetDist,
      py + _nIn.y * offsetDist,
      pz + _nIn.z * offsetDist,
    );

    // Cast cone rays with stratified sampling (uniform disk, not polar clustering)
    const hits = [];
    for (let j = 0; j < numRays; j++) {
      const azimuth = (j / numRays) * 2 * Math.PI;
      // Stratified radial sample: sqrt gives uniform area distribution in disk
      const rFrac = Math.sqrt((j + 0.5) / numRays);
      const rCone = Math.tan(coneRad) * rFrac;

      _dir.set(
        _nIn.x + rCone * (Math.cos(azimuth)*_u.x + Math.sin(azimuth)*_v.x),
        _nIn.y + rCone * (Math.cos(azimuth)*_u.y + Math.sin(azimuth)*_v.y),
        _nIn.z + rCone * (Math.cos(azimuth)*_u.z + Math.sin(azimuth)*_v.z),
      ).normalize();

      _ray.set(_origin, _dir);
      // near = offsetDist to skip the already-cleared zone
      const hit = bvh.raycastFirst(_ray, THREE.DoubleSide, offsetDist, maxThickness);
      if (!hit) continue;

      if (onlyOppositeNormals) {
        // Keep only hits where the face normal opposes the ray direction.
        // For a thin-walled mesh with outward normals: the opposite wall's face
        // normal points outward (away from vessel interior), which opposes an
        // inward-pointing ray → dot < 0 → keep.
        const fn = hit.face.normal;
        if (fn.x*_dir.x + fn.y*_dir.y + fn.z*_dir.z >= 0) continue;
      }

      hits.push(hit.distance);
    }

    // Median of valid hits; require at least ⌈numRays/3⌉ to avoid noisy single hits
    if (hits.length >= Math.max(3, Math.ceil(numRays / 3))) {
      hits.sort((a, b) => a-b);
      const m = Math.floor(hits.length / 2);
      perVertexThickness[i] = hits.length%2===0 ? (hits[m-1]+hits[m])/2 : hits[m];
    }
  }

  // Fill skipped vertices (subsample > 1) from nearest sampled neighbor
  if (subsample > 1) {
    for (let i = 0; i < nV; i++) {
      if (!isNaN(perVertexThickness[i])) continue;
      // Find the nearest sampled index
      const lower = Math.floor(i / subsample) * subsample;
      const upper = lower + subsample;
      if (lower >= 0       && !isNaN(perVertexThickness[lower])) { perVertexThickness[i] = perVertexThickness[lower]; continue; }
      if (upper < nV       && !isNaN(perVertexThickness[upper])) { perVertexThickness[i] = perVertexThickness[upper]; }
    }
  }

  // Summary statistics from valid (non-NaN) values
  const validVals = [];
  for (let i = 0; i < nV; i++) {
    if (!isNaN(perVertexThickness[i])) validVals.push(perVertexThickness[i]);
  }
  const validVertexCount = validVals.length;
  const coveragePercent  = (validVertexCount / nV) * 100;

  if (validVals.length === 0) {
    return {
      perVertexThickness,
      mean: NaN, median: NaN, stddev: NaN, cv: NaN, min: NaN, max: NaN,
      histogram: { bins: [], counts: [], edges: [] },
      validVertexCount: 0, coveragePercent: 0,
    };
  }

  validVals.sort((a, b) => a-b);
  const mean = validVals.reduce((s, v) => s+v, 0) / validVals.length;
  const variance = validVals.reduce((s, v) => s+(v-mean)**2, 0) / validVals.length;
  const stddev = Math.sqrt(variance);
  const cv     = mean > 0 ? stddev / mean : NaN;
  const minT   = validVals[0];
  const maxT   = validVals[validVals.length-1];
  const midIdx = Math.floor(validVals.length / 2);
  const median = validVals.length%2===0 ? (validVals[midIdx-1]+validVals[midIdx])/2 : validVals[midIdx];

  // 20-bin histogram
  const nBins   = 20;
  const bw      = (maxT - minT) / nBins || 1;
  const hCounts = new Array(nBins).fill(0);
  const hEdges  = Array.from({ length: nBins+1 }, (_, k) => minT + k*bw);
  for (const v of validVals) {
    const b = Math.min(nBins-1, Math.max(0, Math.floor((v-minT)/bw)));
    hCounts[b]++;
  }
  const hBins = Array.from({ length: nBins }, (_, k) => (hEdges[k]+hEdges[k+1])/2);

  return {
    perVertexThickness,
    mean, median, stddev, cv,
    min: minT, max: maxT,
    histogram: { bins: hBins, counts: hCounts, edges: hEdges },
    validVertexCount,
    coveragePercent,
  };
}
