"""
MIRL 3D Analyzer: optional PyVista backend.

Provides higher-accuracy curvature than the browser's in-JS discrete operator.
The frontend at http://localhost:8000 polls /status and POSTs OBJ files to
/analyze. All responses include CORS headers so the browser can call us
directly from a different origin.

Install:
    pip install -r requirements.txt

Run:
    python3 mirl-backend.py
"""

import io
import sys
from flask import Flask, jsonify, request
from flask_cors import CORS

try:
    import numpy as np
    import pyvista as pv
except ImportError:
    print("ERROR: PyVista / NumPy not installed. Run: pip install -r requirements.txt",
          file=sys.stderr)
    sys.exit(1)


app = Flask(__name__)
CORS(app)


@app.route("/status")
def status():
    return jsonify({
        "ok": True,
        "service": "mirl-backend",
        "pyvista": pv.__version__,
        "numpy": np.__version__,
    })


@app.route("/analyze", methods=["POST"])
def analyze():
    """
    Accepts a single OBJ file in the 'obj' form field.
    Returns mean_curvature, gaussian_curvature, and curvedness arrays
    aligned to the mesh's vertex order.
    """
    if "obj" not in request.files:
        return jsonify({"error": "Missing 'obj' file field"}), 400

    f = request.files["obj"]
    obj_bytes = f.read()

    # Write to a BytesIO and let PyVista parse via the reader
    reader = pv.get_reader_from_filename = None  # stub to quiet linters
    # PyVista's OBJ reader needs a real path; round-trip through temp file.
    import tempfile, os
    with tempfile.NamedTemporaryFile(suffix=".obj", delete=False) as tmp:
        tmp.write(obj_bytes)
        tmp_path = tmp.name

    try:
        mesh = pv.read(tmp_path)
    finally:
        try:
            os.unlink(tmp_path)
        except OSError:
            pass

    # PyVista curvature methods
    mean = mesh.curvature(curv_type="mean")
    gauss = mesh.curvature(curv_type="gaussian")
    # Curvedness = sqrt(0.5 * (k1^2 + k2^2))
    # Principal curvatures derived from mean (H) and Gaussian (K):
    #   k1,k2 = H ± sqrt(max(0, H^2 - K))
    H = np.asarray(mean)
    K = np.asarray(gauss)
    disc = np.maximum(H * H - K, 0.0)
    root = np.sqrt(disc)
    k1 = H + root
    k2 = H - root
    curvedness = np.sqrt(0.5 * (k1 * k1 + k2 * k2))

    return jsonify({
        "n_vertices": int(mesh.n_points),
        "n_faces": int(mesh.n_cells),
        "mean_curvature": H.tolist(),
        "gaussian_curvature": K.tolist(),
        "curvedness": curvedness.tolist(),
    })


if __name__ == "__main__":
    # Bind to localhost only: do not expose the analyzer to the network
    # without reviewing the /analyze endpoint for abuse potential (it
    # parses arbitrary user-supplied OBJ payloads).
    app.run(host="127.0.0.1", port=5000, debug=False)
