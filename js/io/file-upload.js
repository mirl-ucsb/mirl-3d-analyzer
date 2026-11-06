// ══════════════════════════════════════════
//  FILE UPLOAD: drag/drop + file input wiring for the main viewer and compare tabs
// ══════════════════════════════════════════

import { loadMainModel } from '../viewer/loader.js';
import { loadCompareModel } from '../features/compare.js';

const uploadBox = document.getElementById('upload-box');
const fileInput = document.getElementById('file-input');
uploadBox.addEventListener('click', () => fileInput.click());
uploadBox.addEventListener('dragover', e => { e.preventDefault(); uploadBox.classList.add('dragover'); });
uploadBox.addEventListener('dragleave', () => uploadBox.classList.remove('dragover'));
uploadBox.addEventListener('drop', e => { e.preventDefault(); uploadBox.classList.remove('dragover'); loadMainModel(e.dataTransfer.files); });
fileInput.addEventListener('change', e => loadMainModel(e.target.files));

document.getElementById('cmp-load-left').addEventListener('click', () => document.getElementById('cmp-file-left').click());
document.getElementById('cmp-load-right').addEventListener('click', () => document.getElementById('cmp-file-right').click());
document.getElementById('cmp-file-left').addEventListener('change', e => loadCompareModel(e.target.files, 'left'));
document.getElementById('cmp-file-right').addEventListener('change', e => loadCompareModel(e.target.files, 'right'));
