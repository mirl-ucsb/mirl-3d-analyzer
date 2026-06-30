// ══════════════════════════════════════════
//  MESH DEVIATION — signed closest-point distance between two scans
//
//  Compares an earlier reference scan (source) to a later scan (target)
//  to detect surface change, material loss/gain, or deformation.
//
//  Sign convention:
//    positive  = target is proud of source (material added, or source eroded)
//    negative  = target is below source (material lost, or target eroded)
//
//  Algorithm: BVH accelerated closest-point query per source vertex → O(n log n).
//
//  Dependencies: three-mesh-bvh (added to importmap in index.html)
//
//  NOTE: both meshes must be in the same coordinate space. If either mesh
//  has a non-identity transform, call geometry.applyMatrix4(mesh.matrixWorld)
//  before passing geometry into this function.
// ══════════════════════════════════════════

import * as THREE from 'three';
import { MeshBVH } from 'three-mesh-bvh';
import { computeVertexAreas } from './meshUtils.js';

/**
 * Compute per-vertex signed surface deviation between two mesh scans.
 *
 * @param {THREE.Mesh} sourceMesh — earlier / reference scan
 * @param {THREE.Mesh} targetMesh — later / comparison scan
 * @param {{
 *   signedDistance?: boolean, // sign by source normal (default: true)
 *   hausdorff?:      boolean, // symmetric Hausdorff distance (default: true; 2× slower)
 *   maxDistance?:    number,  // clamp / ignore hits beyond this (default: Infinity)
 * }} [options]
 * @returns {{
 *   perVertexDistance:      Float32Array,
 *   rmsDeviation:           number,
 *   meanDeviation:          number,  — mean of |d_i|
 *   maxDeviation:           number,  — max |d_i| (one-sided Hausdorff, source→target)
 *   hausdorffDistance:      number,  — symmetric max(src→tgt, tgt→src)
 *   positiveVolume:         number,  — approx. volume of surface gain (geometry units³)
 *   negativeVolume:         number,  — approx. volume of surface loss
 *   histogram:              { bins: number[], counts: number[], edges: number[] },
 *   levelOfDetection:       number,  — 2 × rmsDeviation (practical LoD threshold)
 *   significantChangePercent: number,
 *   colorRange:             { min: number, max: number }, — for diverging colormap
 * }}
 */
export function computeMeshDeviation(sourceMesh, targetMesh, options = {}) {
  const { signedDistance = true, hausdorff = true, maxDistance = Infinity } = options;

  const srcGeo = sourceMesh.geometry;
  const tgtGeo = targetMesh.geometry;
  const srcPos = srcGeo.attributes.position;
  const nV = srcPos.count;

  // Build BVH on target (does not modify geometry)
  const tgtBVH = new MeshBVH(tgtGeo);

  // Ensure source vertex normals exist for sign computation
  if (signedDistance && !srcGeo.attributes.normal) srcGeo.computeVertexNormals();
  const srcNorms = signedDistance ? srcGeo.attributes.normal.array : null;

  const perVertexDistance = new Float32Array(nV);
  const _pt  = new THREE.Vector3();
  const _nrm = new THREE.Vector3();
  const _disp = new THREE.Vector3();
  const _closest = { point: new THREE.Vector3(), distance: 0, faceIndex: -1 };

  let sumSq = 0, sumAbs = 0, maxAbs = 0;

  for (let i = 0; i < nV; i++) {
    _pt.set(srcPos.getX(i), srcPos.getY(i), srcPos.getZ(i));

    // Closest point on target surface
    const hit = tgtBVH.closestPointToPoint(_pt, _closest, 0, maxDistance);
    if (!hit) { perVertexDistance[i] = NaN; continue; }

    const dist = _closest.distance;
    let d = dist;

    if (signedDistance) {
      // Sign: positive when displacement src→tgt aligns with source normal
      _nrm.set(srcNorms[i*3], srcNorms[i*3+1], srcNorms[i*3+2]);
      _disp.copy(_closest.point).sub(_pt);
      d = _disp.dot(_nrm) >= 0 ? dist : -dist;
    }

    perVertexDistance[i] = d;
    const absD = Math.abs(d);
    sumSq   += d * d;
    sumAbs  += absD;
    if (absD > maxAbs) maxAbs = absD;
  }

  const rmsDeviation  = Math.sqrt(sumSq / nV);
  const meanDeviation = sumAbs / nV;
  const maxDeviation  = maxAbs;

  // Symmetric Hausdorff: also query target vertices against source BVH
  let hausdorffDistance = maxDeviation;
  if (hausdorff) {
    const srcBVH = new MeshBVH(srcGeo);
    const tgtPos = tgtGeo.attributes.position;
    const nVT    = tgtPos.count;
    let maxTgt   = 0;
    const _tgtPt = new THREE.Vector3();
    const _tgtCl = { point: new THREE.Vector3(), distance: 0, faceIndex: -1 };
    for (let i = 0; i < nVT; i++) {
      _tgtPt.set(tgtPos.getX(i), tgtPos.getY(i), tgtPos.getZ(i));
      const h = srcBVH.closestPointToPoint(_tgtPt, _tgtCl, 0, maxDistance);
      if (h && _tgtCl.distance > maxTgt) maxTgt = _tgtCl.distance;
    }
    hausdorffDistance = Math.max(maxDeviation, maxTgt);
  }

  // Volume estimate: Σ |d_i| · vertexArea_i (split by sign)
  const vAreas = computeVertexAreas(srcGeo);
  let positiveVolume = 0, negativeVolume = 0;
  for (let i = 0; i < nV; i++) {
    const d = perVertexDistance[i];
    if (!isFinite(d)) continue;
    if (d > 0) positiveVolume +=  d * vAreas[i];
    else       negativeVolume += -d * vAreas[i];
  }

  // 20-bin histogram over signed distances
  const nBins   = 20;
  const histMin = -maxAbs, histMax = maxAbs;
  const bw      = (histMax - histMin) / nBins || 1;
  const hCounts = new Array(nBins).fill(0);
  const hEdges  = Array.from({ length: nBins+1 }, (_, k) => histMin + k*bw);
  for (let i = 0; i < nV; i++) {
    if (!isFinite(perVertexDistance[i])) continue;
    const b = Math.min(nBins-1, Math.max(0, Math.floor((perVertexDistance[i]-histMin)/bw)));
    hCounts[b]++;
  }
  const hBins = Array.from({ length: nBins }, (_, k) => (hEdges[k]+hEdges[k+1])/2);

  const levelOfDetection = 2 * rmsDeviation;
  let significantCount = 0;
  for (let i = 0; i < nV; i++)
    if (isFinite(perVertexDistance[i]) && Math.abs(perVertexDistance[i]) > levelOfDetection) significantCount++;
  const significantChangePercent = (significantCount / nV) * 100;

  return {
    perVertexDistance,
    rmsDeviation,
    meanDeviation,
    maxDeviation,
    hausdorffDistance,
    positiveVolume,
    negativeVolume,
    histogram:   { bins: hBins, counts: hCounts, edges: hEdges },
    levelOfDetection,
    significantChangePercent,
    colorRange:  { min: -maxAbs, max: maxAbs }, // blue=loss, white=no change, red=gain
  };
}
