// ══════════════════════════════════════════
//  CROSS-SECTION PROFILE → SVG
//  Slice the loaded mesh with the current cross-section plane and draw the
//  contour as a 2D archaeological profile: the section filled solid on paper,
//  with a centre axis, a scale bar (when a physical scale is set), and a
//  caption. The cut is taken in world space, so any orientation set with the
//  orient/move gizmo is honoured. Pure geometry and an SVG string, no deps.
// ══════════════════════════════════════════

import * as THREE from 'three';
import { App } from '../core/state.js';
import { Scale } from '../analysis/measurement.js';

// Paper-and-ink palette, written literally: a standalone SVG can't read the
// app's CSS custom properties.
const PAPER = '#f4efe1', INK = '#211d12', INK2 = '#5e5747', RULE = '#bfb494', STAMP = '#8a2a17';

const esc = s => String(s).replace(/[&<>"]/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// World-space axis-aligned bounds of the (possibly reoriented) mesh, from the
// eight corners of its local bounding box.
function worldBounds() {
  const bb = App.geo.boundingBox, m = App.mesh;
  m.updateMatrixWorld(true);
  const min = new THREE.Vector3(Infinity, Infinity, Infinity);
  const max = new THREE.Vector3(-Infinity, -Infinity, -Infinity);
  const c = new THREE.Vector3();
  for (let i = 0; i < 8; i++) {
    c.set(i & 1 ? bb.max.x : bb.min.x, i & 2 ? bb.max.y : bb.min.y, i & 4 ? bb.max.z : bb.min.z);
    c.applyMatrix4(m.matrixWorld);
    min.min(c); max.max(c);
  }
  return { min, max };
}

// The cutting plane in world space, positioned from the Cross-Section UI.
function sectionPlane(wb) {
  const axis = App.clipAxis, flip = App.clipFlip ? -1 : 1;
  const lo = wb.min[axis], hi = wb.max[axis], p = lo + App.clipPos * (hi - lo);
  const n = new THREE.Vector3(axis === 'x' ? -flip : 0, axis === 'y' ? -flip : 0, axis === 'z' ? -flip : 0);
  return new THREE.Plane(n, p * flip);
}

// Drop the cut axis to land each world point in the 2D drawing frame. Vessel
// axis (world up, Y) is vertical for the upright X and Z cuts; a Y cut is a
// horizontal plan, so X is across and Z is up-the-page.
function project(v, axis) {
  if (axis === 'x') return { u: v.z, w: v.y };
  if (axis === 'z') return { u: v.x, w: v.y };
  return { u: v.x, w: v.z };
}

// Every triangle that straddles the plane yields one 2D segment.
function sliceSegments(plane, axis) {
  const geo = App.geo, pos = geo.attributes.position, index = geo.index;
  const mat = App.mesh.matrixWorld;
  const nF = index ? index.count / 3 : pos.count / 3;
  const gi = index ? (f, v) => index.getX(f * 3 + v) : (f, v) => f * 3 + v;
  const a = new THREE.Vector3(), b = new THREE.Vector3(), c = new THREE.Vector3();
  const read = (i, out) => out.set(pos.getX(i), pos.getY(i), pos.getZ(i)).applyMatrix4(mat);

  const segs = [];
  const cross = [];
  const edge = (p, dp, q, dq) => {
    if ((dp < 0 && dq > 0) || (dp > 0 && dq < 0)) {
      const t = dp / (dp - dq);
      cross.push(project(p.clone().lerp(q, t), axis));
    }
  };
  for (let f = 0; f < nF; f++) {
    read(gi(f, 0), a); read(gi(f, 1), b); read(gi(f, 2), c);
    const da = plane.distanceToPoint(a), db = plane.distanceToPoint(b), dc = plane.distanceToPoint(c);
    cross.length = 0;
    edge(a, da, b, db); edge(b, db, c, dc); edge(c, dc, a, da);
    if (cross.length === 2) segs.push([cross[0], cross[1]]);
  }
  return segs;
}

// Weld coincident endpoints and grow the loose segments into polylines, from
// both ends, so a watertight section closes into fillable loops.
function chainSegments(segs, eps) {
  const q = v => Math.round(v / eps);
  const key = p => q(p.u) + '|' + q(p.w);
  const ends = new Map();
  segs.forEach((s, i) => [0, 1].forEach(e => {
    const k = key(s[e]);
    (ends.get(k) || ends.set(k, []).get(k)).push({ seg: i, end: e });
  }));
  const used = new Array(segs.length).fill(false);
  const chains = [];
  const grow = (path, atTail) => {
    let guard = segs.length + 5;
    while (guard-- > 0) {
      const tip = atTail ? path[path.length - 1] : path[0];
      const cand = (ends.get(key(tip)) || []).find(x => !used[x.seg]);
      if (!cand) break;
      used[cand.seg] = true;
      const next = segs[cand.seg][cand.end ^ 1];
      atTail ? path.push(next) : path.unshift(next);
    }
  };
  for (let i = 0; i < segs.length; i++) {
    if (used[i]) continue;
    used[i] = true;
    const path = [segs[i][0], segs[i][1]];
    grow(path, true); grow(path, false);
    const closed = path.length > 2 && key(path[0]) === key(path[path.length - 1]);
    chains.push({ pts: path, closed });
  }
  return chains;
}

// The exterior elevation: the outer radius (max distance from the centre axis)
// of the section contour in each height band, which for a body of revolution is
// the silhouette, the generatrix of the form. Each cut segment is rasterised
// across the bands it spans, so a tall wall segment fills every band between its
// ends rather than only sampling sparse vertices.
function elevationEnvelope(segs, wmin, wmax) {
  const N = 240, dw = (wmax - wmin) / N || 1;
  const R = new Float32Array(N);
  for (const [p0, p1] of segs) {
    const lo = Math.max(0, Math.floor((Math.min(p0.w, p1.w) - wmin) / dw));
    const hi = Math.min(N - 1, Math.floor((Math.max(p0.w, p1.w) - wmin) / dw));
    for (let b = lo; b <= hi; b++) {
      const w = wmin + (b + 0.5) * dw;
      const t = p1.w === p0.w ? 0 : Math.max(0, Math.min(1, (w - p0.w) / (p1.w - p0.w)));
      const u = Math.abs(p0.u + (p1.u - p0.u) * t);
      if (u > R[b]) R[b] = u;
    }
  }
  const pts = [];
  for (let b = N - 1; b >= 0; b--) if (R[b] > 0) pts.push({ u: R[b], w: wmin + (b + 0.5) * dw });
  return pts;
}

// A round 1 / 2 / 5 × 10^n length at or below the target.
function niceLength(x) {
  const p = Math.pow(10, Math.floor(Math.log10(x)));
  const f = x / p;
  return (f >= 5 ? 5 : f >= 2 ? 2 : 1) * p;
}

function buildSVG(chains, bounds, meta) {
  const { umin, umax, wmin, wmax } = bounds;
  const du = Math.max(umax - umin, 1e-9), dw = Math.max(wmax - wmin, 1e-9);
  const M = 46, TITLE = 36, FOOT = 92, MAXW = 520, MAXH = 660;
  const s = Math.min(MAXW / du, MAXH / dw);          // one scale for both axes: a true drawing
  const drawW = du * s, drawH = dw * s;
  const W = Math.round(drawW + M * 2), H = Math.round(drawH + M * 2 + TITLE + FOOT);
  const ox = M, oy = M + TITLE;
  const X = u => ox + (u - umin) * s;
  const Y = w => oy + (wmax - w) * s;                // flip: up the page

  const d = chains.map(ch => 'M' + ch.pts.map(p => `${X(p.u).toFixed(2)} ${Y(p.w).toFixed(2)}`).join(' L ') + (ch.closed ? ' Z' : '')).join(' ');
  const closedD = chains.filter(c => c.closed).map(ch => 'M' + ch.pts.map(p => `${X(p.u).toFixed(2)} ${Y(p.w).toFixed(2)}`).join(' L ') + ' Z').join(' ');

  const parts = [];
  parts.push(`<svg xmlns="http://www.w3.org/2000/svg" width="${W}" height="${H}" viewBox="0 0 ${W} ${H}" font-family="'IBM Plex Mono','Plex Mono',ui-monospace,monospace">`);
  parts.push(`<rect width="${W}" height="${H}" fill="${PAPER}"/>`);
  parts.push(`<rect x="4" y="4" width="${W - 8}" height="${H - 8}" fill="none" stroke="${RULE}" stroke-width="1"/>`);

  // Title
  parts.push(`<text x="${M}" y="${M - 6}" fill="${INK}" font-size="13" letter-spacing="2.5">${esc(meta.title)}</text>`);

  const axisX = X(0), spansAxis = umin <= 0 && umax >= 0;
  const sectionFill = closedD ? `<path d="${closedD}" fill="${INK}" fill-rule="evenodd" fill-opacity="0.92"/>` : '';
  const sectionStroke = `<path d="${d}" fill="none" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round"/>`;

  if (meta.style === 'half' && meta.elevation && meta.elevation.length && spansAxis) {
    // Half-section on the left of the axis, exterior elevation on the right.
    parts.push(`<defs><clipPath id="secL"><rect x="0" y="0" width="${axisX.toFixed(2)}" height="${H}"/></clipPath></defs>`);
    parts.push(`<g clip-path="url(#secL)">${sectionFill}${sectionStroke}</g>`);
    const elevD = 'M' + meta.elevation.map(p => `${X(p.u).toFixed(2)} ${Y(p.w).toFixed(2)}`).join(' L ');
    parts.push(`<path d="${elevD}" fill="none" stroke="${INK}" stroke-width="1.1" stroke-linejoin="round" stroke-linecap="round"/>`);
  } else {
    // The section: solid fill (even-odd carves the bore from the wall) plus a crisp outline
    parts.push(sectionFill);
    parts.push(sectionStroke);
  }

  // Centre axis (rotational axis of a centred vessel), drawn on top if the cut spans u = 0
  if (spansAxis) {
    parts.push(`<line x1="${axisX.toFixed(2)}" y1="${oy}" x2="${axisX.toFixed(2)}" y2="${(oy + drawH).toFixed(2)}" stroke="${STAMP}" stroke-width="0.8" stroke-dasharray="7 3 1.5 3" opacity="0.7"/>`);
  }

  // Scale bar or a note, on the footer band
  const fy = oy + drawH + 34;
  if (meta.unitPerMesh) {
    const targetUnits = (du * meta.unitPerMesh) / 4;
    const barUnits = niceLength(targetUnits);
    const px = (barUnits / meta.unitPerMesh) * s;                     // physical length → mesh units → px
    parts.push(`<line x1="${M}" y1="${fy}" x2="${(M + px).toFixed(2)}" y2="${fy}" stroke="${INK}" stroke-width="2"/>`);
    parts.push(`<line x1="${M}" y1="${fy - 5}" x2="${M}" y2="${fy + 5}" stroke="${INK}" stroke-width="2"/>`);
    parts.push(`<line x1="${(M + px).toFixed(2)}" y1="${fy - 5}" x2="${(M + px).toFixed(2)}" y2="${fy + 5}" stroke="${INK}" stroke-width="2"/>`);
    parts.push(`<text x="${M}" y="${fy + 22}" fill="${INK}" font-size="12">0</text>`);
    parts.push(`<text x="${(M + px).toFixed(2)}" y="${fy + 22}" fill="${INK}" font-size="12" text-anchor="middle">${barUnits} ${esc(meta.unit)}</text>`);
  } else {
    parts.push(`<text x="${M}" y="${fy + 4}" fill="${INK2}" font-size="12">Scale not set: drawing in mesh units (span ${du.toFixed(3)})</text>`);
  }

  // Caption
  const cap = `${meta.name} · section ${meta.axis.toUpperCase()} at ${Math.round(App.clipPos * 100)}%${meta.openNote}`;
  parts.push(`<text x="${W - M}" y="${H - 28}" fill="${INK2}" font-size="11" text-anchor="end">${esc(cap)}</text>`);
  parts.push(`<text x="${W - M}" y="${H - 14}" fill="${INK2}" font-size="11" text-anchor="end">MIRL 3D Artifact Analyzer · Material / Image Research Lab, UC Santa Barbara</text>`);
  parts.push('</svg>');
  return parts.join('\n');
}

export function exportProfileSVG() {
  if (!App.geo || !App.mesh) { alert('Load a model first.'); return; }
  const wb = worldBounds();
  const axis = App.clipAxis;
  const diag = wb.max.distanceTo(wb.min);
  const plane = sectionPlane(wb);
  // Nudge the plane a hair off any vertices lying exactly on it (poles, flat
  // bases): on-plane vertices would otherwise tear the contour into open chains.
  plane.constant += diag * 1e-5;
  const segs = sliceSegments(plane, axis);
  if (!segs.length) { alert('No section at this position. Move the Cross-Section slider so the plane passes through the object.'); return; }

  // Weld tolerance scaled to the model so endpoints fuse without merging detail
  const chains = chainSegments(segs, Math.max(diag * 1e-4, 1e-7));

  let umin = Infinity, umax = -Infinity, wmin = Infinity, wmax = -Infinity;
  chains.forEach(ch => ch.pts.forEach(p => {
    if (p.u < umin) umin = p.u; if (p.u > umax) umax = p.u;
    if (p.w < wmin) wmin = p.w; if (p.w > wmax) wmax = p.w;
  }));

  const style = document.querySelector('#profile-style .tb.active')?.dataset.pstyle || 'full';
  const elevation = style === 'half' ? elevationEnvelope(segs, wmin, wmax) : null;

  const anyClosed = chains.some(c => c.closed);
  const meta = {
    name: App.fileName || 'model',
    axis, style, elevation,
    title: style === 'half' ? 'PROFILE: SECTION + ELEVATION' : 'CROSS-SECTION PROFILE',
    unit: Scale.unit,
    unitPerMesh: Scale.mmPerUnit || 0,   // physical units per mesh unit (0 = unset)
    openNote: anyClosed ? '' : ' · open section'
  };

  const svg = buildSVG(chains, { umin, umax, wmin, wmax }, meta);
  const a = document.createElement('a');
  a.href = URL.createObjectURL(new Blob([svg], { type: 'image/svg+xml' }));
  const tag = style === 'half' ? 'section-elevation' : 'profile';
  a.download = `MIRL_${(App.fileName || 'model').replace(/\.(obj|stl|ply)$/i, '')}_${tag}_${axis}.svg`;
  a.click();
}

document.getElementById('btn-export-profile').addEventListener('click', exportProfileSVG);
document.getElementById('profile-style').addEventListener('click', e => {
  const b = e.target.closest('.tb'); if (!b) return;
  document.querySelectorAll('#profile-style .tb').forEach(x => x.classList.remove('active'));
  b.classList.add('active');
});
