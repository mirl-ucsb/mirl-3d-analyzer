// ══════════════════════════════════════════
//  VIEW MODE + CLIPPING
//  Owns the wire/points overlays and the clipping plane state.
//  Other modules call clearOverlays() to remove them before mesh swaps.
// ══════════════════════════════════════════

import * as THREE from 'three';
import { App } from '../core/state.js';
import { scene, clipPlane } from '../core/scenes.js';

let wireOverlay = null;
let ptsOverlay = null;

export function clearOverlays() {
  if (wireOverlay) { scene.remove(wireOverlay); wireOverlay = null; }
  if (ptsOverlay)  { scene.remove(ptsOverlay);  ptsOverlay  = null; }
}

// Lock the wire/points overlays onto the model's current placement, so the
// orient/move gizmo turns or shifts every render style together, not just the
// solid mesh. Called after a fresh overlay is built and on each gizmo change.
export function syncOverlayTransform() {
  if (!App.mesh) return;
  [wireOverlay, ptsOverlay].forEach(o => {
    if (!o) return;
    o.position.copy(App.mesh.position);
    o.quaternion.copy(App.mesh.quaternion);
    o.scale.copy(App.mesh.scale);
  });
}

export function updateViewMode() {
  if (!App.mesh) return;
  clearOverlays();
  const m = App.viewMode;
  const planes = App.clipEnabled ? [clipPlane] : [];
  App.mesh.visible = true;
  App.mesh.material.wireframe = false;

  if (m === 'wireframe') {
    App.mesh.material.wireframe = true;
  } else if (m === 'points') {
    App.mesh.visible = false;
    ptsOverlay = new THREE.Points(
      App.geo,
      new THREE.PointsMaterial({ size: .002, color: 0x1a5276, vertexColors: App.curvMode !== 'none', clippingPlanes: planes })
    );
    scene.add(ptsOverlay);
  } else if (m === 'solid+wire') {
    wireOverlay = new THREE.Mesh(
      App.geo,
      new THREE.MeshBasicMaterial({ wireframe: true, color: 0x000000, transparent: true, opacity: .06, clippingPlanes: planes })
    );
    scene.add(wireOverlay);
  }
  syncOverlayTransform();
}

export function updateClipping() {
  if (!App.mesh || !App.geo?.boundingBox) return;
  const bb = App.geo.boundingBox, mn = bb.min, mx = bb.max, flip = App.clipFlip ? -1 : 1;
  let n, d;
  if (App.clipAxis === 'x') {
    const p = mn.x + App.clipPos * (mx.x - mn.x);
    n = new THREE.Vector3(-1 * flip, 0, 0); d = p * flip;
  } else if (App.clipAxis === 'y') {
    const p = mn.y + App.clipPos * (mx.y - mn.y);
    n = new THREE.Vector3(0, -1 * flip, 0); d = p * flip;
  } else {
    const p = mn.z + App.clipPos * (mx.z - mn.z);
    n = new THREE.Vector3(0, 0, -1 * flip); d = p * flip;
  }
  clipPlane.normal.copy(n); clipPlane.constant = d;
  const planes = App.clipEnabled ? [clipPlane] : [];
  App.mesh.material.clippingPlanes = planes;
  if (wireOverlay) wireOverlay.material.clippingPlanes = planes;
  if (ptsOverlay)  ptsOverlay.material.clippingPlanes  = planes;
}
