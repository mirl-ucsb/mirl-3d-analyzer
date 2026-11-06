# Architecture

## Module map

```
main.js
  │
  ├── core/state.js         ← singleton App object (all cross-cutting state)
  ├── core/scenes.js        ← 4 WebGL renderers (main, annotation, compare L/R)
  ├── core/loading.js       ← showLoad / hideLoad overlay helpers
  │
  ├── analysis/
  │   ├── color-maps.js     ← turbo, viridis, coolwarm, gray + legend gradient
  │   ├── curvature.js      ← computeCurvature + applyCurvatureColors
  │   ├── quality.js        ← computeQuality + updateQualityCard
  │   ├── adjacency.js      ← cached vertex adjacency + MinHeap + Dijkstra
  │   ├── measurement.js    ← Measure state, Scale state, click handlers
  │   └── surface-texture.js ← Brush, Jacobi eigensolver, ISO 25178 metrics
  │
  ├── viewer/
  │   ├── view-modes.js     ← solid/wire/points + clipping plane
  │   ├── loader.js         ← OBJ parse + buildMesh + loadMainModel
  │   └── animate.js        ← render loop
  │
  ├── features/
  │   ├── annotations.js    ← raycast-to-surface pin placement + labels
  │   ├── compare.js        ← side-by-side model compare
  │   ├── scripts.js        ← sandboxed JS runner + built-in templates
  │   └── database.js       ← IndexedDB file store + localStorage metadata
  │
  ├── io/
  │   ├── file-upload.js    ← drag/drop + file-input wiring
  │   └── exports.js        ← CSV / JSON / PNG / full-report export
  │
  ├── backend/
  │   └── client.js         ← /status polling + /analyze POST
  │
  └── ui/
      ├── tabs.js           ← tab switching
      ├── sidebar.js        ← section collapse/expand (window.toggleSS)
      └── events.js         ← viewer sidebar controls, btn-new reset
```

## State ownership

All cross-cutting mutable state lives on the `App` singleton in
`core/state.js`. Module-local state stays inside the module:

- `view-modes.js` → `wireOverlay`, `ptsOverlay` (exposed via `clearOverlays()`)
- `analysis/adjacency.js` → adjacency cache
- `analysis/measurement.js` → `Measure` state, `Scale` state
- `analysis/surface-texture.js` → `Brush` state
- `features/annotations.js` → pending click point
- `features/scripts.js` → script context object

## Window-attached functions

A few helpers must live on `window` because they're invoked from inline
`onclick=` handlers in the HTML or dynamically generated table rows:

| Function           | Defined in                    | Called from            |
| ------------------ | ----------------------------- | ---------------------- |
| `toggleSS`         | `ui/sidebar.js`               | sidebar section headers |
| `loadScript`       | `features/scripts.js`         | script list items       |
| `deleteAnnotation` | `features/annotations.js`     | annotation list rows    |
| `dbAnalyze`        | `features/database.js`        | DB table rows           |
| `dbAnalyzeUpload`  | `features/database.js`        | DB table rows           |
| `dbDelete`         | `features/database.js`        | DB table rows           |

## Import policy

- Modules inside a feature folder may import from other features if needed,
  but prefer going through `core/state.js` for shared data.
- Circular imports are permitted between `analysis/measurement.js` and
  `analysis/surface-texture.js` (they mutually deactivate each other via
  event handlers; all references are inside callback bodies, not module
  top-level).
