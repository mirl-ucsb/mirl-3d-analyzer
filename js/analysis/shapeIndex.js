// ══════════════════════════════════════════
//  SHAPE INDEX — Koenderink & van Doorn (1992) surface shape classification
//
//  Shape Index  SI = (2/π) · arctan((k1+k2)/(k1-k2)),  k1 ≥ k2
//  SI ∈ [-1,+1]:  -1 = perfect cup (spherical pit)
//                  0 = saddle (equal and opposite curvatures)
//                 +1 = perfect cap (spherical peak)
//  Undefined at umbilics (k1 = k2); assigned to bin 4 (Saddle/Flat).
//
//  Curvedness  C = sqrt((k1²+k2²)/2)  — measures magnitude of bending,
//  units 1/length.  C = 0 on a plane, C = 1/R on a sphere of radius R.
// ══════════════════════════════════════════

/** Human-readable labels for the nine Koenderink bins */
export const SI_LABELS = [
  'Cup (Spherical Pit)',   // 0  SI ∈ [-1.000, -0.778)
  'Trough (Elliptic Pit)', // 1  SI ∈ [-0.778, -0.556)
  'Rut (Valley)',          // 2  SI ∈ [-0.556, -0.333)
  'Saddle-Rut',            // 3  SI ∈ [-0.333, -0.111)
  'Saddle / Flat',         // 4  SI ∈ [-0.111, +0.111)
  'Saddle-Ridge',          // 5  SI ∈ [+0.111, +0.333)
  'Ridge',                 // 6  SI ∈ [+0.333, +0.556)
  'Dome (Elliptic Cap)',   // 7  SI ∈ [+0.556, +0.778)
  'Cap (Spherical Peak)',  // 8  SI ∈ [+0.778, +1.000]
];

/**
 * RGB hex palette: cool blues (concave) → neutral grey (saddle) → warm reds (convex).
 * Matches the nine SI bins 0–8 in order.
 */
export const SI_COLORMAP = [
  '#1a4a8a', // 0 Cup          — deep blue
  '#2e7abf', // 1 Trough       — blue
  '#55a3d6', // 2 Rut          — sky blue
  '#91c7e0', // 3 Saddle-Rut   — pale blue
  '#c0c0c0', // 4 Saddle/Flat  — neutral grey
  '#e8c47a', // 5 Saddle-Ridge — gold
  '#e07832', // 6 Ridge        — orange
  '#c82828', // 7 Dome         — red
  '#7a0000', // 8 Cap          — dark red
];

// Bin boundary at bin b starts at: -1 + b*(2/9)
const _BIN_WIDTH = 2 / 9; // ≈ 0.2222

/**
 * Compute Shape Index, Curvedness, and nine-bin surface classification per vertex.
 *
 * Inputs are the principal curvature arrays produced by computeCurvature() in
 * curvature.js (App.curv.k1, App.curv.k2), both length nV.
 *
 * @param {Float32Array} k1 — max principal curvature per vertex (k1 ≥ k2)
 * @param {Float32Array} k2 — min principal curvature per vertex
 * @returns {{
 *   shapeIndex:          Float32Array,  // [-1,+1], NaN at umbilics
 *   curvedness:          Float32Array,  // [0,∞), units 1/length
 *   classification:      Uint8Array,    // 0–8 per-vertex bin index
 *   classificationCounts: Record<string,number>,
 *   summary: {
 *     siMean: number, siStddev: number, siMedian: number,
 *     cMean:  number, cStddev:  number, cMedian:  number
 *   }
 * }}
 */
export function computeShapeIndex(k1, k2) {
  const n = k1.length;
  const shapeIndex    = new Float32Array(n);
  const curvedness    = new Float32Array(n);
  const classification = new Uint8Array(n);
  const binCounts = new Int32Array(9);

  let siSum = 0, siSumSq = 0, siN = 0;
  let cSum  = 0, cSumSq  = 0;
  const siVals = [], cVals = [];

  for (let i = 0; i < n; i++) {
    const kMax = k1[i], kMin = k2[i];
    const denom = kMax - kMin;

    // Curvedness (always well-defined)
    const C = Math.sqrt((kMax*kMax + kMin*kMin) * 0.5);
    curvedness[i] = C;
    cSum += C; cSumSq += C*C; cVals.push(C);

    // Shape Index — undefined at umbilics (k1 = k2, denom = 0)
    let si;
    if (Math.abs(denom) < 1e-12) {
      si = NaN;
    } else {
      si = (2 / Math.PI) * Math.atan((kMax + kMin) / denom);
      // atan returns (-π/2, π/2), so (2/π)*atan ∈ (-1,+1) ✓
    }
    shapeIndex[i] = si;

    // 9-bin classification: floor((SI - (-1)) / (2/9))
    let bin;
    if (isNaN(si)) {
      bin = 4; // umbilics → Saddle/Flat bin
    } else {
      bin = Math.floor((si - (-1)) / _BIN_WIDTH);
      bin = Math.max(0, Math.min(8, bin)); // SI=+1.0 would give bin 9 → clamp to 8
    }
    classification[i] = bin;
    binCounts[bin]++;

    if (!isNaN(si)) {
      siSum += si; siSumSq += si*si; siN++;
      siVals.push(si);
    }
  }

  // Summary statistics
  const siMean   = siN > 0 ? siSum / siN : NaN;
  const siStddev = siN > 1 ? Math.sqrt(Math.max(0, siSumSq/siN - siMean*siMean)) : 0;
  const cMean    = n   > 0 ? cSum  / n   : NaN;
  const cStddev  = n   > 1 ? Math.sqrt(Math.max(0, cSumSq/n - cMean*cMean)) : 0;

  siVals.sort((a, b) => a-b);
  cVals.sort((a, b) => a-b);
  const _med = arr => {
    if (!arr.length) return NaN;
    const m = Math.floor(arr.length/2);
    return arr.length%2===0 ? (arr[m-1]+arr[m])/2 : arr[m];
  };

  const classificationCounts = {};
  for (let b = 0; b < 9; b++) classificationCounts[SI_LABELS[b]] = binCounts[b];

  return {
    shapeIndex,
    curvedness,
    classification,
    classificationCounts,
    summary: {
      siMean, siStddev, siMedian: _med(siVals),
      cMean,  cStddev,  cMedian:  _med(cVals),
    },
  };
}

/**
 * Convert a classification Uint8Array to a Three.js vertex-color Float32Array
 * using the SI_COLORMAP palette.
 * @param {Uint8Array} classification
 * @returns {Float32Array} length n*3, packed RGB in [0,1]
 */
export function classificationToColors(classification) {
  const n = classification.length;
  const cols = new Float32Array(n * 3);
  const parsed = SI_COLORMAP.map(hex => {
    const v = parseInt(hex.slice(1), 16);
    return [(v>>16)/255, ((v>>8)&0xff)/255, (v&0xff)/255];
  });
  for (let i = 0; i < n; i++) {
    const [r, g, b] = parsed[classification[i]];
    cols[i*3] = r; cols[i*3+1] = g; cols[i*3+2] = b;
  }
  return cols;
}
