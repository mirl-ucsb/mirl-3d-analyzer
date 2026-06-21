# Development Notes

## Local development

The project has no build step. Serve the root directory with any static
HTTP server that handles ES modules:

```bash
python3 -m http.server 8000
# or
npx http-server -p 8000
```

Open <http://localhost:8000> in Chrome. Firefox should also work, but
Three.js is primarily tested against Chromium.

You **cannot** open `index.html` by double-click — ES modules require
an HTTP origin, not `file://`.

## Three.js

Loaded from jsDelivr via the `<script type="importmap">` in `index.html`:

```json
{
  "imports": {
    "three": "https://cdn.jsdelivr.net/npm/three@0.160.0/build/three.module.js",
    "three/addons/": "https://cdn.jsdelivr.net/npm/three@0.160.0/examples/jsm/"
  }
}
```

Every module that needs Three.js imports it as `import * as THREE from 'three'`.
Addons (OrbitControls, OBJLoader, MTLLoader, CSS2DRenderer) are imported from
`three/addons/...`.

## Backend

Optional — provides higher-accuracy curvature via PyVista:

```bash
cd backend
python3 -m venv venv
source venv/bin/activate       # Windows: venv\Scripts\activate
pip install -r requirements.txt
python3 mirl-backend.py
```

The service listens on `http://localhost:5000`. The frontend polls
`/status` every 5 seconds and shows a connected badge when reachable.
Click **Use Backend (PyVista)** in the Viewer sidebar to re-run curvature
through the backend on the currently-loaded model.

## Adding a built-in analysis script

Edit `js/features/scripts.js`, add a new entry to the `SCRIPTS` object
keyed by a short slug:

```js
myAnalysis: {
  title: 'My Analysis',
  code: `// code shown in the editor; has access to:
//   positions, normals, curvature, nVerts, geometry
//   log, colorFromValues, setColors
log("Hello, " + nVerts + " vertices");
colorFromValues(curvature.mean, 'viridis');
`
}
```

Then add a matching entry to the sidebar list in `index.html`:

```html
<div class="script-item" data-script="myAnalysis" onclick="loadScript(this)">
  My Analysis
  <small>Short description</small>
</div>
```
