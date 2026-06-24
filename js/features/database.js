// ══════════════════════════════════════════
//  OBJECT DATABASE
//  Two-tier storage:
//    Primary  — remote server at SERVER_URL (shared across computers)
//    Fallback — IndexedDB ('mirl_obj_files') + localStorage ('mirl_artifact_db')
//
//  Window-attached handlers (dbAnalyze / dbAnalyzeUpload / dbDelete) are
//  called from inline onclick= in dynamically rendered table rows.
// ══════════════════════════════════════════

import { App } from '../core/state.js';
import { resizeAll } from '../core/scenes.js';
import { loadMainModel } from '../viewer/loader.js';

const DB_KEY         = 'mirl_artifact_db';
const SERVER_URL_KEY = 'mirl_server_url';
const DEFAULT_SERVER = 'http://128.111.216.169:5005';

let SERVER_URL     = localStorage.getItem(SERVER_URL_KEY) || DEFAULT_SERVER;
let serverOnline   = false;
let _serverRecords = [];   // cached from last successful GET /artifacts


// ──── Server communication ────────────────────────────────────────────────────

function updateServerBadge(online) {
  const badge = document.getElementById('db-server-badge');
  if (!badge) return;
  badge.textContent = online ? 'Server online' : 'Server offline';
  badge.style.color  = online ? 'var(--green, #4caf50)' : 'var(--text2)';
  badge.title = online ? `Connected to ${SERVER_URL}` : `Cannot reach ${SERVER_URL}`;
}

async function refreshServerRecords() {
  try {
    const r = await fetch(`${SERVER_URL}/artifacts`, { signal: AbortSignal.timeout(4000) });
    if (r.ok) _serverRecords = await r.json();
  } catch {
    _serverRecords = [];
  }
}

async function checkServer() {
  const wasOnline = serverOnline;
  try {
    const r = await fetch(`${SERVER_URL}/status`, { signal: AbortSignal.timeout(2000) });
    serverOnline = r.ok;
  } catch {
    serverOnline = false;
  }
  updateServerBadge(serverOnline);
  if (serverOnline !== wasOnline) {
    if (serverOnline) await refreshServerRecords();
    dbRender(document.getElementById('db-search')?.value || '');
  }
}

checkServer();
setInterval(checkServer, 6000);

// Populate the URL input with whatever is saved
document.addEventListener('DOMContentLoaded', () => {
  const input = document.getElementById('db-server-url');
  if (input) input.value = SERVER_URL;
});
// Also set immediately in case DOMContentLoaded already fired
const _urlInput = document.getElementById('db-server-url');
if (_urlInput) _urlInput.value = SERVER_URL;

document.getElementById('btn-db-server-connect').addEventListener('click', async () => {
  const input  = document.getElementById('db-server-url');
  const msgEl  = document.getElementById('db-server-status-msg');
  const newURL = (input.value || '').trim().replace(/\/$/, '');
  if (!newURL) return;

  SERVER_URL = newURL;
  localStorage.setItem(SERVER_URL_KEY, SERVER_URL);

  msgEl.textContent   = 'Connecting…';
  msgEl.style.color   = 'var(--text2)';
  msgEl.style.display = '';

  await checkServer();

  if (serverOnline) {
    msgEl.textContent = `Connected to ${SERVER_URL}`;
    msgEl.style.color = 'var(--green, #4caf50)';
  } else {
    msgEl.textContent = `Could not reach ${SERVER_URL}`;
    msgEl.style.color = 'var(--yellow, #f0a500)';
  }
});

// Upload artifact to server; returns { ok, id, hasFile } or null on failure.
async function serverSaveArtifact(record, fileBuffer, fileName) {
  try {
    const fd = new FormData();
    fd.append('metadata', JSON.stringify(record));
    if (fileBuffer) {
      fd.append('file', new Blob([fileBuffer]), fileName || record.filename || 'model.obj');
    }
    const r = await fetch(`${SERVER_URL}/artifacts`, {
      method: 'POST', body: fd, signal: AbortSignal.timeout(30000),
    });
    if (!r.ok) return null;
    return await r.json();
  } catch {
    return null;
  }
}


