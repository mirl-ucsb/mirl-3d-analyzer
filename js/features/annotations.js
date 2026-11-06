// ══════════════════════════════════════════
//  ANNOTATIONS: click-to-place 3D pin markers with labels
// ══════════════════════════════════════════

import * as THREE from 'three';
import { CSS2DObject } from 'three/addons/renderers/CSS2DRenderer.js';
import { App } from '../core/state.js';
import { rendererAnn, sceneAnn, cameraAnn, raycaster } from '../core/scenes.js';

let pendingPoint = null;

rendererAnn.domElement.addEventListener('click', e => {
  if(!App.annotationMode||!App.meshAnn)return;
  const rect=rendererAnn.domElement.getBoundingClientRect();
  const mouse=new THREE.Vector2(
    ((e.clientX-rect.left)/rect.width)*2-1,
    -((e.clientY-rect.top)/rect.height)*2+1
  );
  raycaster.setFromCamera(mouse,cameraAnn);
  const hits=raycaster.intersectObject(App.meshAnn);
  if(hits.length>0){
    pendingPoint=hits[0].point.clone();
    document.getElementById('ann-title-input').value='';
    document.getElementById('ann-note-input').value='';
    document.getElementById('ann-modal').classList.add('open');
    document.getElementById('ann-title-input').focus();
  }
});

document.getElementById('ann-save').addEventListener('click',()=>{
  if(!pendingPoint)return;
  const title=document.getElementById('ann-title-input').value.trim()||'Annotation';
  const note=document.getElementById('ann-note-input').value.trim();
  addAnnotation(pendingPoint,title,note);
  pendingPoint=null;
  document.getElementById('ann-modal').classList.remove('open');
});
document.getElementById('ann-cancel').addEventListener('click',()=>{
  pendingPoint=null;
  document.getElementById('ann-modal').classList.remove('open');
});

export function addAnnotation(point,title,note) {
  const id=Date.now();
  const ann={id,title,note,point:{x:point.x,y:point.y,z:point.z},color:App.pinColor};
  App.annotations.push(ann);

  // 3D pin sphere
  const pinGeo=new THREE.SphereGeometry(.018,8,8);
  const pinMat=new THREE.MeshBasicMaterial({color:App.pinColor,depthTest:false});
  const pinMesh=new THREE.Mesh(pinGeo,pinMat);
  pinMesh.position.copy(point);
  sceneAnn.add(pinMesh);

  // CSS2D label
  const labelDiv=document.createElement('div');
  labelDiv.className='ann-label';
  labelDiv.textContent=title;
  const labelObj=new CSS2DObject(labelDiv);
  labelObj.position.copy(point);
  labelObj.position.y+=.06;
  sceneAnn.add(labelObj);

  App.annMarkers.push({mesh:pinMesh,label:labelObj,id});
  renderAnnotationList();
  document.getElementById('ann-count').textContent=App.annotations.length;
}

export function deleteAnnotation(id) {
  App.annotations=App.annotations.filter(a=>a.id!==id);
  const idx=App.annMarkers.findIndex(m=>m.id===id);
  if(idx>=0){
    sceneAnn.remove(App.annMarkers[idx].mesh);
    sceneAnn.remove(App.annMarkers[idx].label);
    App.annMarkers.splice(idx,1);
  }
  renderAnnotationList();
  document.getElementById('ann-count').textContent=App.annotations.length;
}
window.deleteAnnotation=deleteAnnotation;

export function renderAnnotationList() {
  const el=document.getElementById('ann-list');
  if(App.annotations.length===0){el.innerHTML='<div class="note" style="margin:0">No annotations yet.</div>';return;}
  el.innerHTML=App.annotations.map((a,i)=>`
    <div class="ann-item">
      <div class="ann-item-title">
        <span style="color:${a.color}">⬤</span> ${i+1}. ${a.title}
        <button class="ann-del" onclick="deleteAnnotation(${a.id})">✕</button>
      </div>
      ${a.note?`<div class="ann-item-note">${a.note}</div>`:''}
      <div class="ann-item-coords">xyz: ${a.point.x.toFixed(3)}, ${a.point.y.toFixed(3)}, ${a.point.z.toFixed(3)}</div>
    </div>`).join('');
}

export function exportAnnotations(format) {
  if(!App.annotations.length){alert('No annotations to export.');return;}
  let content,mime,ext;
  if(format==='json'){
    content=JSON.stringify({file:App.fileName,annotations:App.annotations,exported:new Date().toISOString()},null,2);
    mime='application/json'; ext='json';
  } else {
    const rows=['id,title,note,x,y,z,color'];
    App.annotations.forEach(a=>rows.push(`${a.id},"${a.title}","${a.note||''}",${a.point.x},${a.point.y},${a.point.z},${a.color}`));
    content=rows.join('\n'); mime='text/csv'; ext='csv';
  }
  const a=document.createElement('a');
  a.href=URL.createObjectURL(new Blob([content],{type:mime}));
  a.download=`MIRL_annotations_${App.fileName.replace('.obj','')}.${ext}`;
  a.click();
}
