// ══════════════════════════════════════════
//  APP STATE
//  Central mutable state used across modules. Imported as a singleton.
// ══════════════════════════════════════════

export const App = {
  // Main model
  geo: null, mesh: null, curv: {}, qual: null, metrics: null, fileName: '',
  viewMode: 'solid', curvMode: 'none', cmap: 'turbo',
  bgColor: '#dedad4',
  clipEnabled: false, clipAxis: 'x', clipPos: 0.5, clipFlip: false,
  clipLo: 2, clipHi: 98,

  // Annotations
  annotations: [],
  annotationMode: false,
  pinColor: '#e74c3c',
  pendingPoint: null,
  annMarkers: [],
  meshAnn: null,

  // Compare
  cmpGeoL: null, cmpMeshL: null, cmpCurvL: {}, cmpNameL: '',
  cmpGeoR: null, cmpMeshR: null, cmpCurvR: {}, cmpNameR: '',
  cmpAnalysisL: 'none', cmpAnalysisR: 'mean',
  cmpCmapL: 'turbo', cmpCmapR: 'coolwarm',
  cmpDev: null,                 // last per-vertex deviation field (Float32Array) on the test mesh
  syncCam: true,

  // Lighting
  ambientInt: 0.6,
  dirInt: 0.8,
  shininess: 25,

  // Radiance Scaling
  radianceScaling: false,
  rsStrength: 1.5,
  rsGamma: 5,

  // Backend
  backendConnected: false,

  // Raw OBJ buffer captured at load time (for save-to-db)
  pendingOBJFile: null,
};
