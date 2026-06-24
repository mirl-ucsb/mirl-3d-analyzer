// ══════════════════════════════════════════
//  MIRL 3D Artifact Analyzer — entry point
//
//  Imports all modules for their side effects (event wiring, initial renders)
//  and kicks off the shared render loop.
// ══════════════════════════════════════════

// Side-effect imports: order matters only for a few pairs.
//   1) core (state, scenes) first — everything downstream reads from these.
//   2) analysis + viewer — pure logic + view-state wiring.
//   3) features — annotations, compare, scripts, database (have event listeners).
//   4) io + backend — file upload, exports, backend polling.
//   5) ui — generic tab / sidebar / event handlers (last so refs resolve).
//   6) animate — start the render loop.

import './core/state.js';
import './core/scenes.js';
import './core/loading.js';

import './analysis/color-maps.js';
import './analysis/curvature.js';
import './analysis/radiance-scaling.js';
import './analysis/quality.js';
import './analysis/adjacency.js';

import './viewer/view-modes.js';
import './viewer/loader.js';
import './viewer/gizmo.js';

import './analysis/measurement.js';
import './analysis/surface-texture.js';

import './features/annotations.js';
import './features/compare.js';
import './features/scripts.js';
import './features/database.js';

import './io/file-upload.js';
import './io/exports.js';

import './backend/client.js';

import './ui/sidebar.js';
import './ui/tabs.js';
import './ui/events.js';

import { animate } from './viewer/animate.js';
animate();
