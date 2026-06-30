// ══════════════════════════════════════════
//  WALL THICKNESS UI — wires sidebar controls to computeWallThickness
// ══════════════════════════════════════════

import * as THREE from 'three';
import { App } from '../core/state.js';
import { showLoad, hideLoad } from '../core/loading.js';
import { getCmap, legendGradient } from '../analysis/color-maps.js';
import { computeWallThickness } from '../analysis/wallThickness.js';
import { Scale } from '../analysis/measurement.js';

// Live label updates for range sliders
document.getElementById('wt-rays').addEventListener('input', e => {
  document.getElementById('wt-rays-v').textContent = e.target.value;
});
document.getElementById('wt-cone').addEventListener('input', e => {
  document.getElementById('wt-cone-v').textContent = e.target.value;
});

// Subsample toggle
let _sub = 1;
document.getElementById('wt-sub-tg').addEventListener('click', e => {
  const b = e.target.closest('.tb');
  if (!b) return;
  document.querySelectorAll('#wt-sub-tg .tb').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
  _sub = parseInt(b.dataset.sub, 10);
});

document.getElementById('btn-wt-compute').addEventListener('click', () => {
  if (!App.mesh) { alert('Load a model first.'); return; }

  const numRays    = parseInt(document.getElementById('wt-rays').value, 10);
  const coneAngle  = parseInt(document.getElementById('wt-cone').value, 10);
  const subsample  = _sub;

  showLoad('Computing wall thickness…');
  setTimeout(() => {
    let result;
    try {
      result = computeWallThickness(App.mesh, { numRays, coneAngleDeg: coneAngle, subsample });
    } catch (e) {
      hideLoad();
      console.error('Wall thickness error:', e);
      alert('Wall thickness computation failed. Check console for details.');
      return;
    }

    const { perVertexThickness, mean, median, stddev, cv, min, max,
            validVertexCount, coveragePercent } = result;

    const sc = Scale.mmPerUnit || 1;
    const u  = Scale.mmPerUnit ? Scale.unit : 'model units';
    const fmt = v => isNaN(v) ? 'N/A' : (v * sc).toExponential(3) + ' ' + u;
    const fmtPct = v => isNaN(v) ? 'N/A' : v.toFixed(1) + ' %';

    document.getElementById('wt-inline').innerHTML =
      `<div style="font-size:10px;font-weight:700;text-transform:uppercase;letter-spacing:.5px;color:var(--text2);margin-bottom:7px">` +
      `Wall Thickness · ${numRays} rays · ${coneAngle}° cone</div>` +
      `<div class="rrow"><span class="rkey">Mean</span><span class="rval">${fmt(mean)}</span></div>` +
      `<div class="rrow"><span class="rkey">Median</span><span class="rval">${fmt(median)}</span></div>` +
      `<div class="rrow"><span class="rkey">Std dev</span><span class="rval">${fmt(stddev)}</span></div>` +
      `<div class="rrow"><span class="rkey">CV (uniformity)</span><span class="rval">${isNaN(cv) ? 'N/A' : cv.toFixed(3)}</span></div>` +
      `<div class="rrow"><span class="rkey">Min</span><span class="rval">${fmt(min)}</span></div>` +
      `<div class="rrow"><span class="rkey">Max</span><span class="rval">${fmt(max)}</span></div>` +
      `<div class="rrow"><span class="rkey">Coverage</span><span class="rval">${fmtPct(coveragePercent)} (${validVertexCount.toLocaleString()} verts)</span></div>`;
    document.getElementById('wt-inline').style.display = '';

    // Apply thickness colormap to mesh
    const nV = perVertexThickness.length;
    const valid = [];
    for (let i = 0; i < nV; i++) if (!isNaN(perVertexThickness[i])) valid.push(perVertexThickness[i]);
    if (valid.length > 0) {
      valid.sort((a, b) => a - b);
      const lo = valid[Math.floor(valid.length * 0.02)] || 0;
      const hi = valid[Math.floor(valid.length * 0.98)] || 1;
      const range = hi - lo || 1;
      const cm = getCmap('plasma');
      const cols = new Float32Array(nV * 3);
      for (let i = 0; i < nV; i++) {
        const t = isNaN(perVertexThickness[i]) ? 0 : Math.min(1, Math.max(0, (perVertexThickness[i] - lo) / range));
        const [r, g, b] = cm(t);
        cols[i*3] = r; cols[i*3+1] = g; cols[i*3+2] = b;
      }
      App.geo.setAttribute('color', new THREE.BufferAttribute(cols, 3));
      App.mesh.material.vertexColors = true;
      App.mesh.material.color.set(0xffffff);
      App.mesh.material.needsUpdate = true;
      document.getElementById('legend-title').textContent = 'Wall Thickness';
      document.getElementById('legend-bar').style.background = legendGradient('plasma');
      const scl = Scale.mmPerUnit || 1, ul = Scale.mmPerUnit ? Scale.unit : 'units';
      document.getElementById('legend-min').textContent = (lo * scl).toExponential(2) + ' ' + ul;
      document.getElementById('legend-max').textContent = (hi * scl).toExponential(2) + ' ' + ul;
      document.getElementById('color-legend').classList.add('visible');
    }

    hideLoad();
  }, 30);
});
