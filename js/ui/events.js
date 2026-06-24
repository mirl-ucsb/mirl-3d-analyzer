// ══════════════════════════════════════════
//  UI EVENT HANDLERS — viewer sidebar controls + btn-new reset
//  (tabs, sidebar-collapse, screenshot/CSV are handled elsewhere)
// ══════════════════════════════════════════

import * as THREE from 'three';
import { App } from '../core/state.js';
import { scene, sceneAnn, axesHelper, renderer, camera, controls, ambientLight, dirLight } from '../core/scenes.js';
import { applyCurvatureColors } from '../analysis/curvature.js';
import { updateViewMode, updateClipping, clearOverlays } from '../viewer/view-modes.js';
import { detachGizmo } from '../viewer/gizmo.js';
import { renderAnnotationList, exportAnnotations } from '../features/annotations.js';
import { rendererAnn } from '../core/scenes.js';
import { Measure } from '../analysis/measurement.js';
import { Brush } from '../analysis/surface-texture.js';
import { resetAdj } from '../analysis/adjacency.js';
import { enableRadianceScaling, disableRadianceScaling, updateRSUniforms, resetRS } from '../analysis/radiance-scaling.js';

// ── View mode ──
document.getElementById('view-mode').addEventListener('click', e => {
  const b = e.target.closest('.tb'); if (!b) return;
  document.querySelectorAll('#view-mode .tb').forEach(x => x.classList.remove('active'));
  b.classList.add('active'); App.viewMode = b.dataset.mode; updateViewMode();
});

// ── Background ──
document.getElementById('bg-mode').addEventListener('click', e => {
  const b = e.target.closest('.tb'); if (!b) return;
  document.querySelectorAll('#bg-mode .tb').forEach(x => x.classList.remove('active'));
  b.classList.add('active'); App.bgColor = b.dataset.bg;
  scene.background = new THREE.Color(App.bgColor);
});

// ── Axes ──
document.getElementById('chk-axes').addEventListener('change', e => { axesHelper.visible = e.target.checked; });

// ── Reset View — recover framing if the camera gets lost ──
document.getElementById('btn-view-reset').addEventListener('click', () => { controls.reset(); });

// ── Lighting ──
document.getElementById('lgt-ambient').addEventListener('input', e => {
  App.ambientInt = +e.target.value;
  document.getElementById('lgt-ambient-v').textContent = App.ambientInt.toFixed(2);
  ambientLight.intensity = App.ambientInt;
});
document.getElementById('lgt-dir').addEventListener('input', e => {
  App.dirInt = +e.target.value;
  document.getElementById('lgt-dir-v').textContent = App.dirInt.toFixed(2);
  dirLight.intensity = App.dirInt;
});
document.getElementById('lgt-shininess').addEventListener('input', e => {
  App.shininess = +e.target.value;
  document.getElementById('lgt-shininess-v').textContent = App.shininess;
  if (App.mesh?.material?.shininess !== undefined) App.mesh.material.shininess = App.shininess;
});

// ── Curvature ──
document.getElementById('curv-mode').addEventListener('click', e => {
  const b = e.target.closest('.tb'); if (!b) return;
  document.querySelectorAll('#curv-mode .tb').forEach(x => x.classList.remove('active'));
  b.classList.add('active'); App.curvMode = b.dataset.curv; applyCurvatureColors(); updateViewMode();
});

// ── Colormap ──
document.getElementById('cmap-mode').addEventListener('click', e => {
  const b = e.target.closest('.tb'); if (!b) return;
  document.querySelectorAll('#cmap-mode .tb').forEach(x => x.classList.remove('active'));
  b.classList.add('active'); App.cmap = b.dataset.cmap; applyCurvatureColors();
});

// ── Clip sliders ──
document.getElementById('clip-lo').addEventListener('input', e => { App.clipLo = +e.target.value; document.getElementById('clip-lo-v').textContent = App.clipLo + '%'; applyCurvatureColors(); });
document.getElementById('clip-hi').addEventListener('input', e => { App.clipHi = +e.target.value; document.getElementById('clip-hi-v').textContent = App.clipHi + '%'; applyCurvatureColors(); });

// ── Cross-section ──
document.getElementById('chk-clip').addEventListener('change', e => { App.clipEnabled = e.target.checked; updateClipping(); });
document.getElementById('clip-axis').addEventListener('click', e => {
  const b = e.target.closest('.tb'); if (!b) return;
  document.querySelectorAll('#clip-axis .tb').forEach(x => x.classList.remove('active'));
  b.classList.add('active'); App.clipAxis = b.dataset.axis; updateClipping();
});
document.getElementById('clip-pos').addEventListener('input', e => { App.clipPos = +e.target.value / 100; document.getElementById('clip-pos-v').textContent = e.target.value + '%'; updateClipping(); });
document.getElementById('chk-clip-flip').addEventListener('change', e => { App.clipFlip = e.target.checked; updateClipping(); });

