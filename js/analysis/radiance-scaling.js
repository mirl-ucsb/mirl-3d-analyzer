// ══════════════════════════════════════════
//  RADIANCE SCALING: Vergne et al. 2010
//  Scales diffuse lighting per vertex by: max(0, 1 + strength * tanh(gamma * meanCurv))
//  Convex regions brighten, concave regions dim relative to standard Phong.
// ══════════════════════════════════════════

import * as THREE from 'three';
import { App } from '../core/state.js';

const VS = /* glsl */`
attribute float curv;
attribute vec3  color;

varying vec3  vWorldNormal;
varying vec3  vWorldPos;
varying float vCurv;
varying vec3  vColor;

void main() {
  vCurv        = curv;
  vColor       = color;
  vWorldNormal = normalize(mat3(modelMatrix) * normal);
  vWorldPos    = (modelMatrix * vec4(position, 1.0)).xyz;
  gl_Position  = projectionMatrix * modelViewMatrix * vec4(position, 1.0);
}
`;

const FS = /* glsl */`
uniform float uStrength;
uniform float uGamma;
uniform vec3  uLightDir;

varying vec3  vWorldNormal;
varying vec3  vWorldPos;
varying float vCurv;
varying vec3  vColor;

void main() {
  vec3 N = normalize(vWorldNormal);
  vec3 L = normalize(uLightDir);
  vec3 V = normalize(cameraPosition - vWorldPos);
  vec3 R = reflect(-L, N);

  float diff = max(dot(N, L), 0.0);
  float spec = pow(max(dot(R, V), 0.0), 25.0);

  // Vergne et al. 2010 eq. (4): curvature-dependent radiance scale
  float scale = max(0.0, 1.0 + uStrength * tanh(uGamma * vCurv));

  vec3 ambient  = 0.15 * vColor;
  vec3 diffuse  = 0.85 * diff * scale * vColor;
  vec3 specular = 0.15 * spec * vec3(1.0);

  gl_FragColor = vec4(clamp(ambient + diffuse + specular, 0.0, 1.0), 1.0);
}
`;

let _savedMaterial = null;
let _rsMaterial    = null;

export function buildBaseColorAttr(geo) {
  const nV  = geo.attributes.position.count;
  const cols = new Float32Array(nV * 3);
  for (let i = 0; i < nV; i++) {
    cols[i * 3]     = 0xcc / 255;
    cols[i * 3 + 1] = 0xcc / 255;
    cols[i * 3 + 2] = 0xbb / 255;
  }
  geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
}

function normalizeCurv(raw) {
  // Normalize to [-1, 1] via 98th-percentile of |curv| so tanh has meaningful range.
  // Raw mesh-space curvature values are typically ~0.0001–0.001, far too small for tanh.
  const abs = Array.from(raw).filter(isFinite).map(Math.abs).sort((a, b) => a - b);
  const p98 = abs[Math.floor(abs.length * 0.98)] || 1;
  const out = new Float32Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = Math.max(-1, Math.min(1, raw[i] / p98));
  return out;
}

export function enableRadianceScaling() {
  if (!App.mesh || !App.geo || !App.curv.mean) return;

  const geo = App.geo;

  geo.setAttribute('curv', new THREE.BufferAttribute(normalizeCurv(App.curv.mean), 1));
  if (!geo.attributes.color) buildBaseColorAttr(geo);

  _savedMaterial = App.mesh.material;
  _rsMaterial = new THREE.ShaderMaterial({
    vertexShader:   VS,
    fragmentShader: FS,
    uniforms: {
      uStrength: { value: App.rsStrength },
      uGamma:    { value: App.rsGamma },
      uLightDir: { value: new THREE.Vector3(2, 3, 3).normalize() },
    },
    side:           THREE.DoubleSide,
    clippingPlanes: (_savedMaterial.clippingPlanes || []).slice(),
  });

  App.mesh.material = _rsMaterial;
}

export function disableRadianceScaling() {
  if (!App.mesh || !_savedMaterial) return;
  _savedMaterial.shininess = App.shininess; // apply any slider changes made while RS was active
  App.mesh.material = _savedMaterial;
  _savedMaterial    = null;
  _rsMaterial       = null;
}

export function updateRSUniforms() {
  if (!_rsMaterial) return;
  _rsMaterial.uniforms.uStrength.value = App.rsStrength;
  _rsMaterial.uniforms.uGamma.value    = App.rsGamma;
}

export function resetRS() {
  _savedMaterial = null;
  _rsMaterial    = null;
}