// ──── IndexedDB file store (local fallback) ───────────────────────────────────
export const FilesDB = {
  _db: null,
  async open() {
    if (this._db) return this._db;
    return new Promise((res, rej) => {
      const req = indexedDB.open('mirl_obj_files', 1);
      req.onupgradeneeded = e => e.target.result.createObjectStore('files', { keyPath: 'id' });
      req.onsuccess = e => { this._db = e.target.result; res(this._db); };
      req.onerror = () => rej(req.error);
    });
  },
  async save(id, filename, arrayBuffer) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const tx = db.transaction('files', 'readwrite');
      tx.objectStore('files').put({ id, filename, data: arrayBuffer });
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  },
  async get(id) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const tx = db.transaction('files', 'readonly');
      const req = tx.objectStore('files').get(id);
      req.onsuccess = () => res(req.result); req.onerror = () => rej(req.error);
    });
  },
  async delete(id) {
    const db = await this.open();
    return new Promise((res, rej) => {
      const tx = db.transaction('files', 'readwrite');
      tx.objectStore('files').delete(id);
      tx.oncomplete = res; tx.onerror = () => rej(tx.error);
    });
  }
};


// ──── localStorage metadata (local fallback) ──────────────────────────────────
export function dbLoad() {
  try { return JSON.parse(localStorage.getItem(DB_KEY)) || []; }
  catch { return []; }
}

export function dbSave(records) {
  localStorage.setItem(DB_KEY, JSON.stringify(records));
}


// ──── Record list: merge server + local ───────────────────────────────────────

function getMergedRecords() {
  const local = dbLoad();
  const serverIds = new Set(_serverRecords.map(r => r.id));
  // Only show local records that are not already on the server
  const localOnly = local.filter(r => !r.serverSaved && !serverIds.has(r.id));
  return [
    ..._serverRecords.map(r => ({ ...r, _source: 'server' })),
    ...localOnly.map(r => ({ ...r, _source: 'local' })),
  ];
}


// ──── Table render ────────────────────────────────────────────────────────────

export function dbRender(filterText = '') {
  const records = getMergedRecords();
  const q = filterText.toLowerCase();
  const filtered = q
    ? records.filter(r =>
        (r.name       || '').toLowerCase().includes(q) ||
        (r.material   || '').toLowerCase().includes(q) ||
        (r.researcher || '').toLowerCase().includes(q) ||
        (r.scanner    || '').toLowerCase().includes(q) ||
        (r.notes      || '').toLowerCase().includes(q)
      )
    : records;

  const empty      = document.getElementById('db-empty');
  const table      = document.getElementById('db-table');
  const countLabel = document.getElementById('db-count-label');
  countLabel.textContent = `${filtered.length} record${filtered.length !== 1 ? 's' : ''}`;

  if (filtered.length === 0) {
    empty.style.display = '';
    table.style.display = 'none';
    return;
  }
  empty.style.display = 'none';
  table.style.display = '';

  const sourceTag = src =>
    src === 'server'
      ? '<span class="db-tag" style="background:#1a3550;color:#7eb8f7;font-size:10px">SERVER</span>'
      : '<span class="db-tag" style="background:#2a2a2a;color:#aaa;font-size:10px">LOCAL</span>';

  const tbody = document.getElementById('db-tbody');
  tbody.innerHTML = filtered.map((r, i) => `
    <tr>
      <td style="color:var(--text2)">${i + 1}</td>
      <td><strong>${r.name || '—'}</strong></td>
      <td style="white-space:nowrap">${r.scanDate || '—'}</td>
      <td>${r.scanner  ? `<span class="db-tag">${r.scanner}</span>`  : '—'}</td>
      <td>${r.material ? `<span class="db-tag">${r.material}</span>` : '—'}</td>
      <td>${r.researcher || '—'}</td>
      <td style="font-family:monospace;font-size:11px">${r.filename || '—'}</td>
      <td style="max-width:220px;color:var(--text2)">${r.notes ? r.notes.slice(0, 100) + (r.notes.length > 100 ? '…' : '') : '—'}</td>
      <td style="white-space:nowrap;color:var(--text2);font-size:11px">${r.addedAt || '—'}</td>
      <td style="white-space:nowrap">
        ${sourceTag(r._source)}
        ${r.hasFile
          ? `<button class="btn btn-sm btn-primary" style="font-size:11px;padding:4px 9px;margin-left:4px" onclick="dbAnalyze('${r.id}','${r._source}')">▶ Analyze</button>`
          : `<button class="btn btn-sm" style="font-size:11px;padding:4px 9px;margin-left:4px" onclick="dbAnalyzeUpload('${r.id}')" title="File not stored: pick it manually">Upload &amp; Analyze</button>`}
      </td>
      <td><button class="db-del-btn" onclick="dbDelete('${r.id}','${r._source}')">✕</button></td>
    </tr>`).join('');
}


