// ══════════════════════════════════════════
//  LOAD OBJ (main model)
// ══════════════════════════════════════════

import * as THREE from 'three';
import { OBJLoader } from 'three/addons/loaders/OBJLoader.js';
import { STLLoader } from 'three/addons/loaders/STLLoader.js';
import { PLYLoader } from 'three/addons/loaders/PLYLoader.js';
import { mergeVertices } from 'three/addons/utils/BufferGeometryUtils.js';
import { App } from '../core/state.js';
import { scene, sceneAnn, camera, controls, cameraAnn, controlsAnn } from '../core/scenes.js';
import { showLoad, hideLoad } from '../core/loading.js';
import { computeCurvature, applyCurvatureColors } from '../analysis/curvature.js';
import { computeQuality, updateQualityCard } from '../analysis/quality.js';
import { updateViewMode, updateClipping, clearOverlays } from './view-modes.js';
import { showSaveDbSection } from '../features/database.js';
import { resetRS } from '../analysis/radiance-scaling.js';
import { updateScriptContext } from '../features/scripts.js';

export function buildMesh(rawGeo, sceneDst) {
  rawGeo.computeVertexNormals();
  rawGeo.computeBoundingBox();
  const bb=rawGeo.boundingBox,center=new THREE.Vector3(),size=new THREE.Vector3();
  bb.getCenter(center);bb.getSize(size);
  const sc=2.0/Math.max(size.x,size.y,size.z);
  rawGeo.translate(-center.x,-center.y,-center.z);
  rawGeo.scale(sc,sc,sc);
  rawGeo.computeBoundingBox();
  const mat=new THREE.MeshPhongMaterial({color:0xccccbb,flatShading:false,side:THREE.DoubleSide,shininess:App.shininess});
  const m=new THREE.Mesh(rawGeo,mat);
  sceneDst.add(m);
  return m;
}

// ── STL / PLY loader ──────────────────────────────────────────────────────────
export function loadSTLPLY(files, onDone) {
  const file = [...files].find(f => /\.(stl|ply)$/i.test(f.name));
  if (!file) { alert('No STL or PLY file found.'); return; }
  const ext  = file.name.split('.').pop().toLowerCase();
  const url  = URL.createObjectURL(file);
  showLoad('Loading model…');

  const onGeo = rawGeo => {
    // STL triangle soups have duplicate vertices — merge for better curvature
    let geo = mergeVertices(rawGeo); // fuse coincident verts for both STL and PLY
    geo.computeVertexNormals();
    geo.computeBoundingBox();
    const bb = geo.boundingBox, c = new THREE.Vector3(), s = new THREE.Vector3();
    bb.getCenter(c); bb.getSize(s);
    const sc = 2.0 / Math.max(s.x, s.y, s.z);
    geo.translate(-c.x, -c.y, -c.z);
    geo.scale(sc, sc, sc);
    geo.computeBoundingBox();
    URL.revokeObjectURL(url);
    onDone(geo, file.name);
  };

  const onErr = err => { console.error(err); hideLoad(); alert(`Failed to load ${ext.toUpperCase()}.`); };
  if (ext === 'stl') { new STLLoader().load(url, onGeo, undefined, onErr); }
  else               { new PLYLoader().load(url, onGeo, undefined, onErr); }
}

