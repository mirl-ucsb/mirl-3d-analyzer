"""
MIRL 3D Analyzer: Object Database Server (port 5005)

Provides cross-computer artifact storage so any browser on the same network
can save and load 3D models.

Storage:
  - artifact_db.sqlite  (metadata)
  - db_files/           (raw model files: OBJ, STL, PLY)

Endpoints:
  GET  /status                → health + record count
  GET  /artifacts             → list all artifact metadata (JSON array)
  POST /artifacts             → save artifact (multipart: metadata JSON + optional file)
  GET  /artifacts/<id>/file   → download stored model file
  DELETE /artifacts/<id>      → delete artifact and its stored file

Install:
    pip install flask flask-cors

Run:
    python3 mirl-db-server.py
    python3 mirl-db-server.py --storage /Volumes/MyLabDrive
"""

import argparse
import json
import os
import sqlite3
import time
from pathlib import Path

from flask import Flask, jsonify, request, send_file, abort
from flask_cors import CORS

parser = argparse.ArgumentParser()
parser.add_argument('--storage', default=None,
                    help='Directory to store the database and files (default: backend/ folder)')
args = parser.parse_args()

STORAGE_DIR = Path(args.storage) if args.storage else Path(__file__).parent
DB_PATH   = STORAGE_DIR / 'artifact_db.sqlite'
FILES_DIR = STORAGE_DIR / 'db_files'
FILES_DIR.mkdir(parents=True, exist_ok=True)

app = Flask(__name__)
CORS(app)


# ── database helpers ──────────────────────────────────────────────────────────

def get_db():
    conn = sqlite3.connect(str(DB_PATH))
    conn.row_factory = sqlite3.Row
    conn.execute('PRAGMA journal_mode=WAL')
    return conn


def init_db():
    with get_db() as conn:
        conn.execute("""
            CREATE TABLE IF NOT EXISTS artifacts (
                id            TEXT PRIMARY KEY,
                name          TEXT,
                scan_date     TEXT,
                scanner       TEXT,
                material      TEXT,
                researcher    TEXT,
                filename      TEXT,
                notes         TEXT,
                vertices      INTEGER,
                faces         INTEGER,
                quality_grade TEXT,
                quality_score TEXT,
                has_file      INTEGER DEFAULT 0,
                added_at      TEXT
            )
        """)
        conn.commit()


def row_to_dict(r):
    return {
        'id':           r['id'],
        'name':         r['name'],
        'scanDate':     r['scan_date'],
        'scanner':      r['scanner'],
        'material':     r['material'],
        'researcher':   r['researcher'],
        'filename':     r['filename'],
        'notes':        r['notes'],
        'vertices':     r['vertices'],
        'faces':        r['faces'],
        'qualityGrade': r['quality_grade'],
        'qualityScore': r['quality_score'],
        'hasFile':      bool(r['has_file']),
        'addedAt':      r['added_at'],
        'serverSaved':  True,
    }


init_db()


# ── endpoints ─────────────────────────────────────────────────────────────────

@app.route('/status')
def status():
    with get_db() as conn:
        count = conn.execute('SELECT COUNT(*) FROM artifacts').fetchone()[0]
    return jsonify({'ok': True, 'service': 'mirl-db-server', 'count': count})


@app.route('/artifacts')
def list_artifacts():
    with get_db() as conn:
        rows = conn.execute(
            'SELECT * FROM artifacts ORDER BY added_at DESC'
        ).fetchall()
    return jsonify([row_to_dict(r) for r in rows])


@app.route('/artifacts', methods=['POST'])
def save_artifact():
    meta_str = request.form.get('metadata')
    if not meta_str:
        return jsonify({'error': 'Missing metadata field'}), 400
    try:
        meta = json.loads(meta_str)
    except json.JSONDecodeError:
        return jsonify({'error': 'Invalid metadata JSON'}), 400

    artifact_id = str(meta.get('id') or int(time.time() * 1000))
    has_file = False

    if 'file' in request.files:
        f = request.files['file']
        raw_name = meta.get('filename') or f.filename or f'{artifact_id}.obj'
        safe_name = os.path.basename(raw_name)
        # Remove any previous file for this id before saving the new one
        for old in FILES_DIR.glob(f'{artifact_id}_*'):
            old.unlink(missing_ok=True)
        file_path = FILES_DIR / f'{artifact_id}_{safe_name}'
        f.save(str(file_path))
        has_file = True

    with get_db() as conn:
        conn.execute("""
            INSERT OR REPLACE INTO artifacts
            (id, name, scan_date, scanner, material, researcher,
             filename, notes, vertices, faces, quality_grade,
             quality_score, has_file, added_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (
            artifact_id,
            meta.get('name', ''),
            meta.get('scanDate', ''),
            meta.get('scanner', ''),
            meta.get('material', ''),
            meta.get('researcher', ''),
            meta.get('filename', ''),
            meta.get('notes', ''),
            meta.get('vertices'),
            meta.get('faces'),
            meta.get('qualityGrade', ''),
            str(meta.get('qualityScore', '')),
            int(has_file),
            meta.get('addedAt', ''),
        ))
        conn.commit()

    return jsonify({'ok': True, 'id': artifact_id, 'hasFile': has_file})


@app.route('/artifacts/<artifact_id>/file')
def get_file(artifact_id):
    with get_db() as conn:
        row = conn.execute(
            'SELECT * FROM artifacts WHERE id = ?', (artifact_id,)
        ).fetchone()
    if not row or not row['has_file']:
        return jsonify({'error': 'No file stored for this artifact'}), 404

    stored = list(FILES_DIR.glob(f'{artifact_id}_*'))
    if not stored:
        return jsonify({'error': 'File missing from disk'}), 404

    download_name = os.path.basename(row['filename'] or 'model.obj')
    import flask as _flask
    kw = 'download_name' if int(_flask.__version__.split('.')[0]) >= 2 else 'attachment_filename'
    return send_file(str(stored[0]), as_attachment=True, **{kw: download_name})


@app.route('/artifacts/<artifact_id>', methods=['DELETE'])
def delete_artifact(artifact_id):
    with get_db() as conn:
        row = conn.execute(
            'SELECT id FROM artifacts WHERE id = ?', (artifact_id,)
        ).fetchone()
        if not row:
            return jsonify({'error': 'Not found'}), 404
        conn.execute('DELETE FROM artifacts WHERE id = ?', (artifact_id,))
        conn.commit()

    for f in FILES_DIR.glob(f'{artifact_id}_*'):
        f.unlink(missing_ok=True)

    return jsonify({'ok': True})


if __name__ == '__main__':
    print(f'MIRL DB server starting on http://0.0.0.0:5005')
    print(f'Database: {DB_PATH}')
    print(f'Files:    {FILES_DIR}')
    app.run(host='0.0.0.0', port=5005, debug=False)