// ──── Delete ──────────────────────────────────────────────────────────────────

window.dbDelete = async function (id, source) {
  if (!confirm('Remove this artifact record and its stored file?')) return;

  if (source === 'server' && serverOnline) {
    try {
      await fetch(`${SERVER_URL}/artifacts/${id}`, {
        method: 'DELETE', signal: AbortSignal.timeout(5000),
      });
      _serverRecords = _serverRecords.filter(r => r.id !== id);
    } catch { /* server delete failed — still clean up locally */ }
  }

  const records = dbLoad().filter(r => r.id !== id);
  dbSave(records);
  await FilesDB.delete(id).catch(() => {});
  dbRender(document.getElementById('db-search').value);
};


// ──── "Add Artifact" sidebar (Database tab) ───────────────────────────────────
document.getElementById('btn-db-add').addEventListener('click', async () => {
  const name = document.getElementById('db-name').value.trim();
  if (!name) { alert('Artifact name is required.'); return; }

  const record = {
    id:         String(Date.now()),
    name,
    scanDate:   document.getElementById('db-date').value,
    scanner:    document.getElementById('db-scanner').value,
    material:   document.getElementById('db-material').value,
    researcher: document.getElementById('db-researcher').value.trim(),
    filename:   document.getElementById('db-filename').value.trim(),
    notes:      document.getElementById('db-notes').value.trim(),
    addedAt:    new Date().toLocaleDateString(),
    hasFile:    false,
    serverSaved: false,
  };

  if (serverOnline) {
    const result = await serverSaveArtifact(record, null, null);
    if (result?.ok) {
      record.serverSaved = true;
      await refreshServerRecords();
    }
  }

  if (!record.serverSaved) {
    const records = dbLoad();
    records.unshift(record);
    dbSave(records);
  }

  dbRender();
  ['db-name', 'db-researcher', 'db-filename', 'db-notes'].forEach(
    id => { document.getElementById(id).value = ''; }
  );
  document.getElementById('db-date').value    = '';
  document.getElementById('db-scanner').value  = '';
  document.getElementById('db-material').value = '';
});

document.getElementById('db-search').addEventListener('input', e => dbRender(e.target.value));

document.getElementById('btn-db-export-csv').addEventListener('click', () => {
  const records = getMergedRecords();
  if (!records.length) { alert('No records to export.'); return; }
  const header = 'name,scanDate,scanner,material,researcher,filename,notes,addedAt,source';
  const rows = records.map(r =>
    [r.name, r.scanDate, r.scanner, r.material, r.researcher, r.filename,
     r.notes, r.addedAt, r._source].map(v => `"${(v || '').replace(/"/g, '""')}"`).join(',')
  );
  const csv = [header, ...rows].join('\n');
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([csv], { type: 'text/csv' }));
  a.download = 'MIRL_artifact_database.csv';
  a.click();
});

