// ══════════════════════════════════════════
//  COMPARE VIEW — side-by-side model viewers with synced cameras
// ══════════════════════════════════════════

import * as THREE from 'three';
import { App } from '../core/state.js';
import { sceneL, sceneR, cameraL, cameraR, controlsL, controlsR } from '../core/scenes.js';
import { showLoad, hideLoad } from '../core/loading.js';
import { loadOBJ } from '../viewer/loader.js';
import { computeCurvature } from '../analysis/curvature.js';
import { getCmap, legendGradient } from '../analysis/color-maps.js';
import { Scale } from '../analysis/measurement.js';
import { buildGrid, computeDeviation, icpAlign } from '../analysis/deviation.js';

export function applyCompareColors(geo, mesh, curvData, analysisKey, cmapName, sceneRef) {
  if(analysisKey==='none'||!curvData[analysisKey]){
    mesh.material.vertexColors=false;mesh.material.color.set(0xccccbb);mesh.material.needsUpdate=true;return;
  }
  const data=curvData[analysisKey],cmap=getCmap(cmapName);
  const sorted=[...data].filter(isFinite).sort((a,b)=>a-b);
  const lo=sorted[Math.floor(sorted.length*.02)]||0;
  const hi=sorted[Math.floor(sorted.length*.98)]||1;
  const range=hi-lo||1, nV=data.length;
  const cols=new Float32Array(nV*3);
  for(let i=0;i<nV;i++){const t=(data[i]-lo)/range,[r,g,b]=cmap(t);cols[i*3]=r;cols[i*3+1]=g;cols[i*3+2]=b;}
  geo.setAttribute('color',new THREE.BufferAttribute(cols,3));
  mesh.material.vertexColors=true;mesh.material.color.set(0xffffff);mesh.material.needsUpdate=true;
}

export function loadCompareModel(files, side) {
  loadOBJ(files, (geo, name) => {
    if(side==='left'){
      if(App.cmpMeshL)sceneL.remove(App.cmpMeshL);
      App.cmpGeoL=geo; App.cmpNameL=name;
      const mat=new THREE.MeshPhongMaterial({color:0xccccbb,side:THREE.DoubleSide,shininess:25});
      App.cmpMeshL=new THREE.Mesh(geo,mat); sceneL.add(App.cmpMeshL);
      showLoad('Computing analysis…');
      setTimeout(()=>{App.cmpCurvL=computeCurvature(geo);applyCompareColors(App.cmpGeoL,App.cmpMeshL,App.cmpCurvL,App.cmpAnalysisL,App.cmpCmapL,sceneL);hideLoad();},50);
      document.getElementById('cmp-left-name').textContent=name;
    } else {
      if(App.cmpMeshR)sceneR.remove(App.cmpMeshR);
      App.cmpGeoR=geo; App.cmpNameR=name;
      const mat=new THREE.MeshPhongMaterial({color:0xccccbb,side:THREE.DoubleSide,shininess:25});
      App.cmpMeshR=new THREE.Mesh(geo,mat); sceneR.add(App.cmpMeshR);
      showLoad('Computing analysis…');
      setTimeout(()=>{App.cmpCurvR=computeCurvature(geo);applyCompareColors(App.cmpGeoR,App.cmpMeshR,App.cmpCurvR,App.cmpAnalysisR,App.cmpCmapR,sceneR);hideLoad();},50);
      document.getElementById('cmp-right-name').textContent=name;
    }
    cameraL.position.set(0,0,3);controlsL.reset();
    cameraR.position.set(0,0,3);controlsR.reset();
  });
}

// ── Compare sidebar controls ──
document.getElementById('cmp-left-analysis').addEventListener('change',e=>{
  App.cmpAnalysisL=e.target.value;
  if(App.cmpMeshL)applyCompareColors(App.cmpGeoL,App.cmpMeshL,App.cmpCurvL,App.cmpAnalysisL,App.cmpCmapL,sceneL);
});
document.getElementById('cmp-right-analysis').addEventListener('change',e=>{
  App.cmpAnalysisR=e.target.value;
  if(App.cmpMeshR)applyCompareColors(App.cmpGeoR,App.cmpMeshR,App.cmpCurvR,App.cmpAnalysisR,App.cmpCmapR,sceneR);
});
document.getElementById('cmp-left-cmap').addEventListener('change',e=>{
  App.cmpCmapL=e.target.value;
  if(App.cmpMeshL)applyCompareColors(App.cmpGeoL,App.cmpMeshL,App.cmpCurvL,App.cmpAnalysisL,App.cmpCmapL,sceneL);
});
document.getElementById('cmp-right-cmap').addEventListener('change',e=>{
  App.cmpCmapR=e.target.value;
  if(App.cmpMeshR)applyCompareColors(App.cmpGeoR,App.cmpMeshR,App.cmpCurvR,App.cmpAnalysisR,App.cmpCmapR,sceneR);
});
document.getElementById('chk-sync-cam').addEventListener('change',e=>{App.syncCam=e.target.checked;});

