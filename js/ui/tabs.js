// ══════════════════════════════════════════
//  TAB SWITCHING
// ══════════════════════════════════════════

import { resizeAll } from '../core/scenes.js';

document.querySelectorAll('.tab').forEach(t => {
  t.addEventListener('click', () => {
    document.querySelectorAll('.tab').forEach(x => { x.classList.remove('active'); x.removeAttribute('aria-current'); });
    document.querySelectorAll('.tab-panel').forEach(x => x.classList.remove('active'));
    t.classList.add('active'); t.setAttribute('aria-current', 'page');
    document.getElementById(t.dataset.tab).classList.add('active');
    setTimeout(resizeAll, 50);
  });
});