document.getElementById('btn-db-export-json').addEventListener('click', () => {
  const records = getMergedRecords();
  if (!records.length) { alert('No records to export.'); return; }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([JSON.stringify(records, null, 2)], { type: 'application/json' }));
  a.download = 'MIRL_artifact_database.json';
  a.click();
});

// Re-render (and refresh server records) when switching to Database tab
document.querySelectorAll('.tab').forEach(t => {
  t.addEventListener('click', async () => {
    if (t.dataset.tab === 'database-tab') {
      if (serverOnline) await refreshServerRecords();
      dbRender(document.getElementById('db-search').value);
    }
  });
});


// ──── Save-to-database panel (Viewer sidebar, appears after model loads) ──────
export function showSaveDbSection(filename) {
  document.getElementById('save-db-section').style.display = '';
  const stem = filename.replace(/\.[^.]+$/, '');
  document.getElementById('sdb-name').value    = stem;
  document.getElementById('sdb-date').value    = new Date().toISOString().slice(0, 10);
  document.getElementById('sdb-status').style.display = 'none';
  document.getElementById('btn-sdb-save').textContent = 'Save to Database';
  document.getElementById('btn-sdb-save').disabled    = false;
}

document.getElementById('btn-sdb-save').addEventListener('click', async () => {
  const name = document.getElementById('sdb-name').value.trim();
  if (!name) { alert('Artifact name is required.'); return; }

  const q   = App.qual;
  const id  = String(Date.now());
  const record = {
    id,
    name,
    scanDate:     document.getElementById('sdb-date').value,
    scanner:      document.getElementById('sdb-scanner').value,
    material:     document.getElementById('sdb-material').value,
    researcher:   document.getElementById('sdb-researcher').value.trim(),
    filename:     App.fileName,
    notes:        document.getElementById('sdb-notes').value.trim(),
    vertices:     q ? q.nV  : '',
    faces:        q ? q.nF  : '',
    qualityGrade: q ? q.grade : '',
    qualityScore: q ? q.score : '',
    hasFile:      false,
    serverSaved:  false,
    addedAt:      new Date().toLocaleDateString(),
  };

  const st  = document.getElementById('sdb-status');
  const btn = document.getElementById('btn-sdb-save');

  // 1 — try server upload (file + metadata)
  if (serverOnline && App.pendingOBJFile) {
    btn.textContent = 'Uploading to server…';
    btn.disabled    = true;
    const result = await serverSaveArtifact(record, App.pendingOBJFile.arrayBuffer, App.pendingOBJFile.name);
    if (result?.ok) {
      record.serverSaved = true;
      record.hasFile     = result.hasFile;
      await refreshServerRecords();
      st.textContent = '✓ Saved to shared server: accessible from any computer';
      st.style.color = 'var(--green)';
      st.style.display = '';
      btn.textContent = 'Saved ✓';
      dbRender();
      return;
    }
    btn.textContent = 'Save to Database';
    btn.disabled    = false;
  }

  // 2 — fallback: local storage
  if (App.pendingOBJFile) {
    try {
      await FilesDB.save(id, App.pendingOBJFile.name, App.pendingOBJFile.arrayBuffer);
      record.hasFile = true;
    } catch (e) {
      console.warn('Could not store file in IndexedDB:', e);
    }
  }

  const records = dbLoad();
  records.unshift(record);
  dbSave(records);

  st.textContent = record.hasFile
    ? '✓ Saved locally: only accessible on this computer'
    : '✓ Saved (metadata only, file not captured)';
  st.style.color = record.hasFile ? 'var(--yellow)' : 'var(--text2)';
  st.style.display = '';
  btn.textContent = 'Saved ✓';
  btn.disabled    = true;
  dbRender();
});


