// ══════════════════════════════════════════
//  CURVATURE — mean / Gaussian / curvedness at each vertex
//  + applyColors / applyCurvatureColors
// ══════════════════════════════════════════

import * as THREE from 'three';
import { App } from '../core/state.js';
import { getCmap, legendGradient } from './color-maps.js';
import { buildBaseColorAttr } from './radiance-scaling.js';

export function computeCurvature(geo) {
  const pos = geo.attributes.position;
  const idx = geo.index;
  const nV = pos.count;
  const getI = idx ? (f,v)=>idx.getX(f*3+v) : (f,v)=>f*3+v;
  const nF = idx ? idx.count/3 : nV/3;
  const getP = i => new THREE.Vector3(pos.getX(i),pos.getY(i),pos.getZ(i));

  const neighbors = Array.from({length:nV},()=>new Set());
  const vFaces = Array.from({length:nV},()=>[]);
  for(let f=0;f<nF;f++){
    const a=getI(f,0),b=getI(f,1),c=getI(f,2);
    neighbors[a].add(b);neighbors[a].add(c);
    neighbors[b].add(a);neighbors[b].add(c);
    neighbors[c].add(a);neighbors[c].add(b);
    vFaces[a].push(f);vFaces[b].push(f);vFaces[c].push(f);
  }

  const fNorm=[],fArea=[];
  for(let f=0;f<nF;f++){
    const pa=getP(getI(f,0)),pb=getP(getI(f,1)),pc=getP(getI(f,2));
    const ab=new THREE.Vector3().subVectors(pb,pa);
    const ac=new THREE.Vector3().subVectors(pc,pa);
    const cr=new THREE.Vector3().crossVectors(ab,ac);
    const a=cr.length()*.5; fArea.push(a);
    if(a>1e-12)cr.normalize(); fNorm.push(cr);
  }

  const vNorm=[], vArea=new Float32Array(nV);
  for(let i=0;i<nV;i++){const n=new THREE.Vector3();for(const fi of vFaces[i])n.addScaledVector(fNorm[fi],fArea[fi]);if(n.length()>1e-12)n.normalize();vNorm.push(n);}

  function faceAngle(f,vi){
    const a=getI(f,0),b=getI(f,1),c=getI(f,2);
    let v,u1,u2;
    if(vi===a){v=getP(a);u1=getP(b);u2=getP(c);}
    else if(vi===b){v=getP(b);u1=getP(a);u2=getP(c);}
    else{v=getP(c);u1=getP(a);u2=getP(b);}
    const d1=new THREE.Vector3().subVectors(u1,v).normalize();
    const d2=new THREE.Vector3().subVectors(u2,v).normalize();
    return Math.acos(Math.max(-1,Math.min(1,d1.dot(d2))));
  }
  for(let f=0;f<nF;f++){const a=getI(f,0),b=getI(f,1),c=getI(f,2);[a,b,c].forEach(v=>vArea[v]+=fArea[f]/3);}

  // Build boundary-vertex set: edges referenced by exactly one face are open edges;
  // their vertices are on the boundary where Gaussian curvature is ill-defined.
  const edgeCount = new Map();
  const eKey = (a, b) => a < b ? `${a}|${b}` : `${b}|${a}`;
  for (let f = 0; f < nF; f++) {
    const a = getI(f,0), b = getI(f,1), c = getI(f,2);
    for (const k of [eKey(a,b), eKey(b,c), eKey(c,a)])
      edgeCount.set(k, (edgeCount.get(k) || 0) + 1);
  }
  const boundaryVerts = new Set();
  for (const [k, cnt] of edgeCount) {
    if (cnt === 1) { const [a,b] = k.split('|').map(Number); boundaryVerts.add(a); boundaryVerts.add(b); }
  }

  const mean=new Float32Array(nV), gauss=new Float32Array(nV), curv=new Float32Array(nV);
  for(let i=0;i<nV;i++){
    const pi=getP(i); const lap=new THREE.Vector3(); let ws=0;
    for(const j of neighbors[i]){lap.addScaledVector(new THREE.Vector3().subVectors(getP(j),pi),1);ws++;}
    if(ws>0)lap.divideScalar(ws);
    const sg=lap.dot(vNorm[i])<0?1:-1;
    mean[i]=sg*lap.length()*.5;
  }
  for(let i=0;i<nV;i++){
    if(boundaryVerts.has(i)){ gauss[i]=0; continue; }
    let aSum=0;for(const fi of vFaces[i])aSum+=faceAngle(fi,i);
    gauss[i]=vArea[i]>1e-12?(2*Math.PI-aSum)/vArea[i]:0;
  }
  // Clamp Gaussian curvature to p2–p98 of interior values to suppress outliers.
  const interiorG = [];
  for(let i=0;i<nV;i++) if(!boundaryVerts.has(i) && isFinite(gauss[i])) interiorG.push(gauss[i]);
  if(interiorG.length > 1) {
    interiorG.sort((a,b)=>a-b);
    const lo = interiorG[Math.floor(interiorG.length * 0.02)];
    const hi = interiorG[Math.floor(interiorG.length * 0.98)];
    for(let i=0;i<nV;i++) gauss[i] = Math.max(lo, Math.min(hi, gauss[i]));
  }

  for(let i=0;i<nV;i++){
    const H=mean[i],K=gauss[i];
    const disc=Math.max(H*H-K,0);const root=Math.sqrt(disc);
    curv[i]=Math.sqrt(.5*((H+root)**2+(H-root)**2));
  }
  return {mean, gaussian: gauss, curvedness: curv};
}

