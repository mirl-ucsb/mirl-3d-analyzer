// ══════════════════════════════════════════
//  SIDEBAR: section collapse/expand
//  toggleSS is attached to window because it's used from inline onclick=
//  handlers in index.html.
// ══════════════════════════════════════════

window.toggleSS = function (el) {
  const collapsed = el.classList.toggle('collapsed');
  el.setAttribute('aria-expanded', String(!collapsed));
};