// ──── Analyze-from-database flows ─────────────────────────────────────────────
const dbAnalyzeInput = document.createElement('input');
dbAnalyzeInput.type     = 'file';
dbAnalyzeInput.accept   = '.obj,.mtl,.jpg,.jpeg,.png,.stl,.ply';
dbAnalyzeInput.multiple = true;
dbAnalyzeInput.style.display = 'none';
document.body.appendChild(dbAnalyzeInput);

let _dbAnalyzePendingRecord = null;

export function switchToViewer() {
  document.querySelectorAll('.tab').forEach(t => t.classList.remove('active'));
  document.querySelectorAll('.tab-panel').forEach(p => p.classList.remove('active'));
  document.querySelector('.tab[data-tab="viewer-tab"]').classList.add('active');
  document.getElementById('viewer-tab').classList.add('active');
  setTimeout(resizeAll, 50);
}

export function prefillSaveSection(record) {
  document.getElementById('save-db-section').style.display = '';
  document.getElementById('sdb-name').value       = record.name       || '';
  document.getElementById('sdb-date').value       = record.scanDate   || '';
  document.getElementById('sdb-scanner').value    = record.scanner    || '';
  document.getElementById('sdb-material').value   = record.material   || '';
  document.getElementById('sdb-researcher').value = record.researcher || '';
  document.getElementById('sdb-notes').value      = record.notes      || '';
  document.getElementById('btn-sdb-save').textContent = 'Already in Database';
  document.getElementById('btn-sdb-save').disabled    = true;
  const st = document.getElementById('sdb-status');
  st.textContent   = 'Loaded from Object Database';
  st.style.color   = 'var(--text2)';
  st.style.display = '';
}

window.dbAnalyze = async function (id, source) {
  // Try server first
  const serverRecord = _serverRecords.find(r => r.id === id);
  if (serverRecord?.hasFile && serverOnline) {
    try {
      const resp = await fetch(`${SERVER_URL}/artifacts/${id}/file`, {
        signal: AbortSignal.timeout(30000),
      });
      if (resp.ok) {
        const blob = await resp.blob();
        const file = new File([blob], serverRecord.filename || 'model.obj');
        switchToViewer();
        loadMainModel([file]);
        setTimeout(() => prefillSaveSection(serverRecord), 200);
        return;
      }
      const err = await resp.json().catch(() => ({}));
      console.warn('Server file fetch failed:', resp.status, err);
    } catch (e) {
      console.warn('Server file fetch error:', e);
    }
  }

  // Fall back to local IndexedDB
  const record = dbLoad().find(r => r.id === id) || serverRecord;
  if (!record) return;
  const fileData = await FilesDB.get(id).catch(() => null);
  if (!fileData) { alert('Stored file not found. Use "Upload & Analyze" instead.'); return; }

  switchToViewer();
  const blob = new Blob([fileData.data], { type: 'text/plain' });
  const file = new File([blob], fileData.filename || record.filename || 'model.obj');
  loadMainModel([file]);
  setTimeout(() => prefillSaveSection(record), 200);
};

window.dbAnalyzeUpload = function (id) {
  const allRecords = getMergedRecords();
  _dbAnalyzePendingRecord = allRecords.find(r => r.id === id) || null;
  dbAnalyzeInput.value = '';
  dbAnalyzeInput.click();
};

dbAnalyzeInput.addEventListener('change', e => {
  if (!e.target.files.length) return;
  switchToViewer();
  loadMainModel(e.target.files);
  if (_dbAnalyzePendingRecord) {
    setTimeout(() => {
      prefillSaveSection(_dbAnalyzePendingRecord);
      _dbAnalyzePendingRecord = null;
    }, 200);
  }
});

// Initial render on load
dbRender();
