# MIRL 3D Artifact Analyzer

A browser-based workbench for looking closely at three-dimensional scans of
cultural objects: ceramics, lithics, bone, metalwork, casts, and the other
material things that art history, archaeology, and conservation study. It opens
a scanned object in your web browser and lets you turn it in the light, measure
it, map where its surface curves and wears, mark and describe features, compare
two objects or two states of one object, and keep an orderly catalogue of
everything you have examined.

Built at the [Material / Image Research Lab](https://mirl.arthistory.ucsb.edu)
(MIRL), Department of History of Art and Architecture, University of California,
Santa Barbara.

![The Analyzer's main view: a scanned ceramic vessel on a sand ground, with the render and lighting controls down the left margin and a scan-quality note in the corner reporting an A grade, vertex and face counts, and dimensions](docs/img/viewer.png)

It runs entirely on your own computer. There are no accounts, no fees, and
nothing is uploaded: a scan you open stays on your machine. The tool is free and
open source, and it is meant to be picked up by a student, curator, or
researcher without a technical background.

## Why a tool like this

Museums and labs increasingly scan objects with structured-light scanners and
photogrammetry, producing detailed 3D models. But those models usually sit in
heavy professional software built for engineers and animators. The Analyzer is
the laptop-scale alternative: a small, focused instrument for the questions
humanists actually ask of an object. Where does the surface swell or break? How
deep is this gouge? Is the rim of this vessel worn evenly? How does this cast
compare with the original? What did this look like before the damage?

## What you can do

### Turn the object in the light

Open a scanned model (OBJ, STL, or PLY) by dragging it onto the page. Rotate,
zoom, and relight it; switch between a solid view, a wireframe, and a cloud of
points; or slice through it with a cross-section plane to read its wall
thickness and interior profile. A note in the corner reports the scan's size and
resolution and flags holes or uneven coverage, so you know how much to trust
what you are seeing.

### Read the surface

![The same vessel coloured by mean curvature in a purple-to-yellow scheme, with a printed colour scale in the corner; ridges, the rim, and the swell of the belly stand out as bands of colour](docs/img/curvature.png)

The Analyzer can colour an object by its **curvature**, the measure of where and
how sharply a surface bends. Convex ridges, concave hollows, tool marks, cracks,
and worn edges all stand out in colour that would be hard to see on a plain grey
model. You can choose among several standard measures (mean curvature, Gaussian
curvature, and curvedness), pick a colour scheme, and clip the extreme values so
the middle range reads clearly. A separate "radiance scaling" option exaggerates
the play of light across the form to bring out shallow relief.

### Measure

Click two points to measure the straight-line distance between them, or the
distance across the surface itself, following its contours (the honest length of
a curved profile, not a shortcut through the air). Set a real-world scale, for
example 25.4 mm across a span you have measured with calipers, and every reading
is reported in millimetres, centimetres, or inches.

### Gauge surface texture

Paint a patch on the object and the Analyzer computes standard surface-roughness
numbers, the international **ISO 25178** parameters used in conservation science
(average roughness, peak and valley heights, and so on). This puts a figure to
how polished, pitted, or weathered a passage of the surface is, in terms a
materials specialist will recognize and a report can cite.

### Mark and describe features

![The annotations view: two labelled pins on the vessel, "Rim chip" and "Tool burnish", each listed in the left margin with a note and its coordinates](docs/img/annotations.png)

Place labelled pins anywhere on the surface, each with a title and a note: a chip
on the rim, a burnished passage, a maker's mark, a site of loss. Your
annotations export as a spreadsheet or a data file, ready to accompany a
catalogue entry or a condition report.

### Compare

![Two viewports side by side showing the same vessel: plain grey surface on the left, mean-curvature colour on the right, their cameras locked so both turn together](docs/img/compare.png)

Set two viewports side by side with their cameras locked together, and turn one
object while the other follows. Compare two objects, an object and its cast, or,
as here, the same object shown plainly on one side and curvature-mapped on the
other.

### Keep a catalogue

![The object database: a ruled catalogue of three artifacts (a ceramic vessel, a stone mortar, a bone awl) with columns for scanner, material, researcher, and notes, and an entry form in the left margin](docs/img/database.png)

Record each object you examine with its scanner, material, researcher, and notes,
and search the growing list. The catalogue lives in your browser; export it to a
spreadsheet at any time to back it up or share it with colleagues.

### Write your own analysis (optional)

![The scripts view: a light worksheet with a built-in "Extreme Curvature" analysis in the editor and its result printed below, reporting the share of sharp vertices](docs/img/scripts.png)

For those who want to go further, a small scripting console gives direct access
to the object's geometry, with a handful of ready-made analyses (sharp-feature
detection, depth maps, flat-region finding, and more). Nothing above requires
any coding; this is simply a door left open for the technically curious.

## Getting started

You will need a 3D scan in OBJ, STL, or PLY format, the kind produced by
structured-light scanners (such as Einstar or Artec), photogrammetry, or CT.

The simplest way to run the Analyzer:

1. Download this repository (the green **Code** button above, then **Download
   ZIP**, and unzip it).
2. Open a terminal in the unzipped folder and start a small local web server:
   ```bash
   python3 -m http.server 8000
   ```
3. Open `http://localhost:8000` in Chrome.

A local server is needed because browsers, for security reasons, will not run the
tool from a file opened by double-clicking. If you try, the page itself explains
this and tells you what to do. Once the page has loaded you can work offline, and
nothing you open ever leaves your computer.

Prefer something you can email or open without a terminal? A single self-contained
version lives at `dist/mirl-3d-analyzer-bundled.html`.

## Optional: higher-accuracy curvature

The Analyzer computes everything in the browser. For research that needs the most
precise curvature figures, an optional helper written in Python (using PyVista)
can do the heavy computation instead. It is entirely optional; everything
described above works without it.

```bash
cd backend
pip install -r requirements.txt
python3 mirl-backend.py
```

The page detects the helper automatically when it is running.

## For developers

The Analyzer is plain HTML, CSS, and JavaScript with no build step, designed to
run from any static host. See `docs/ARCHITECTURE.md` for the module map and
`docs/DEVELOPMENT.md` for working notes. The interface follows the shared MIRL
house style (Spectral and IBM Plex Mono, a paper ground, square corners), so it
sits alongside the lab's other tools.

## Credits

- **Veronica Bodenstein**, researcher and developer
- **Jeff O'Brien**, principal investigator and curator, MIRL
- [Material / Image Research Lab](https://mirl.arthistory.ucsb.edu), Department of
  History of Art and Architecture, UC Santa Barbara

Contact: [mirl@arthistory.ucsb.edu](mailto:mirl@arthistory.ucsb.edu)

## Citing

If the Analyzer supports your research or teaching, please cite it. Citation
details are in [`CITATION.cff`](CITATION.cff).

## License

Released under the MIT License (see [`LICENSE`](LICENSE)).
