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

// A colour-coded histogram of the deviation field, with a dashed zero line.
function renderHistogram(dev, absMax) {
  const host = document.getElementById('cmp-dev-hist'); if (!host) return;
  const NB = 41, lo = -absMax, range = (2 * absMax) || 1;
  const bins = new Float32Array(NB);
  let maxCount = 0;
  for (let i = 0; i < dev.length; i++) {
    if (!isFinite(dev[i])) continue;
    let b = Math.floor((dev[i] - lo) / range * NB);
    b = b < 0 ? 0 : b >= NB ? NB - 1 : b;
    if (++bins[b] > maxCount) maxCount = bins[b];
  }
  const W = 212, H = 60, bw = W / NB, cmap = getCmap('coolwarm');
  let bars = '';
  for (let b = 0; b < NB; b++) {
    const h = maxCount ? bins[b] / maxCount * H : 0;
    const [r, g, bl] = cmap((b + 0.5) / NB);
    bars += `<rect x="${(b * bw).toFixed(1)}" y="${(H - h).toFixed(1)}" width="${(bw - 0.4).toFixed(1)}" height="${h.toFixed(1)}" fill="rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(bl * 255)})"/>`;
  }
  const zx = (W / 2).toFixed(1);
  host.innerHTML = `<svg width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" style="display:block;border-bottom:1px solid var(--border)">${bars}<line x1="${zx}" y1="0" x2="${zx}" y2="${H}" stroke="var(--ink)" stroke-width="0.8" stroke-dasharray="2 2"/></svg>`;
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
    App.cmpDev = dev;
    applyDeviationColors(App.cmpGeoR, App.cmpMeshR, dev, absMax);
    document.getElementById('cmp-dev-bar').style.background = legendGradient('coolwarm');
    document.getElementById('cmp-dev-lo').textContent = '-' + fmtLen(absMax);
    document.getElementById('cmp-dev-hi').textContent = '+' + fmtLen(absMax);
    document.getElementById('cmp-dev-rms').textContent = `RMS deviation: ${fmtLen(rms)}`;
    renderHistogram(dev, absMax);
    document.getElementById('cmp-dev-legend').style.display = '';
    document.getElementById('cmp-dev-status').textContent = '';
    hideLoad();
  }, 30);
});

document.getElementById('btn-cmp-dev-csv').addEventListener('click', () => {
  if (!App.cmpDev || !App.cmpGeoR) { alert('Compute a deviation map first.'); return; }
  const dev = App.cmpDev, pos = App.cmpGeoR.attributes.position;
  App.cmpMeshR.updateMatrixWorld(true);
  const m = App.cmpMeshR.matrixWorld, v = new THREE.Vector3(), k = Scale.mmPerUnit;
  let csv = 'vertex,x,y,z,deviation_units' + (k ? `,deviation_${Scale.unit}` : '') + '\n';
  for (let i = 0; i < pos.count; i++) {
    v.fromBufferAttribute(pos, i).applyMatrix4(m);
    const d = dev[i], ds = isFinite(d) ? d.toFixed(6) : '';
    csv += `${i},${v.x.toFixed(5)},${v.y.toFixed(5)},${v.z.toFixed(5)},${ds}` + (k ? `,${isFinite(d) ? (d * k).toFixed(4) : ''}` : '') + '\n';
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `MIRL_deviation_${(App.cmpNameR || 'test').replace(/\.\w+$/, '')}.csv`;
  a.click();
});
