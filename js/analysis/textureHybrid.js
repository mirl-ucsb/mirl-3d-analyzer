// ══════════════════════════════════════════
//  SURFACE TEXTURE — ISO 25178 Sdr and Sdq on brushed regions
//
//  Sdr (Developed Interfacial Area Ratio, ISO 25178-2 §4.3.2):
//    Sdr = (A_true − A_projected) / A_projected
//    How much extra surface area the texture develops beyond a flat reference plane.
//    0 = perfectly flat; larger values = more developed (rougher) surface.
//
//  Sdq (Root-Mean-Square Gradient, ISO 25178-2 §4.3.1):
//    Sdq = sqrt( Σ tan²θ_f · a_f_proj / A_projected )
//    RMS of surface slope angles relative to the mean plane.
//    0 = perfectly flat; Sdq = tan(RMS slope angle).
//
//  Both complement the existing Sa/Sq/Sz parameters: Sdr and Sdq capture
//  surface complexity and slope rather than height amplitude.
// ══════════════════════════════════════════

import * as THREE from 'three';
import { computePCAPlane, convexHull2D, polygonArea2D } from './meshUtils.js';

/**
 * Compute ISO 25178 Sdr and Sdq on a brushed region of a mesh.
 *
 * The mean reference plane is fitted by PCA of the selected vertex positions.
 * Projected area uses the 2D convex hull of those vertices on the fitted plane.
 *
 * @param {THREE.BufferGeometry} geometry
 * @param {Set<number>|number[]} selectedFaceIndices — face indices in the brushed region
 * @returns {{
 *   Sdr: number,        — developed interfacial area ratio (dimensionless)
 *   SdrPercent: number, — Sdr × 100 (ISO 25178 percentage form)
 *   Sdq: number,        — RMS surface gradient (dimensionless; equals tan of RMS slope)
 *   trueArea: number,   — 3D area of selected triangles (geometry units²)
 *   projectedArea: number, — convex-hull area on mean plane (geometry units²)
 *   faceCount: number,
 *   warnings: string[],
 * }}
 */
export function computeSdrSdq(geometry, selectedFaceIndices) {
  const warnings = [];
  const faceList = Array.from(selectedFaceIndices);
  const faceCount = faceList.length;

  if (faceCount < 3) {
    warnings.push('Region has fewer than 3 faces; Sdr/Sdq results are unreliable.');
    return { Sdr: NaN, SdrPercent: NaN, Sdq: NaN, trueArea: NaN, projectedArea: NaN, faceCount, warnings };
  }

  const pos = geometry.attributes.position;
  const idx = geometry.index;
  const getI = idx ? (f, v) => idx.getX(f*3+v) : (f, v) => f*3+v;

  // Collect unique vertex positions for plane fitting
  const vertSet = new Set();
  for (const f of faceList) {
    vertSet.add(getI(f, 0)); vertSet.add(getI(f, 1)); vertSet.add(getI(f, 2));
  }
  const verts3D = Array.from(vertSet).map(vi =>
    new THREE.Vector3(pos.getX(vi), pos.getY(vi), pos.getZ(vi))
  );

  if (verts3D.length < 3) {
    warnings.push('Fewer than 3 unique vertex positions in region.');
    return { Sdr: NaN, SdrPercent: NaN, Sdq: NaN, trueArea: NaN, projectedArea: NaN, faceCount, warnings };
  }

  // Fit mean plane via PCA
  const { normal: planeNormal, centroid, u, v: vAxis } = computePCAPlane(verts3D);

  // Project vertices onto plane to get 2D coords for convex hull
  const pts2D = verts3D.map(p => {
    const d = new THREE.Vector3().subVectors(p, centroid);
    return { x: d.dot(u), y: d.dot(vAxis) };
  });
  const hull = convexHull2D(pts2D);
  const projectedArea = polygonArea2D(hull);

  if (projectedArea < 1e-20) {
    warnings.push('Projected area is near-zero. Region may be degenerate or edge-on.');
    return { Sdr: NaN, SdrPercent: NaN, Sdq: NaN, trueArea: NaN, projectedArea, faceCount, warnings };
  }

  // Per-face: accumulate true area and Sdq numerator Σ tan²θ · a_proj
  let trueArea   = 0;
  let sdqNumer   = 0; // Σ (tan²θ_f × projectedFaceArea)
  let skippedFaces = 0;

  const _ab = new THREE.Vector3(), _ac = new THREE.Vector3(), _cross = new THREE.Vector3();

  for (const f of faceList) {
    const ai = getI(f, 0), bi = getI(f, 1), ci = getI(f, 2);
    const ax = pos.getX(ai), ay = pos.getY(ai), az = pos.getZ(ai);
    const bx = pos.getX(bi), by = pos.getY(bi), bz = pos.getZ(bi);
    const cx = pos.getX(ci), cy = pos.getY(ci), cz = pos.getZ(ci);

    _ab.set(bx-ax, by-ay, bz-az);
    _ac.set(cx-ax, cy-ay, cz-az);
    _cross.crossVectors(_ab, _ac);

    const faceArea = _cross.length() * 0.5;
    if (faceArea < 1e-20) { skippedFaces++; continue; }
    trueArea += faceArea;

    const faceNormal = _cross.clone().normalize();
    const cosTheta = Math.abs(faceNormal.dot(planeNormal)); // cos of angle to mean plane

    if (cosTheta < 1e-6) {
      // Face nearly perpendicular to mean plane — gradient → ∞; skip this face.
      skippedFaces++;
      continue;
    }

    // Projected area of this face onto mean plane
    const aProj = faceArea * cosTheta;
    // tan²θ = (1 − cos²θ) / cos²θ  →  contribution to Sdq numerator
    const sinSq = 1 - cosTheta*cosTheta;
    sdqNumer += (sinSq / (cosTheta*cosTheta)) * aProj;
    // Equivalently: sdqNumer += sinSq * faceArea / cosTheta
  }

  if (skippedFaces > 0) warnings.push(`${skippedFaces} degenerate or near-perpendicular faces were excluded.`);
  if (faceCount < 10)   warnings.push('Small region (<10 faces); results may not be representative.');

  const Sdr = (trueArea - projectedArea) / projectedArea;
  const Sdq = Math.sqrt(sdqNumer / projectedArea);

  return {
    Sdr,
    SdrPercent: Sdr * 100,
    Sdq,
    trueArea,
    projectedArea,
    faceCount,
    warnings,
  };
}
