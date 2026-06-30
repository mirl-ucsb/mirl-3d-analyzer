// ══════════════════════════════════════════
//  COLOR MAPS — turbo, viridis, coolwarm, gray + legend gradient
// ══════════════════════════════════════════

export function turbo(t) {
  t = Math.max(0, Math.min(1, t));
  const r = Math.max(0, Math.min(1, 0.13572 + t * (4.6153 + t * (-42.66 + t * (132.13 + t * (-152.95 + t * 56.71))))));
  const g = Math.max(0, Math.min(1, 0.09140 + t * (2.2646 + t * (-7.945 + t * (8.751 + t * (-5.714 + t * 1.539))))));
  const b = Math.max(0, Math.min(1, 0.10667 + t * (12.750 + t * (-60.58 + t * (132.39 + t * (-134.57 + t * 50.30))))));
  return [r, g, b];
}

export function viridis(t) {
  t = Math.max(0, Math.min(1, t));
  const c = [[.267,.004,.329],[.282,.140,.458],[.253,.265,.530],[.191,.407,.556],[.127,.566,.551],[.267,.749,.441],[.741,.873,.150],[.993,.906,.144]];
  const i = t * (c.length - 1), lo = Math.floor(i), hi = Math.min(lo + 1, c.length - 1), f = i - lo;
  return [c[lo][0] + f * (c[hi][0] - c[lo][0]), c[lo][1] + f * (c[hi][1] - c[lo][1]), c[lo][2] + f * (c[hi][2] - c[lo][2])];
}

export function coolwarm(t) {
  t = Math.max(0, Math.min(1, t));
  if (t < .5) { const s = t / .5; return [.23 + s * .72, .30 + s * .65, .75 + s * .20]; }
  const s = (t - .5) / .5;
  return [.95 + s * .05, .95 - s * .75, .95 - s * .80];
}

export function gray(t) {
  t = Math.max(0, Math.min(1, t));
  return [t, t, t];
}

export function plasma(t) {
  t = Math.max(0, Math.min(1, t));
  const c = [[.050,.030,.528],[.295,.010,.623],[.524,.039,.564],[.706,.085,.436],[.843,.185,.276],[.929,.334,.143],[.974,.518,.040],[.984,.731,.079],[.940,.975,.131]];
  const i = t * (c.length - 1), lo = Math.floor(i), hi = Math.min(lo + 1, c.length - 1), f = i - lo;
  return [c[lo][0] + f*(c[hi][0]-c[lo][0]), c[lo][1] + f*(c[hi][1]-c[lo][1]), c[lo][2] + f*(c[hi][2]-c[lo][2])];
}

export function getCmap(name) {
  return ({ turbo, viridis, coolwarm, gray, plasma })[name] || turbo;
}

export function legendGradient(n) {
  const f = getCmap(n), stops = [];
  for (let i = 0; i <= 10; i++) {
    const t = i / 10, [r, g, b] = f(t);
    stops.push(`rgb(${Math.round(r * 255)},${Math.round(g * 255)},${Math.round(b * 255)}) ${t * 100}%`);
  }
  return `linear-gradient(to right,${stops.join(',')})`;
}
