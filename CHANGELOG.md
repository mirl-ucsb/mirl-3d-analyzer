# Changelog

The MIRL 3D Artifact Analyzer keeps its history here, newest first. Versions
follow [semantic versioning](https://semver.org); catalogues and exports from
earlier versions open as before.

## 2.1.0 (2026-11-05)

The Analyzer takes the lab's own identity. Nothing about how a scan is opened,
measured, analysed, or exported changes.

- **The MIRL identity.** Familjen Grotesk for names and headings and Epilogue
  for everything you read and operate, the same faces as the Material /
  Image Research Lab's site, on the lab's paper white. The Analyzer's key is
  the blue of the MIRL Risograph mark, shown as a soft bloom beside its name.
  Both typefaces are vendored in `fonts/` under the SIL Open Font License,
  with their licence texts.
- **One bar.** The mark, the six views, the backend state, and the actions now
  share a single line, instead of a title plate above a separate tab strip.
- **Plain words.** Labels, buttons, and section names are set in sentence case,
  the tracked monospace capitals are gone, and toggles say what they do
  (*Turn on measuring*, *Show orient and move handles*). The first screen asks
  you to open a scan rather than upload one.
- **Readable everywhere.** The helper text under each control grew from
  10.5 px to 13 px, and every text colour meets WCAG AA (4.5 to 1 or better).
  The scan-quality grade is a tinted tag: green for A, amber for B, red for C.
- **Keyboard access.** The views and the sidebar sections are real buttons, so
  they can be reached and opened from the keyboard, and each section reports
  whether it is open.
- **Axes that agree.** The orientation triad, the axis cube, and the exported
  figure now colour X, Y, and Z red, green, and blue, the same as the orient
  and move handles.
- **The exports follow.** The specimen sheet, the profile drawing (SVG), and
  the screenshot overlays are set in the new faces and palette.
- Narrow windows: the bar wraps and the views scroll sideways; below 760 px the
  controls stack above the viewport.

New since 2.0.0, released here for the first time:

- **A raking light** for reading surface relief, with a dial for azimuth and
  altitude, a sweep, and optional cast shadows.
- **An orient and move handle** on the model, canonical preset views, and a
  turntable capture (WebM).
- **Cross-section profile drawings** (SVG) in the archaeological convention,
  including a half-section with half-elevation for roughly symmetric vessels.
- **Object metrics**: volume, surface area, and dimensions along the object's
  principal axes.
- **New surface maps**: wall thickness (Shape Diameter Function), shape index
  and its classes, and the ISO 25178 Sdr and Sdq parameters on a brushed region.
- **A deviation map between two aligned scans**, with ICP alignment, a
  histogram, and a CSV export.
- **The specimen sheet**: a one-page object record, ready to print or save as
  PDF, and screenshots with a scale bar and orientation triad.
- three.js is vendored locally so the tool works offline as documented.

## 2.0.0 (2026-06-03)

The first archived release, with its Zenodo DOI.