// ── Deviation map (right = test, left = reference) ──
const fmtLen = u => Scale.mmPerUnit ? `${(u * Scale.mmPerUnit).toFixed(2)} ${Scale.unit}` : `${u.toFixed(4)} units`;

function applyDeviationColors(geo, mesh, dev, absMax) {
  const cmap = getCmap('coolwarm'), nV = dev.length, cols = new Float32Array(nV * 3);
  const scale = absMax || 1;
  for (let i = 0; i < nV; i++) {
    if (!isFinite(dev[i])) { cols[i * 3] = 0.80; cols[i * 3 + 1] = 0.80; cols[i * 3 + 2] = 0.76; continue; }
    const t = 0.5 + 0.5 * Math.max(-1, Math.min(1, dev[i] / scale));   // diverging, centred at zero
    const [r, g, b] = cmap(t);
    cols[i * 3] = r; cols[i * 3 + 1] = g; cols[i * 3 + 2] = b;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
  mesh.material.vertexColors = true; mesh.material.color.set(0xffffff); mesh.material.needsUpdate = true;
}

// Robust symmetric range: the 98th percentile of |deviation|, so a few outliers
// do not flatten the colour scale.
function robustAbsMax(dev) {
  const a = [];
  for (let i = 0; i < dev.length; i++) if (isFinite(dev[i])) a.push(Math.abs(dev[i]));
  if (!a.length) return 1;
  a.sort((x, y) => x - y);
  return a[Math.floor(a.length * 0.98)] || a[a.length - 1] || 1;
}

function refGrid() {
  App.cmpMeshL.updateMatrixWorld(true);
  return buildGrid(App.cmpGeoL, App.cmpMeshL.matrixWorld);
}

function bothLoaded() {
  if (App.cmpMeshL && App.cmpMeshR) return true;
  alert('Load a left (reference) and a right (test) model first.');
  return false;
}

document.getElementById('btn-cmp-align').addEventListener('click', () => {
  if (!bothLoaded()) return;
  showLoad('Aligning (ICP)…');
  setTimeout(() => {
    App.cmpMeshR.updateMatrixWorld(true);
    const { transform, rms } = icpAlign(App.cmpGeoR, App.cmpMeshR.matrixWorld, refGrid());
    App.cmpMeshR.applyMatrix4(transform);
    App.cmpMeshR.updateMatrixWorld(true);
    document.getElementById('cmp-dev-status').textContent = `Aligned: residual RMS ${fmtLen(rms)}`;
    hideLoad();
  }, 30);
});

document.getElementById('btn-cmp-deviation').addEventListener('click', () => {
  if (!bothLoaded()) return;
  showLoad('Computing deviation…');
  setTimeout(() => {
    App.cmpMeshR.updateMatrixWorld(true);
    const { dev, rms } = computeDeviation(App.cmpGeoR, App.cmpMeshR.matrixWorld, refGrid());
    const absMax = robustAbsMax(dev);
    applyDeviationColors(App.cmpGeoR, App.cmpMeshR, dev, absMax);
    document.getElementById('cmp-dev-bar').style.background = legendGradient('coolwarm');
    document.getElementById('cmp-dev-lo').textContent = '-' + fmtLen(absMax);
    document.getElementById('cmp-dev-hi').textContent = '+' + fmtLen(absMax);
    document.getElementById('cmp-dev-rms').textContent = `RMS deviation: ${fmtLen(rms)}`;
    document.getElementById('cmp-dev-legend').style.display = '';
    document.getElementById('cmp-dev-status').textContent = '';
    hideLoad();
  }, 30);
});
