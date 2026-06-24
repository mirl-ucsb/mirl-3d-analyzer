// ══════════════════════════════════════════
//  EXPORTS — screenshots, CSV/JSON output, full report
//  Consolidated handlers for everything under "Export" in the viewer
//  sidebar plus the header Screenshot button.
// ══════════════════════════════════════════

import { App } from '../core/state.js';
import { Measure, Scale } from '../analysis/measurement.js';
import { captureFigureDataURL, figureOptsFromUI } from './figures.js';
import { exportAnnotations } from '../features/annotations.js';

// ── Screenshot (with optional scale bar + orientation triad burned in) ──
function doScreenshot() {
  const url = captureFigureDataURL(figureOptsFromUI());
  const a = document.createElement('a');
  a.href = url;
  a.download = `MIRL_${App.fileName.replace('.obj', '')}_${App.curvMode}.png`;
  a.click();
}
document.getElementById('btn-screenshot').addEventListener('click', doScreenshot);
document.getElementById('btn-png').addEventListener('click', doScreenshot);

// ── Curvature CSV ──
document.getElementById('btn-csv').addEventListener('click', () => {
  if (!App.curv.mean) { alert('Load a model first.'); return; }
  const n = App.curv.mean.length;
  let csv = 'vertex_index,mean_curvature,gaussian_curvature,curvedness\n';
  for (let i = 0; i < n; i++) csv += `${i},${App.curv.mean[i]},${App.curv.gaussian[i]},${App.curv.curvedness[i]}\n`;
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `MIRL_${App.fileName.replace('.obj', '')}_curvature.csv`;
  a.click();
});

// ── Roughness report CSV ──
document.getElementById('btn-export-roughness').addEventListener('click', () => {
  const el = document.getElementById('roughness-inline');
  if (!el || el.style.display === 'none') { alert('Compute a roughness region first.'); return; }
  // Scrape values from the rendered inline results
  const rows = el.querySelectorAll('.rrow');
  let csv = 'metric,value\n';
  rows.forEach(row => {
    const key = row.querySelector('.rkey')?.textContent?.trim() || '';
    const val = row.querySelector('.rval')?.textContent?.trim() || '';
    if (key) csv += `"${key}","${val}"\n`;
  });
  const header = el.querySelector('div')?.textContent?.trim() || '';
  csv = `# ${header}\nmetric,value\n` + csv.split('\n').slice(1).join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `MIRL_${App.fileName.replace('.obj', '')}_roughness.csv`;
  a.click();
});

// ── Measurements CSV ──
document.getElementById('btn-export-measurements').addEventListener('click', () => {
  if (!Measure.objects.length) { alert('No measurements to export.'); return; }
  let csv = 'measurement_n,p1_x,p1_y,p1_z,p2_x,p2_y,p2_z,euclidean_units,scale_factor,unit\n';
  Measure.objects.forEach((o, i) => {
    const p1 = o.m1.position, p2 = o.m2.position;
    const eucl = p1.distanceTo(p2);
    csv += `${i + 1},${p1.x.toFixed(5)},${p1.y.toFixed(5)},${p1.z.toFixed(5)},`;
    csv += `${p2.x.toFixed(5)},${p2.y.toFixed(5)},${p2.z.toFixed(5)},`;
    csv += `${eucl.toFixed(5)},${Scale.mmPerUnit || ''},${Scale.unit || ''}\n`;
  });
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = `MIRL_${App.fileName.replace('.obj', '')}_measurements.csv`;
  a.click();
});

// ── Annotations CSV (duplicate convenience button in viewer tab) ──
document.getElementById('btn-ann-export-viewer-csv').addEventListener('click', () => exportAnnotations('csv'));

// ── Full report JSON — everything bundled ──
document.getElementById('btn-export-report').addEventListener('click', () => {
  if (!App.geo) { alert('Load a model first.'); return; }
  const q = App.qual;

  function stats(arr) {
    if (!arr || !arr.length) return null;
    const finite = [...arr].filter(isFinite);
    const mean = finite.reduce((s, v) => s + v, 0) / finite.length;
    const sorted = [...finite].sort((a, b) => a - b);
    return {
      mean: mean.toFixed(6),
      min: sorted[0].toFixed(6),
      max: sorted[sorted.length - 1].toFixed(6),
      p5: sorted[Math.floor(sorted.length * .05)].toFixed(6),
      p95: sorted[Math.floor(sorted.length * .95)].toFixed(6)
    };
  }

  // Roughness — read from DOM (already computed & stored there)
  const roughnessEl = document.getElementById('roughness-inline');
  const roughnessMetrics = {};
  if (roughnessEl && roughnessEl.style.display !== 'none') {
    roughnessEl.querySelectorAll('.rrow').forEach(row => {
      const k = row.querySelector('.rkey')?.textContent?.replace(/—.*$/, '').trim();
      const v = row.querySelector('.rval')?.textContent?.trim();
      if (k) roughnessMetrics[k] = v;
    });
  }

  const measurementList = Measure.objects.map((o, i) => {
    const p1 = o.m1.position, p2 = o.m2.position;
    const eucl = p1.distanceTo(p2);
    return {
      n: i + 1,
      p1: { x: +p1.x.toFixed(5), y: +p1.y.toFixed(5), z: +p1.z.toFixed(5) },
      p2: { x: +p2.x.toFixed(5), y: +p2.y.toFixed(5), z: +p2.z.toFixed(5) },
      euclidean_units: +eucl.toFixed(5),
      euclidean_physical: Scale.mmPerUnit ? +(eucl * Scale.mmPerUnit).toFixed(3) : null,
      unit: Scale.unit
    };
  });

  const report = {
    generated: new Date().toISOString(),
    tool: 'MIRL 3D Artifact Analyzer v2',
    model: {
      filename: App.fileName,
      vertices: q?.nV, faces: q?.nF,
      dimensions_units: q ? { x: +q.dims.x.toFixed(4), y: +q.dims.y.toFixed(4), z: +q.dims.z.toFixed(4) } : null,
      scale: Scale.mmPerUnit ? { factor: Scale.mmPerUnit, unit: Scale.unit } : null
    },
    quality: q ? { grade: q.grade, score: q.score, label: q.label, uniformity: +(q.uniformity * 100).toFixed(1), open_edges: q.boundaryEdges } : null,
    curvature: {
      mean: stats(App.curv.mean),
      gaussian: stats(App.curv.gaussian),
      curvedness: stats(App.curv.curvedness)
    },
    surface_roughness: Object.keys(roughnessMetrics).length ? roughnessMetrics : null,
    measurements: measurementList.length ? measurementList : null,
    annotations: App.annotations.length ? App.annotations : null
  };

  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(report, null, 2)], { type: 'application/json' }));
  a.download = `MIRL_${App.fileName.replace('.obj', '')}_report.json`;
  a.click();
});
