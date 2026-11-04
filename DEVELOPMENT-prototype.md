# Sketch3D: developer notes

## Build
`index.html` is generated. Edit files in `src/`, then:
```
npm install      # installs three@0.128.0 (needed only for the inlined three.min.js)
node build.mjs   # writes index.html
```
Commit both `src/` and the rebuilt `index.html` (GitHub Pages serves `index.html`).
`src/*.js` are concatenated in the order listed in `build.mjs` into one `<script>`, then `init();` is appended. They share one global scope (no modules).

## Source files
| File | Role |
| --- | --- |
| `template.html` | HTML + CSS. `<!--THREE-->` is replaced by three.js |
| `skin.js` | Base64 icons, icon swapping, Multi button |
| `part2.js` | Part model, history/persistence, multi-select core |
| `sdf.js`, `fix.js` | SDF mesh building, colouring, outline repair |
| `part3.js` | Front view: tools, drawing, selection, ghost outline |
| `presets.js` | Ready-made characters |
| `features.js` | Mirror/symmetry, Tail/arm, misc features |
| `side.js`, `sil.js` | Side view and silhouette/profile maths |
| `ref.js` | Reference picture tracing |
| `ux.js`, `ui3d.js` | Panels, 3D view, sculpt, export, layers |
| `part5.js` | 3D gizmo and camera focus |

## Part model
`{id,name,pts,color,depth,round,z,blend,melt,cut,rx,ry,rz,taper,squash,limb,twin,prof}`
- Rotation is R = Rz*Ry*Rx (degrees) about the bounding-box centre.
- `prof {f,b}` is the side profile as a function of y, normalised by depth/2 (ZMAX = 1.8).
- Sculpt dabs `{t,r,s,c,w|d}` are in world mm, each attached to a part (`scAttach`) so they follow it.
- Multi-select: `msel`, `mbase`, `multiOn`, `selIds()`, `toggleSel()`; `select()` clears it.
- Export (`doSave`) uses `window.claude.use` inside Claude, otherwise downloads a plain `.stl`.

## Design rules
Single self-contained file, light on CPU/memory, large touch targets, plain kid-friendly wording. Test at 1180x820, 820x1180, 1024x768, 1280x650 and 1366x768.

## Known limitations
- Front/Side outlines ignore part rotation (the pink ghost shows the true shape).
- Gizmo resize is uniform only and the gizmo is hidden for multi-select.
- The settings panel edits only the primary selected part.
- A Tail/arm drawn in Side view is a plain part (no bend/width sliders).
- Not yet tested on real Chromebook or iPad hardware.

## Ideas
- One-time toast explaining the gizmo.
- Check ghost-outline cost on low-power devices.
