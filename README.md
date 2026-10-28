# Sketch3D

A free, single-file 3D toy-modelling app for kids. Draw a shape, turn it into a smooth 3D part, snap parts together into a character, and save it as an STL file ready for a 3D printer.

Built for primary-school students (about ages 9–11) and designed to run on low-powered school Chromebooks and tablets. No account, no install, no internet needed once the page has loaded.

**Try it:** https://sibunayy.github.io/sketch3d/

## What you can do

- **Draw and shape:** draw an outline, or start from ready-made shapes (circle, box, star, heart, egg, capsule, triangle, drop, moon).
- **Tail/arm tool:** drag a line in Front or Side view to make a tail, arm or limb.
- **Edit in three views:** Front, Side and 3D all stay in sync. A pink outline in the 2D views shows the part's true 3D shape.
- **3D gizmo:** click a part in the 3D view and drag an arrow to move it, a ring to turn it, or the white cube to resize it.
- **Reshape, size and turn** parts, set how round or thick they are, and melt parts together so they join smoothly.
- **Cut away:** make holes and slots.
- **Add faces:** eyes, smiles and creases.
- **Sculpt mode:** push and pull the surface for finer detail.
- **Paint:** pick a colour or fill a part.
- **Multi-select:** hold Shift, or use the Multi button, to move, colour, copy or delete several parts at once.
- **Presets:** start from a ready-made character.
- **Save to print:** exports an STL file sized to fit a 110 × 110 × 70 mm build area.

## Using it

Open the link above in any modern browser (Chrome, Edge, Safari, Firefox). Everything runs on the student's own device; nothing is uploaded.

To run it locally, download `index.html` and open it in a browser. There is nothing to build or install.

## Keyboard shortcuts

| Key | Action |
| --- | --- |
| Shift + click | Add or remove a part from the selection |
| F | Zoom the 3D view to the selected part |

## How it works

- One self-contained HTML file (about 1 MB) with three.js (r128) included, so it works offline and on locked-down school networks.
- Parts are drawn as 2D outlines, then built into smooth 3D shapes using signed distance fields (SDF), which is what lets parts melt together.
- Part colours, shape and sculpt edits are stored per part, so Front, Side and 3D views always agree.
- Export writes a standard binary STL file.

## Known limitations

- The Front and Side outlines don't follow a part's rotation (the pink outline does).
- The gizmo resizes uniformly only, and is hidden when several parts are selected.
- A Tail/arm drawn in Side view is a plain part, with no bend or width sliders.
- Tested in desktop browsers; not yet verified on every Chromebook or iPad model.

## Project layout

```
index.html   The whole app (HTML, CSS, JavaScript and three.js in one file)
README.md    This file
```

## Credits

- Built with [three.js](https://threejs.org/) (MIT licence).
- Made by Nathan, an education support worker in Ballarat, with help from Claude.
