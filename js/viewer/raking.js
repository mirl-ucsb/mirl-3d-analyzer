// ══════════════════════════════════════════
//  RAKING LIGHT
//  A single low-angle key light, swept across the surface to read incised or
//  raised detail the way a conservator rakes a lamp across an object. The
//  geometric analog of an RTI relighting pass: the light is anchored to the
//  view (drag it on the dial; the rim is grazing, the centre is frontal), so a
//  chosen rake holds its screen position as the object is orbited. Mutually
//  exclusive with radiance scaling; resets when a new model loads.
// ══════════════════════════════════════════

import * as THREE from 'three';
import { App } from '../core/state.js';
import { scene, camera, controls, ambientLight, dirLight, fillLight } from '../core/scenes.js';

export const Rake = { active: false, az: 135, alt: 24, intensity: 1.15, sweep: false };

const ALT_MIN = 8, ALT_MAX = 90;                       // altitude above the surface, in degrees
const DIST = 4;

const light = new THREE.DirectionalLight(0xfff4e6, 0);
const target = new THREE.Object3D();
scene.add(light); scene.add(target);
light.target = target;

// Place the light from the current azimuth/altitude, anchored to the view so a
// chosen rake holds its screen position as the model is orbited.
function place() {
  const alpha = (90 - Rake.alt) * Math.PI / 180;       // angle off the view axis
  const phi = Rake.az * Math.PI / 180;
  const viewDir = new THREE.Vector3(
    Math.sin(alpha) * Math.cos(phi),
    Math.sin(alpha) * Math.sin(phi),
    Math.cos(alpha)
  ).applyQuaternion(camera.quaternion);                // view space → world
  light.position.copy(controls.target).addScaledVector(viewDir, DIST);
  target.position.copy(controls.target);
}

function syncDial() {
  const dial = document.getElementById('rake-dial'); if (!dial) return;
  const R = 66, cx = 74, cy = 74;
  const r = (ALT_MAX - Rake.alt) / (ALT_MAX - ALT_MIN);  // 0 centre (frontal) … 1 rim (grazing)
  const phi = Rake.az * Math.PI / 180;
  const px = cx + r * R * Math.cos(phi), py = cy - r * R * Math.sin(phi);
  const puck = document.getElementById('rake-puck'), vec = document.getElementById('rake-vec');
  if (puck) { puck.setAttribute('cx', px.toFixed(1)); puck.setAttribute('cy', py.toFixed(1)); }
  if (vec) { vec.setAttribute('x2', px.toFixed(1)); vec.setAttribute('y2', py.toFixed(1)); }
  const ro = document.getElementById('rake-readout');
  if (ro) ro.textContent = `azimuth ${Math.round((Rake.az + 360) % 360)}° · altitude ${Math.round(Rake.alt)}°`;
}

export function updateRaking() {
  if (!Rake.active) return;
  place();
}

function enable() {
  Rake.active = true;
  // Hand the stage to the rake light: drop ambient and the standard key/fill so
  // the grazing gradient carries the surface.
  ambientLight.intensity = 0.16;
  dirLight.intensity = 0;
  fillLight.intensity = 0;
  light.intensity = Rake.intensity;
  place();
}

export function disableRaking() {
  Rake.active = false; Rake.sweep = false;
  light.intensity = 0;
  // Restore the standard three-light setup from the lighting sliders.
  ambientLight.intensity = App.ambientInt;
  dirLight.intensity = App.dirInt;
  fillLight.intensity = 0.25;
  const chk = document.getElementById('chk-raking'); if (chk) chk.checked = false;
  const ctl = document.getElementById('rake-controls'); if (ctl) ctl.style.display = 'none';
  const sw = document.getElementById('rake-sweep'); if (sw) sw.textContent = 'Sweep the light';
}

// Turn the rake off for a fresh model, restoring the standard lighting.
export function resetRaking() { if (Rake.active) disableRaking(); }

// ── Sweep animation ──
let sweepRAF = 0;
function sweepTick() {
  if (!Rake.sweep) return;
  Rake.az = (Rake.az + 0.9) % 360;
  place(); syncDial();
  sweepRAF = requestAnimationFrame(sweepTick);
}

// ── Dial interaction ──
function pointToLight(e) {
  const dial = document.getElementById('rake-dial');
  const rect = dial.getBoundingClientRect();
  const R = 66, cx = 74, cy = 74;
  const sx = (e.clientX - rect.left) * (148 / rect.width);
  const sy = (e.clientY - rect.top) * (148 / rect.height);
  const dx = sx - cx, dy = -(sy - cy);
  const r = Math.min(1, Math.hypot(dx, dy) / R);
  Rake.az = (Math.atan2(dy, dx) * 180 / Math.PI + 360) % 360;
  Rake.alt = ALT_MAX - r * (ALT_MAX - ALT_MIN);
  place(); syncDial();
}

function wire() {
  const dial = document.getElementById('rake-dial');
  let dragging = false;
  const down = e => { dragging = true; dial.setPointerCapture?.(e.pointerId); pointToLight(e); e.preventDefault(); };
  const move = e => { if (dragging) pointToLight(e); };
  const up = () => { dragging = false; };
  dial.addEventListener('pointerdown', down);
  dial.addEventListener('pointermove', move);
  window.addEventListener('pointerup', up);

  document.getElementById('chk-raking').addEventListener('change', e => {
    if (e.target.checked) {
      // Radiance scaling and raking both own the look; only one at a time.
      const rs = document.getElementById('chk-radiance');
      if (rs && rs.checked) {
        rs.checked = false; document.getElementById('rs-controls').style.display = 'none'; App.radianceScaling = false;
        import('../analysis/radiance-scaling.js').then(m => m.disableRadianceScaling?.());
      }
      document.getElementById('rake-controls').style.display = '';
      enable(); syncDial();
    } else {
      disableRaking();
    }
  });

  // The reverse exclusion: turning radiance scaling on drops the rake.
  document.getElementById('chk-radiance').addEventListener('change', e => {
    if (e.target.checked && Rake.active) disableRaking();
  });

  document.getElementById('rake-int').addEventListener('input', e => {
    Rake.intensity = +e.target.value;
    document.getElementById('rake-int-v').textContent = Rake.intensity.toFixed(2);
    if (Rake.active) light.intensity = Rake.intensity;
  });

  document.getElementById('rake-sweep').addEventListener('click', () => {
    if (!Rake.active) return;
    Rake.sweep = !Rake.sweep;
    document.getElementById('rake-sweep').textContent = Rake.sweep ? 'Stop sweeping' : 'Sweep the light';
    if (Rake.sweep) sweepTick(); else cancelAnimationFrame(sweepRAF);
  });

  // Keep a view-anchored rake glued to the surface while orbiting.
  controls.addEventListener('change', updateRaking);
}

wire();