// ── Annotation export (top header button) ──
document.getElementById('btn-ann-export').addEventListener('click', () => exportAnnotations('json'));
document.getElementById('btn-ann-export2').addEventListener('click', () => exportAnnotations('json'));
document.getElementById('btn-ann-export-csv').addEventListener('click', () => exportAnnotations('csv'));

// ── New File — full reset ──
document.getElementById('btn-new').addEventListener('click', () => {
  detachGizmo();
  if (App.mesh) scene.remove(App.mesh);
  clearOverlays();
  if (App.meshAnn) sceneAnn.remove(App.meshAnn);
  App.annMarkers.forEach(m => { sceneAnn.remove(m.mesh); sceneAnn.remove(m.label); });
  App.annMarkers = []; App.annotations = [];
  App.geo = null; App.mesh = null; App.curv = {}; App.qual = null;
  document.getElementById('viewer-upload').classList.remove('hidden');
  document.getElementById('ann-upload-msg').classList.remove('hidden');
  document.getElementById('info-bar').classList.remove('visible');
  document.getElementById('quality-card').classList.remove('visible');
  document.getElementById('color-legend').classList.remove('visible');
  document.getElementById('btn-new').style.display = 'none';
  document.getElementById('btn-screenshot').style.display = 'none';
  document.getElementById('backend-curv-btn').style.display = 'none';
  renderAnnotationList();
  document.getElementById('ann-count').textContent = '0';
  document.getElementById('file-input').value = '';
  document.getElementById('save-db-section').style.display = 'none';
  document.getElementById('sdb-name').value = '';
  document.getElementById('sdb-notes').value = '';
  document.getElementById('sdb-status').style.display = 'none';
  document.getElementById('btn-sdb-save').textContent = 'Save to Database';
  document.getElementById('btn-sdb-save').disabled = false;
  // Reset radiance scaling
  App.radianceScaling = false;
  resetRS();
  document.getElementById('chk-radiance').checked = false;
  document.getElementById('rs-controls').style.display = 'none';
  // Clear brush overlay and measurements on new file
  if (Brush.overlay) { scene.remove(Brush.overlay); Brush.overlay = null; }
  Brush.selected.clear();
  Measure.objects.forEach(o => { scene.remove(o.m1); scene.remove(o.m2); scene.remove(o.line); });
  Measure.objects = [];
  if (Measure.pendingMarker) { scene.remove(Measure.pendingMarker); Measure.pendingMarker = null; }
  Measure.pending = null;
  document.getElementById('measure-overlay').classList.remove('visible');
  document.getElementById('roughness-inline').style.display = 'none';
  resetAdj();
});

// ── Annotation mode toggle ──
document.getElementById('btn-ann-mode').addEventListener('click', () => {
  App.annotationMode = !App.annotationMode;
  const btn = document.getElementById('btn-ann-mode');
  if (App.annotationMode) {
    btn.textContent = '✓ Annotation Mode Active';
    btn.classList.add('btn-primary');
    rendererAnn.domElement.style.cursor = 'crosshair';
  } else {
    btn.textContent = 'Enable Annotation Mode';
    btn.classList.remove('btn-primary');
    rendererAnn.domElement.style.cursor = '';
  }
});

// ── Radiance Scaling ──
document.getElementById('chk-radiance').addEventListener('change', e => {
  App.radianceScaling = e.target.checked;
  document.getElementById('rs-controls').style.display = App.radianceScaling ? '' : 'none';
  if (App.radianceScaling) {
    enableRadianceScaling();
  } else {
    disableRadianceScaling();
    applyCurvatureColors();
  }
});

document.getElementById('rs-strength').addEventListener('input', e => {
  App.rsStrength = +e.target.value;
  document.getElementById('rs-strength-v').textContent = App.rsStrength.toFixed(1);
  updateRSUniforms();
});

document.getElementById('rs-gamma').addEventListener('input', e => {
  App.rsGamma = +e.target.value;
  document.getElementById('rs-gamma-v').textContent = App.rsGamma.toFixed(1);
  updateRSUniforms();
});

// ── Pin color ──
document.getElementById('pin-color').addEventListener('click', e => {
  const b = e.target.closest('.tb'); if (!b) return;
  document.querySelectorAll('#pin-color .tb').forEach(x => x.classList.remove('active'));
  b.classList.add('active'); App.pinColor = b.dataset.color;
});
