// ══════════════════════════════════════════
//  ORIENT / MOVE GIZMO
//  A TransformControls handle on the loaded model: drag the X, Y, or Z arm to
//  turn (Rotate) or shift (Move) the artifact. Orbit is suspended while a handle
//  is dragged, and the wire/points overlays are kept locked to the model so every
//  render style stays aligned. The gizmo is off until the user enables it.
// ══════════════════════════════════════════

import { TransformControls } from 'three/addons/controls/TransformControls.js';
import { App } from '../core/state.js';
import { scene, camera, renderer, controls } from '../core/scenes.js';
import { syncOverlayTransform } from './view-modes.js';

export const Gizmo = { active: false, mode: 'rotate' };

const tc = new TransformControls(camera, renderer.domElement);
tc.setSize(0.75);
tc.setSpace('world');
tc.visible = false;
tc.enabled = false;
scene.add(tc);

// Suspend orbit while a handle is being dragged, so the two don't fight.
tc.addEventListener('dragging-changed', e => { controls.enabled = !e.value; });
// Keep the wire/points overlays riding along with the solid mesh.
tc.addEventListener('objectChange', () => syncOverlayTransform());

function setToggleLabel(on) {
  const btn = document.getElementById('btn-gizmo-toggle');
  if (!btn) return;
  btn.textContent = on ? '✓ Orient / Move Active' : 'Enable Orient / Move';
  btn.classList.toggle('btn-primary', on);
}

// Release the handle from the model (on new file, reset, or toggle off).
export function detachGizmo() {
  tc.detach();
  tc.visible = false;
  tc.enabled = false;
  Gizmo.active = false;
  setToggleLabel(false);
}

// Drop the model back to the orientation it loaded in.
export function resetGizmoTransform() {
  if (!App.mesh) return;
  App.mesh.position.set(0, 0, 0);
  App.mesh.quaternion.identity();
  App.mesh.scale.set(1, 1, 1);
  App.mesh.updateMatrixWorld();
  syncOverlayTransform();
}

// Let the screenshot export hide the handles for a clean PNG, then restore them.
export function setGizmoVisibleForCapture(v) {
  if (Gizmo.active) tc.visible = v;
}

// ── UI wiring ──
document.getElementById('btn-gizmo-toggle').addEventListener('click', () => {
  if (!App.mesh) { alert('Load a model first.'); return; }
  Gizmo.active = !Gizmo.active;
  if (Gizmo.active) {
    tc.attach(App.mesh);
    tc.setMode(Gizmo.mode);
    tc.visible = true;
    tc.enabled = true;
    setToggleLabel(true);
  } else {
    detachGizmo();
  }
});

document.getElementById('gizmo-mode').addEventListener('click', e => {
  const b = e.target.closest('.tb'); if (!b) return;
  document.querySelectorAll('#gizmo-mode .tb').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  Gizmo.mode = b.dataset.gmode;
  tc.setMode(Gizmo.mode);
});

document.getElementById('btn-gizmo-reset').addEventListener('click', resetGizmoTransform);
