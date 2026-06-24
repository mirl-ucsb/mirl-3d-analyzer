// ══════════════════════════════════════════
//  CURVATURE — mean / Gaussian / curvedness at each vertex
//  + applyColors / applyCurvatureColors
// ══════════════════════════════════════════

import * as THREE from 'three';
import { App } from '../core/state.js';
import { getCmap, legendGradient } from './color-maps.js';
import { buildBaseColorAttr } from './radiance-scaling.js';
import { Scale } from './measurement.js';

const FIELD_LABELS = { mean: 'Mean Curvature', gaussian: 'Gaussian Curvature', curvedness: 'Curvedness', thickness: 'Wall Thickness' };

// Paint a per-vertex scalar field into the geometry's color attribute. No-hit
// vertices (NaN, e.g. open boundaries in the thickness map) render neutral.
function writeField(geo, data, cmap, lo, hi) {
  const range = hi - lo || 1, nV = data.length, cols = new Float32Array(nV * 3);
  for (let i = 0; i < nV; i++) {
    if (!isFinite(data[i])) { cols[i * 3] = 0.80; cols[i * 3 + 1] = 0.80; cols[i * 3 + 2] = 0.76; continue; }
    const t = (data[i] - lo) / range, [r, g, b] = cmap(t);
    cols[i * 3] = r; cols[i * 3 + 1] = g; cols[i * 3 + 2] = b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  return geo.attributes.color;
}

// Thickness is a real length, so its legend reads in physical units when a
// scale is set; curvature stays unitless.
function updateLegend(mode, cmapName, lo, hi) {
  let l = lo, h = hi, suf = '', dp = 4;
  if (mode === 'thickness') { dp = 2; if (Scale.mmPerUnit) { l = lo * Scale.mmPerUnit; h = hi * Scale.mmPerUnit; suf = ' ' + Scale.unit; } }
  document.getElementById('legend-title').textContent = FIELD_LABELS[mode] || '';
  document.getElementById('legend-bar').style.background = legendGradient(cmapName);
  document.getElementById('legend-min').textContent = l.toFixed(dp) + suf;
  document.getElementById('legend-max').textContent = h.toFixed(dp) + suf;
  document.getElementById('color-legend').classList.add('visible');
}

export function computeCurvature(geo) {
  const pos = geo.attributes.position;
  const idx = geo.index;
  const nV = pos.count;
  const getI = idx ? (f,v)=>idx.getX(f*3+v) : (f,v)=>f*3+v;
  const nF = idx ? idx.count/3 : nV/3;
  // getP works on original indices; canonical indices are always the first
  // original index that maps to a given position, so getP(canonicalIdx) is valid.
  const getP = i => new THREE.Vector3(pos.getX(i),pos.getY(i),pos.getZ(i));

  // ── Step 1: canonical vertex map ─────────────────────────────────────────
  // OBJ files loaded by Three.js are typically non-indexed: every face has 3
  // unique vertex entries even when positions are shared.  Without deduplication
  // each vertex appears in exactly 1 face, breaking every adjacency-based
  // computation.  We map duplicate positions to compact indices 0..nC-1 and
  // keep canonOrig[ci] → one original vertex index so we can look up positions.
  const posToCanon = new Map(); // position string → compact canonical index [0,nC-1]
  const canon      = new Int32Array(nV); // original idx → compact canonical idx
  const canonOrig  = [];                 // compact canonical idx → original idx
  for (let i = 0; i < nV; i++) {
    const k = `${pos.getX(i)}|${pos.getY(i)}|${pos.getZ(i)}`;
    if (!posToCanon.has(k)) { posToCanon.set(k, canonOrig.length); canonOrig.push(i); }
    canon[i] = posToCanon.get(k);
  }
  const nC = canonOrig.length; // number of geometrically unique vertices
  // getPC(ci): position of canonical vertex ci (uses its stored original index)
  const getPC = ci => getP(canonOrig[ci]);

  // ── Step 2: neighbors and face adjacency on canonical vertices ───────────
  const neighbors = Array.from({length:nC},()=>new Set());
  const vFaces    = Array.from({length:nC},()=>[]);
  for(let f=0;f<nF;f++){
    const a=canon[getI(f,0)], b=canon[getI(f,1)], c=canon[getI(f,2)];
    neighbors[a].add(b); neighbors[a].add(c);
    neighbors[b].add(a); neighbors[b].add(c);
    neighbors[c].add(a); neighbors[c].add(b);
    vFaces[a].push(f);   vFaces[b].push(f);   vFaces[c].push(f);
  }

  // ── Step 3: face areas and normals ───────────────────────────────────────
  const fNorm=[],fArea=[];
  for(let f=0;f<nF;f++){
    const pa=getP(getI(f,0)), pb=getP(getI(f,1)), pc=getP(getI(f,2));
    const ab=new THREE.Vector3().subVectors(pb,pa);
    const ac=new THREE.Vector3().subVectors(pc,pa);
    const cr=new THREE.Vector3().crossVectors(ab,ac);
    const a=cr.length()*.5; fArea.push(a);
    if(a>1e-12)cr.normalize(); fNorm.push(cr);
  }

  // ── Step 4: per-canonical-vertex normals and mixed areas ─────────────────
  const vNorm=[], vArea=new Float32Array(nC);
  for(let i=0;i<nC;i++){
    const n=new THREE.Vector3();
    for(const fi of vFaces[i]) n.addScaledVector(fNorm[fi],fArea[fi]);
    if(n.length()>1e-12)n.normalize();
    vNorm.push(n);
  }
  for(let f=0;f<nF;f++){
    const a=canon[getI(f,0)], b=canon[getI(f,1)], c=canon[getI(f,2)];
    [a,b,c].forEach(v=>vArea[v]+=fArea[f]/3);
  }

  // ── Step 5: cotangent weights for Laplace-Beltrami ───────────────────────
  // For each face (A,B,C) the cotangent at vertex A is dot(AB,AC)/|AB×AC|.
  // Each edge (i,j) accumulates the cotangents from the (up to two) faces that
  // share it.  This gives the standard cotan-LB operator, which correctly
  // recovers mean curvature magnitude regardless of mesh resolution.
  const cotW = Array.from({length:nC}, ()=>new Map());
  for(let f=0;f<nF;f++){
    const ai=canon[getI(f,0)], bi=canon[getI(f,1)], ci=canon[getI(f,2)];
    if(ai===bi||bi===ci||ai===ci) continue; // degenerate face
    const area2 = 2*fArea[f];              // |AB×AC| = 2·area
    if(area2 < 1e-20) continue;
    const pa=getPC(ai), pb=getPC(bi), pc=getPC(ci);
    // cotangent at each vertex
    const cotA = new THREE.Vector3().subVectors(pb,pa)
                   .dot(new THREE.Vector3().subVectors(pc,pa)) / area2;
    const cotB = new THREE.Vector3().subVectors(pa,pb)
                   .dot(new THREE.Vector3().subVectors(pc,pb)) / area2;
    const cotC = new THREE.Vector3().subVectors(pa,pc)
                   .dot(new THREE.Vector3().subVectors(pb,pc)) / area2;
    // cot at A → contributes to edge (B,C)
    cotW[bi].set(ci,(cotW[bi].get(ci)||0)+cotA);
    cotW[ci].set(bi,(cotW[ci].get(bi)||0)+cotA);
    // cot at B → contributes to edge (A,C)
    cotW[ai].set(ci,(cotW[ai].get(ci)||0)+cotB);
    cotW[ci].set(ai,(cotW[ci].get(ai)||0)+cotB);
    // cot at C → contributes to edge (A,B)
    cotW[ai].set(bi,(cotW[ai].get(bi)||0)+cotC);
    cotW[bi].set(ai,(cotW[bi].get(ai)||0)+cotC);
  }

  // ── Step 6: boundary detection (canonical) ───────────────────────────────
  const edgeCount = new Map();
  const eKey = (a,b) => a<b ? `${a}|${b}` : `${b}|${a}`;
  for(let f=0;f<nF;f++){
    const a=canon[getI(f,0)], b=canon[getI(f,1)], c=canon[getI(f,2)];
    for(const k of [eKey(a,b),eKey(b,c),eKey(c,a)])
      edgeCount.set(k,(edgeCount.get(k)||0)+1);
  }
  const boundaryVerts = new Set();
  for(const [k,cnt] of edgeCount){
    if(cnt===1){ const [a,b]=k.split('|').map(Number); boundaryVerts.add(a); boundaryVerts.add(b); }
  }
  console.log(`[MIRL curv] nV=${nV}, nCanon=${nC}, boundary=${boundaryVerts.size}`);

  // ── Step 7: mean curvature via cotangent Laplace-Beltrami ────────────────
  // Δ_LB(p_i) = 1/(2·A_i) · Σ_j w_ij·(p_j − p_i)  ≈  2H·n_i
  // → H_i = |Δ_LB(p_i)| / 2,  sign from dot with vertex normal
  const mean=new Float32Array(nC), gauss=new Float32Array(nC), curv=new Float32Array(nC);
  for(let i=0;i<nC;i++){
    const pi=getPC(i); const lap=new THREE.Vector3();
    for(const [j,w] of cotW[i])
      lap.addScaledVector(new THREE.Vector3().subVectors(getPC(j),pi), w);
    if(vArea[i]>1e-12) lap.divideScalar(2*vArea[i]);
    const sg=lap.dot(vNorm[i])<0?1:-1;
    mean[i]=sg*lap.length()*.5;
  }

  // ── Step 8: Gaussian curvature via angle deficit (canonical) ─────────────
  function faceAngle(f, vi_c){
    const a=canon[getI(f,0)], b=canon[getI(f,1)], c=canon[getI(f,2)];
    let v,u1,u2;
    if(vi_c===a){v=a;u1=b;u2=c;}
    else if(vi_c===b){v=b;u1=a;u2=c;}
    else{v=c;u1=a;u2=b;}
    const d1=new THREE.Vector3().subVectors(getPC(u1),getPC(v)).normalize();
    const d2=new THREE.Vector3().subVectors(getPC(u2),getPC(v)).normalize();
    return Math.acos(Math.max(-1,Math.min(1,d1.dot(d2))));
  }
  const useBoundaryExclusion = boundaryVerts.size < nC * 0.9;
  for(let i=0;i<nC;i++){
    if(useBoundaryExclusion && boundaryVerts.has(i)){ gauss[i]=0; continue; }
    let aSum=0; for(const fi of vFaces[i]) aSum+=faceAngle(fi,i);
    gauss[i]=vArea[i]>1e-12?(2*Math.PI-aSum)/vArea[i]:0;
  }
  // Clamp to p2–p98 to suppress outliers at sharp edges / near-degenerate faces
  const validG=[];
  for(let i=0;i<nC;i++) if(isFinite(gauss[i])&&gauss[i]!==0) validG.push(gauss[i]);
  if(validG.length>1){
    validG.sort((a,b)=>a-b);
    const lo=validG[Math.floor(validG.length*0.02)];
    const hi=validG[Math.floor(validG.length*0.98)];
    for(let i=0;i<nC;i++) gauss[i]=Math.max(lo,Math.min(hi,gauss[i]));
  }

  // ── Step 9: curvedness = sqrt((k1²+k2²)/2), k1,k2 = H±sqrt(H²−K) ───────
  for(let i=0;i<nC;i++){
    const H=mean[i], K=gauss[i];
    const disc=Math.max(H*H-K,0); const root=Math.sqrt(disc);
    curv[i]=Math.sqrt(.5*((H+root)**2+(H-root)**2));
  }

  // ── Step 10: broadcast canonical values back to all (possibly duplicated) vertices ──
  const mean_out=new Float32Array(nV), gauss_out=new Float32Array(nV), curv_out=new Float32Array(nV);
  for(let i=0;i<nV;i++){
    mean_out[i]=mean[canon[i]]; gauss_out[i]=gauss[canon[i]]; curv_out[i]=curv[canon[i]];
  }
  return {mean:mean_out, gaussian:gauss_out, curvedness:curv_out};
}

export function applyColors(geo, mesh, curvMode, cmapName, clipLo, clipHi) {
  const data = curvMode !== 'none' ? App.curv[curvMode] : null;

  function percentiles() {
    const sorted = [...data].filter(isFinite).sort((a, b) => a - b);
    return [sorted[Math.floor(sorted.length * clipLo / 100)] || 0, sorted[Math.floor(sorted.length * clipHi / 100)] || 1];
  }

  // ── Radiance Scaling mode: update color attribute only; the shader renders ──
  if (App.radianceScaling) {
    if (!data) { buildBaseColorAttr(geo); document.getElementById('color-legend').classList.remove('visible'); return; }
    const [lo, hi] = percentiles();
    writeField(geo, data, getCmap(cmapName), lo, hi).needsUpdate = true;
    updateLegend(curvMode, cmapName, lo, hi);
    return;
  }

  // ── Standard Phong path ──
  if (!data) {
    mesh.material.vertexColors = false;
    mesh.material.color.set(0xccccbb);
    mesh.material.needsUpdate = true;
    document.getElementById('color-legend').classList.remove('visible');
    return;
  }
  const [lo, hi] = percentiles();
  writeField(geo, data, getCmap(cmapName), lo, hi);
  mesh.material.vertexColors = true;
  mesh.material.color.set(0xffffff);
  mesh.material.needsUpdate = true;
  updateLegend(curvMode, cmapName, lo, hi);
}

export function applyCurvatureColors() {
  if(!App.geo||!App.mesh)return;
  applyColors(App.geo,App.mesh,App.curvMode,App.cmap,App.clipLo,App.clipHi);
}