export function applyColors(geo, mesh, curvMode, cmapName, clipLo, clipHi) {
  // ── Radiance Scaling mode: update color BufferAttribute only; ShaderMaterial handles rendering ──
  if (App.radianceScaling) {
    if (curvMode === 'none' || !App.curv[curvMode]) {
      buildBaseColorAttr(geo);
      document.getElementById('color-legend').classList.remove('visible');
      return;
    }
    const data = App.curv[curvMode];
    const cmap = getCmap(cmapName);
    const sorted = [...data].filter(isFinite).sort((a,b) => a-b);
    const lo = sorted[Math.floor(sorted.length * clipLo / 100)] || 0;
    const hi = sorted[Math.floor(sorted.length * clipHi / 100)] || 1;
    const range = hi - lo || 1;
    const nV = data.length;
    const cols = new Float32Array(nV * 3);
    for (let i = 0; i < nV; i++) {
      const t = (data[i]-lo)/range, [r,g,b] = cmap(t);
      cols[i*3]=r; cols[i*3+1]=g; cols[i*3+2]=b;
    }
    geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
    geo.attributes.color.needsUpdate = true;
    const labels = {mean:'Mean Curvature', gaussian:'Gaussian Curvature', curvedness:'Curvedness'};
    document.getElementById('legend-title').textContent = labels[curvMode] || '';
    document.getElementById('legend-bar').style.background = legendGradient(cmapName);
    document.getElementById('legend-min').textContent = lo.toFixed(4);
    document.getElementById('legend-max').textContent = hi.toFixed(4);
    document.getElementById('color-legend').classList.add('visible');
    return;
  }

  // ── Standard Phong path ──
  if(curvMode==='none'||!App.curv[curvMode]){
    mesh.material.vertexColors=false;
    mesh.material.color.set(0xccccbb);
    mesh.material.needsUpdate=true;
    document.getElementById('color-legend').classList.remove('visible');
    return;
  }
  const data=App.curv[curvMode];
  const cmap=getCmap(cmapName);
  const sorted=[...data].filter(isFinite).sort((a,b)=>a-b);
  const lo=sorted[Math.floor(sorted.length*clipLo/100)]||0;
  const hi=sorted[Math.floor(sorted.length*clipHi/100)]||1;
  const range=hi-lo||1;
  const nV=data.length;
  const cols=new Float32Array(nV*3);
  for(let i=0;i<nV;i++){const t=(data[i]-lo)/range,[r,g,b]=cmap(t);cols[i*3]=r;cols[i*3+1]=g;cols[i*3+2]=b;}
  geo.setAttribute('color',new THREE.BufferAttribute(cols,3));
  mesh.material.vertexColors=true;
  mesh.material.color.set(0xffffff);
  mesh.material.needsUpdate=true;
  const labels={mean:'Mean Curvature',gaussian:'Gaussian Curvature',curvedness:'Curvedness'};
  document.getElementById('legend-title').textContent=labels[curvMode]||'';
  document.getElementById('legend-bar').style.background=legendGradient(cmapName);
  document.getElementById('legend-min').textContent=lo.toFixed(4);
  document.getElementById('legend-max').textContent=hi.toFixed(4);
  document.getElementById('color-legend').classList.add('visible');
}

export function applyCurvatureColors() {
  if(!App.geo||!App.mesh)return;
  applyColors(App.geo,App.mesh,App.curvMode,App.cmap,App.clipLo,App.clipHi);
}
