// ══════════════════════════════════════════
//  BACKEND INTEGRATION: Flask + PyVista service (optional, port 5000)
// ══════════════════════════════════════════

import { App } from '../core/state.js';
import { showLoad, hideLoad } from '../core/loading.js';
import { applyCurvatureColors } from '../analysis/curvature.js';
import { updateScriptContext } from '../features/scripts.js';

const BACKEND = 'http://localhost:5000';

async function checkBackend() {
  try {
    const r = await fetch(`${BACKEND}/status`, { signal: AbortSignal.timeout(800) });
    if (r.ok) {
      App.backendConnected = true;
      document.getElementById('backend-badge').className = 'connected';
      document.getElementById('backend-badge').textContent = 'Backend connected';
      document.getElementById('backend-badge').style.display = '';
      document.getElementById('backend-scripts-info').className = 'backend-info';
      document.getElementById('backend-scripts-info').textContent = 'Backend running. PyVista scripts available.';
      if (App.mesh) document.getElementById('backend-curv-btn').style.display = '';
    }
  } catch {
    App.backendConnected = false;
    document.getElementById('backend-badge').className = 'disconnected';
    document.getElementById('backend-badge').textContent = 'Backend offline';
    document.getElementById('backend-badge').style.display = '';
  }
}
checkBackend();
setInterval(checkBackend, 5000);

document.getElementById('btn-use-backend').addEventListener('click', async () => {
  if (!App.geo || !App.fileName) { alert('Load a model first.'); return; }
  showLoad('Sending to PyVista backend…');
  try {
    const fd = new FormData();
    // Re-serialize geometry to OBJ string for backend
    const pos = App.geo.attributes.position;
    const idx = App.geo.index;
    let obj = '# MIRL export\n';
    for (let i = 0; i < pos.count; i++) obj += `v ${pos.getX(i)} ${pos.getY(i)} ${pos.getZ(i)}\n`;
    if (idx) {
      for (let f = 0; f < idx.count / 3; f++) {
        const a = idx.getX(f * 3) + 1, b = idx.getX(f * 3 + 1) + 1, c = idx.getX(f * 3 + 2) + 1;
        obj += `f ${a} ${b} ${c}\n`;
      }
    }
    fd.append('obj', new Blob([obj], { type: 'text/plain' }), App.fileName);
    const resp = await fetch(`${BACKEND}/analyze`, { method: 'POST', body: fd });
    if (!resp.ok) throw new Error('Backend error: ' + resp.status);
    const data = await resp.json();
    App.curv.mean = new Float32Array(data.mean_curvature);
    App.curv.gaussian = new Float32Array(data.gaussian_curvature);
    App.curv.curvedness = new Float32Array(data.curvedness);
    applyCurvatureColors();
    updateScriptContext();
    hideLoad();
  } catch (e) {
    hideLoad();
    alert('Backend error: ' + e.message + '\nMake sure mirl-backend.py is running.');
  }
});
