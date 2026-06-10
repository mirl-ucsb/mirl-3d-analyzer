// ══════════════════════════════════════════
//  MESH ADJACENCY — cached per-geometry vertex→(neighbor, edge-weight) list
//  + MinHeap + Dijkstra geodesic for measurement tool
//
//  Returns { adj, canon, canonOrig } where:
//    adj[ci]      — Array of [cj, weight] for canonical vertex ci
//    canon[i]     — compact canonical index (0..nC-1) for original vertex i
//    canonOrig[ci]— one original vertex index for canonical vertex ci
//  Callers that need original-index semantics should map via canon[i].
// ══════════════════════════════════════════

let _adjCache = null, _adjGeo = null;

export function getMeshAdj(geo) {
  if (_adjGeo === geo) return _adjCache;
  const pos = geo.attributes.position;
  const idx = geo.index;
  const nV = pos.count;
  const getI = idx ? (f, v) => idx.getX(f * 3 + v) : (f, v) => f * 3 + v;
  const nF = idx ? idx.count / 3 : nV / 3;

  // ── Canonical vertex map ─────────────────────────────────────────────────
  // Deduplicates positions so non-indexed OBJ geometry (where every face has
  // 3 unique buffer entries) gets correct multi-face connectivity.
  const posToCanon = new Map();
  const canon = new Int32Array(nV);
  const canonOrig = [];
  for (let i = 0; i < nV; i++) {
    const k = `${pos.getX(i)}|${pos.getY(i)}|${pos.getZ(i)}`;
    if (!posToCanon.has(k)) { posToCanon.set(k, canonOrig.length); canonOrig.push(i); }
    canon[i] = posToCanon.get(k);
  }
  const nC = canonOrig.length;

  // ── Build adjacency on canonical vertices ────────────────────────────────
  const adj = Array.from({ length: nC }, () => []);
  const seen = new Set();
  for (let f = 0; f < nF; f++) {
    const a = canon[getI(f, 0)], b = canon[getI(f, 1)], c = canon[getI(f, 2)];
    for (const [u, v] of [[a, b], [b, c], [a, c]]) {
      const key = u < v ? u * nC + v : v * nC + u;
      if (!seen.has(key)) {
        seen.add(key);
        const uo = canonOrig[u], vo = canonOrig[v];
        const w = Math.hypot(
          pos.getX(uo) - pos.getX(vo),
          pos.getY(uo) - pos.getY(vo),
          pos.getZ(uo) - pos.getZ(vo)
        );
        adj[u].push([v, w]); adj[v].push([u, w]);
      }
    }
  }

  _adjCache = { adj, canon, canonOrig };
  _adjGeo = geo;
  return _adjCache;
}

export function resetAdj() {
  _adjCache = null; _adjGeo = null;
}

export class MinHeap {
  constructor() { this.h = []; }
  push(item) { this.h.push(item); this._up(this.h.length - 1); }
  pop() {
    const top = this.h[0], last = this.h.pop();
    if (this.h.length) { this.h[0] = last; this._dn(0); }
    return top;
  }
  get size() { return this.h.length; }
  _up(i) {
    while (i > 0) {
      const p = (i - 1) >> 1;
      if (this.h[p][0] <= this.h[i][0]) break;
      [this.h[p], this.h[i]] = [this.h[i], this.h[p]];
      i = p;
    }
  }
  _dn(i) {
    const n = this.h.length;
    for (;;) {
      let m = i, l = 2 * i + 1, r = 2 * i + 2;
      if (l < n && this.h[l][0] < this.h[m][0]) m = l;
      if (r < n && this.h[r][0] < this.h[m][0]) m = r;
      if (m === i) break;
      [this.h[m], this.h[i]] = [this.h[i], this.h[m]];
      i = m;
    }
  }
}

export function dijkstraGeodesic(geo, src, dst) {
  const { adj, canon } = getMeshAdj(geo);
  const csrc = canon[src], cdst = canon[dst];
  if (csrc === cdst) return 0;
  const nC = adj.length;
  const dist = new Float64Array(nC).fill(Infinity);
  dist[csrc] = 0;
  const pq = new MinHeap(); pq.push([0, csrc]);
  while (pq.size) {
    const [d, u] = pq.pop();
    if (u === cdst) return d;
    if (d > dist[u]) continue;
    for (const [v, w] of adj[u]) {
      const nd = d + w;
      if (nd < dist[v]) { dist[v] = nd; pq.push([nd, v]); }
    }
  }
  return dist[cdst];
}
