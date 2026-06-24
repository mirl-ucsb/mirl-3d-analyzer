// ══════════════════════════════════════════
//  SCRIPTS / CODE RUNNER — sandboxed JS runner with built-in analyses
// ══════════════════════════════════════════

import * as THREE from 'three';
import { App } from '../core/state.js';
import { getCmap, legendGradient } from '../analysis/color-maps.js';

const SCRIPTS = {
  template: {
    title:'Custom Script',
    code:`// MIRL Script API
// Available variables:
//   positions  : Float32Array [x0,y0,z0, x1,y1,z1, ...]
//   normals    : Float32Array (same layout)
//   curvature  : { mean, gaussian, curvedness } Float32Arrays
//   nVerts     : number of vertices
//
// Functions:
//   colorFromValues(values, cmap='turbo')  : apply color map
//   setColors(r, g, b)                    : set raw RGB arrays (0 to 1)
//   log(message)                          : print to output

log("Model loaded: " + nVerts + " vertices");
log("Mean curvature range: " +
  curvature.mean.reduce((a,b)=>Math.min(a,b), Infinity).toFixed(4) + " to " +
  curvature.mean.reduce((a,b)=>Math.max(a,b), -Infinity).toFixed(4));

// Example: visualize mean curvature
colorFromValues(curvature.mean, 'turbo');
`
  },
  extremes: {
    title:'Extreme Curvature',
    code:`// Highlight vertices with |mean curvature| above threshold
const threshold = 0.3;
const r = new Float32Array(nVerts);
const g = new Float32Array(nVerts);
const b = new Float32Array(nVerts);

let count = 0;
for (let i = 0; i < nVerts; i++) {
  const h = Math.abs(curvature.mean[i]);
  if (h > threshold) {
    r[i] = 1.0; g[i] = 0.2; b[i] = 0.2;  // red = sharp
    count++;
  } else {
    r[i] = 0.75; g[i] = 0.75; b[i] = 0.72; // gray = flat
  }
}
log("Sharp vertices (|H| > " + threshold + "): " + count + " / " + nVerts);
log("Percentage: " + (count/nVerts*100).toFixed(1) + "%");
setColors(r, g, b);
`
  },
  flat: {
    title:'Flat Region Detection',
    code:`// Color by local planarity (low curvedness = flat)
const vals = curvature.curvedness;
const sorted = [...vals].filter(isFinite).sort((a,b)=>a-b);
const p20 = sorted[Math.floor(sorted.length * 0.20)];
const p80 = sorted[Math.floor(sorted.length * 0.80)];

const r = new Float32Array(nVerts);
const g = new Float32Array(nVerts);
const b_c = new Float32Array(nVerts);

let flatCount = 0;
for (let i = 0; i < nVerts; i++) {
  const v = vals[i];
  if (v < p20) {
    // Flat: blue-white
    r[i]=0.85; g[i]=0.93; b_c[i]=1.0; flatCount++;
  } else if (v > p80) {
    // Curved: orange-red
    r[i]=0.9; g[i]=0.35; b_c[i]=0.1;
  } else {
    // Middle: neutral gray
    r[i]=0.72; g[i]=0.72; b_c[i]=0.72;
  }
}
log("Flat regions (bottom 20% curvedness): " + flatCount + " vertices");
log("Curved regions (top 20%): " + (nVerts - Math.floor(nVerts*.8)) + " vertices");
setColors(r, g, b_c);
`
  },
  depth: {
    title:'Depth Map (Z-axis)',
    code:`// Color by vertex Z position (height map)
const zVals = new Float32Array(nVerts);
for (let i = 0; i < nVerts; i++) {
  zVals[i] = positions[i * 3 + 2]; // z coordinate
}
log("Z range: " + zVals.reduce((a,b)=>Math.min(a,b), Infinity).toFixed(3) + " to " + zVals.reduce((a,b)=>Math.max(a,b), -Infinity).toFixed(3));
colorFromValues(zVals, 'viridis');
`
  },
  normal: {
    title:'Normal Deviation',
    code:`// Color by deviation of vertex normal from up-vector (Y axis)
const upY = new Float32Array(nVerts);
for (let i = 0; i < nVerts; i++) {
  const ny = Math.abs(normals[i * 3 + 1]);  // |N · Y|
  upY[i] = ny; // 1 = facing up, 0 = horizontal
}
log("Mean |N·Y|: " + (upY.reduce((a,b)=>a+b,0)/nVerts).toFixed(3));
colorFromValues(upY, 'coolwarm');
`
  },
  boundary: {
    title:'Boundary Proximity',
    code:`// Vertex face-degree: low degree → near mesh boundary.
// Deduplicates positions first so non-indexed OBJ meshes work correctly.
const pos = geometry.attributes.position;
const posToCanon = new Map();
const canon = new Int32Array(nVerts);
const canonOrig = [];
for (let i = 0; i < nVerts; i++) {
  const k = pos.getX(i) + '|' + pos.getY(i) + '|' + pos.getZ(i);
  if (!posToCanon.has(k)) { posToCanon.set(k, canonOrig.length); canonOrig.push(i); }
  canon[i] = posToCanon.get(k);
}
const nCanon = canonOrig.length;

const degree = new Float32Array(nCanon);
const idx = geometry.index;
const nF = idx ? idx.count / 3 : nVerts / 3;
const getI = idx ? (f,v) => idx.getX(f*3+v) : (f,v) => f*3+v;
for (let f = 0; f < nF; f++) {
  degree[canon[getI(f,0)]]++;
  degree[canon[getI(f,1)]]++;
  degree[canon[getI(f,2)]]++;
}

// Broadcast canonical degree back to every buffer vertex for coloring
const degreeAll = new Float32Array(nVerts);
for (let i = 0; i < nVerts; i++) degreeAll[i] = degree[canon[i]];

log("Unique vertices: " + nCanon + " (buffer has " + nVerts + ")");
log("Min vertex degree: " + degree.reduce((a,b)=>Math.min(a,b), Infinity));
log("Max vertex degree: " + degree.reduce((a,b)=>Math.max(a,b), -Infinity));
log("Mean degree: " + (degree.reduce((a,b)=>a+b,0)/nCanon).toFixed(1));
colorFromValues(degreeAll, 'viridis');
`
  }
};

