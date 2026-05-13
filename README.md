# MIRL 3D Artifact Analyzer

A lightweight, browser-based tool for visualizing and quantitatively analyzing 3D-scanned
cultural artifacts. Developed at the [Material / Image Research Lab](https://mirl.arthistory.ucsb.edu),
Department of History of Art & Architecture, UC Santa Barbara.

## Features

- **Viewer** — OBJ upload, render modes (solid/wireframe/points/solid+wire),
  cross-section clipping, percentile-clipped color maps.
- **Surface analysis** — mean / Gaussian / curvedness curvature computed
  in the browser; optional Flask + PyVista backend for higher accuracy.
- **Compare** — side-by-side viewports with synced cameras.
- **Annotations** — click-to-place 3D pin markers with labels, exportable
  as JSON or CSV.
- **Scripts** — sandboxed JavaScript console with access to geometry,
  curvature, and color-writing helpers. Six built-in analyses.
- **Measurement** — Euclidean and geodesic (Dijkstra on mesh graph) distances,
  with physical scaling.
- **Surface texture** — ISO 25178 roughness parameters (Sa, Sq, Sz, Sp,
  Sv, Ssk, Sku) over a painted region.
- **Object database** — browser-local catalog of scanned artifacts with
  metadata (scanner, material, researcher, notes), OBJ files stored in
  IndexedDB.

## Running

To access the local server database: 
```bash
cd mirl-3d-analyzer
cd backend
python3 mirl-db-server.py
```


> **Note:** opening `index.html` directly by double-clicking (via `file://`)
> will **not** work — browsers refuse to load ES modules from `file://`.
> A visible warning banner explains this if you try.

### Alternative: single-file bundled version

If you want a portable version you can double-click without running a
server, re-run the extraction script with `--bundle`:

```bash
python3 extract_repo.py --bundle
```

This produces `dist/mirl-3d-analyzer-bundled.html` — a single self-contained
HTML file (~140 KB) with all CSS and JS inlined. It works from `file://`
and can be shared as an email attachment or hosted anywhere static.

## Optional backend

The optional PyVista backend provides more accurate curvature:

```bash
cd backend
pip install -r requirements.txt
python3 mirl-backend.py
```

The frontend auto-detects the backend at `http://localhost:5000`.

## Layout

```
mirl-3d-analyzer/
├── index.html          # shell — links css/ and loads js/main.js
├── css/                # base, components, tabs
├── js/
│   ├── main.js         # entry point
│   ├── core/           # shared state, scenes, loading
│   ├── viewer/         # OBJ loader, view modes, animate loop
│   ├── analysis/       # curvature, quality, color maps, measurement, texture, adjacency
│   ├── features/       # annotations, compare, scripts, database
│   ├── io/             # file upload, exports
│   ├── backend/        # Flask client
│   └── ui/             # tabs, sidebar, event wiring
├── backend/            # optional Python service
└── docs/               # architecture & development notes
```

See `docs/ARCHITECTURE.md` for the module-dependency map.

## Team

- **Veronica Bodenstein** — Researcher / Developer
- [Material / Image Research Lab](https://mirl.arthistory.ucsb.edu), UC Santa Barbara

## License

MIT (see `LICENSE`).