export async function loadOBJ(files, onDone) {
  let objFile=null,mtlFile=null;
  for(const f of files){
    if(f.name.endsWith('.obj'))objFile=f;
    else if(f.name.endsWith('.mtl'))mtlFile=f;
  }
  if(!objFile){alert('Please include an OBJ file.');return;}

  showLoad('Loading model…');
  const objURL=URL.createObjectURL(objFile);

  function processGroup(grp) {
    let geo=null;
    grp.traverse(ch=>{if(ch.isMesh&&!geo)geo=ch.geometry.clone().applyMatrix4(ch.matrixWorld);});
    if(!geo){hideLoad();alert('No mesh found.');return null;}
    // OBJLoader produces non-indexed triangle soup; merge coincident vertices so
    // half-edge analysis and curvature neighbours work correctly.
    if(!geo.index) geo = mergeVertices(geo);
    geo.computeVertexNormals();geo.computeBoundingBox();
    const bb=geo.boundingBox,c=new THREE.Vector3(),s=new THREE.Vector3();
    bb.getCenter(c);bb.getSize(s);
    const sc=2.0/Math.max(s.x,s.y,s.z);
    geo.translate(-c.x,-c.y,-c.z);geo.scale(sc,sc,sc);
    geo.computeBoundingBox();
    return geo;
  }

  const loader=new OBJLoader();
  loader.load(objURL, grp=>{
    const geo=processGroup(grp);
    if(!geo){hideLoad();URL.revokeObjectURL(objURL);return;}
    onDone(geo, objFile.name);
    URL.revokeObjectURL(objURL);
  }, undefined, err=>{console.error(err);hideLoad();alert('Failed to load OBJ.');});
}

export function loadMainModel(files) {
  // Capture raw file bytes for database storage (OBJ, STL, PLY)
  App.pendingOBJFile = null;
  const mainFile = [...files].find(f => /\.(obj|stl|ply)$/i.test(f.name));
  if (mainFile) {
    mainFile.arrayBuffer().then(ab => { App.pendingOBJFile = { name: mainFile.name, arrayBuffer: ab }; });
  }

  const isSTLPLY = [...files].some(f => /\.(stl|ply)$/i.test(f.name));
  const loader   = isSTLPLY ? loadSTLPLY : loadOBJ;
  loader(files, (geo, name) => {
    // Remove old
    if(App.mesh)scene.remove(App.mesh);
    clearOverlays();
    if(App.meshAnn)sceneAnn.remove(App.meshAnn);

    App.geo=geo; App.fileName=name;
    const mat=new THREE.MeshPhongMaterial({color:0xccccbb,flatShading:false,side:THREE.DoubleSide,shininess:App.shininess});
    App.mesh=new THREE.Mesh(geo,mat);
    scene.add(App.mesh);

    // Mirror in annotation scene
    const matAnn=new THREE.MeshPhongMaterial({color:0xccccbb,flatShading:false,side:THREE.DoubleSide,shininess:App.shininess,transparent:true,opacity:.8});
    App.meshAnn=new THREE.Mesh(geo,matAnn);
    sceneAnn.add(App.meshAnn);

    showLoad('Computing surface analysis…');
    setTimeout(()=>{
      // Reset radiance scaling so the fresh MeshPhongMaterial is not orphaned
      App.radianceScaling = false;
      resetRS();
      const chkRS = document.getElementById('chk-radiance');
      if (chkRS) { chkRS.checked = false; document.getElementById('rs-controls').style.display = 'none'; }

      App.curv=computeCurvature(geo);
      App.qual=computeQuality(geo);
      updateQualityCard();
      updateViewMode();
      updateClipping();
      applyCurvatureColors();

      const nv=geo.attributes.position.count;
      const nf=geo.index?geo.index.count/3:nv/3;
      document.getElementById('ib-verts').textContent=nv.toLocaleString();
      document.getElementById('ib-faces').textContent=Math.round(nf).toLocaleString();
      document.getElementById('ib-file').textContent=name;
      document.getElementById('info-bar').classList.add('visible');
      document.getElementById('viewer-upload').classList.add('hidden');
      document.getElementById('ann-upload-msg').classList.add('hidden');
      document.getElementById('btn-new').style.display='';
      document.getElementById('btn-screenshot').style.display='';
      if(App.backendConnected)document.getElementById('backend-curv-btn').style.display='';

      camera.position.set(0,0,3); controls.reset();
      cameraAnn.position.set(0,0,3); controlsAnn.reset();
      hideLoad();

      // Show save-to-database panel
      showSaveDbSection(name);

      // Expose to scripts tab
      updateScriptContext();
    },50);
  });
}