let scriptContext = {};

export function updateScriptContext() {
  if(!App.geo)return;
  const pos=App.geo.attributes.position.array;
  const nrm=App.geo.attributes.normal?.array||new Float32Array(pos.length);
  scriptContext={
    positions:pos, normals:nrm, nVerts:App.geo.attributes.position.count,
    curvature:{mean:App.curv.mean||new Float32Array(0),gaussian:App.curv.gaussian||new Float32Array(0),curvedness:App.curv.curvedness||new Float32Array(0)},
    geometry:App.geo,
    setColors:(r,g,b)=>{
      const nV=App.geo.attributes.position.count;
      const cols=new Float32Array(nV*3);
      for(let i=0;i<nV;i++){cols[i*3]=r[i];cols[i*3+1]=g[i];cols[i*3+2]=b[i];}
      App.geo.setAttribute('color',new THREE.BufferAttribute(cols,3));
      App.mesh.material.vertexColors=true;App.mesh.material.color.set(0xffffff);App.mesh.material.needsUpdate=true;
      document.getElementById('color-legend').classList.remove('visible');
    },
    colorFromValues:(vals,cmapName='turbo')=>{
      const cmap=getCmap(cmapName);
      const sorted=[...vals].filter(isFinite).sort((a,b)=>a-b);
      const lo=sorted[Math.floor(sorted.length*.02)]||0;
      const hi=sorted[Math.floor(sorted.length*.98)]||1;
      const range=hi-lo||1, nV=vals.length;
      const cols=new Float32Array(nV*3);
      for(let i=0;i<nV;i++){const t=(vals[i]-lo)/range,[r,g,b]=cmap(t);cols[i*3]=r;cols[i*3+1]=g;cols[i*3+2]=b;}
      App.geo.setAttribute('color',new THREE.BufferAttribute(cols,3));
      App.mesh.material.vertexColors=true;App.mesh.material.color.set(0xffffff);App.mesh.material.needsUpdate=true;
      document.getElementById('legend-title').textContent='Custom Analysis';
      document.getElementById('legend-bar').style.background=legendGradient(cmapName);
      document.getElementById('legend-min').textContent=lo.toFixed(4);
      document.getElementById('legend-max').textContent=hi.toFixed(4);
      document.getElementById('color-legend').classList.add('visible');
    },
    log:msg=>{
      const out=document.getElementById('code-output');
      out.textContent+=msg+'\n';out.scrollTop=out.scrollHeight;
    }
  };
}

window.loadScript=function(el) {
  document.querySelectorAll('.script-item').forEach(s=>s.classList.remove('active'));
  el.classList.add('active');
  const key=el.dataset.script;
  const s=SCRIPTS[key];
  if(s){
    document.getElementById('editor-title').textContent=s.title;
    document.getElementById('code-editor').value=s.code;
  }
};

document.getElementById('btn-run-script').addEventListener('click',()=>{
  if(!App.geo){alert('Load a model in the Viewer tab first.');return;}
  updateScriptContext();
  const code=document.getElementById('code-editor').value;
  const out=document.getElementById('code-output');
  out.textContent='';
  try {
    const fn=new Function(...Object.keys(scriptContext),`"use strict";\n${code}`);
    fn(...Object.values(scriptContext));
  } catch(e) {
    out.textContent+='ERROR: '+e.message+'\n';
    out.style.color='#f38ba8';
    setTimeout(()=>out.style.color='#a6da95',2000);
  }
});

document.getElementById('btn-clear-output').addEventListener('click',()=>{
  document.getElementById('code-output').textContent='';
});

// Load default script
document.getElementById('code-editor').value=SCRIPTS.template.code;
