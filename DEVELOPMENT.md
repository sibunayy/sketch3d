# Sketch3D: development guide

## Quick start
```
npm install
npm run dev          # local dev server
npm test             # unit tests (Vitest)
npm run test:e2e     # browser tests (Playwright: Chromium, iPad WebKit, Chromebook size)
npm run build        # production build into dist/
npm run size         # fails if the bundle is over 500 KB gzipped
npm run bench        # meshing benchmark against bench.budget.json
npm run lint && npm run typecheck
```
Node.js 22 or later. First time with Playwright: `npx playwright install --with-deps chromium webkit`.

## How it works
1. The **document** (`Doc`) is a list of parts, sculpt dabs and grooves. It is small, plain data.
2. Each part is a 2D outline extruded to a thickness, with roundness, a side profile, rotation, taper and squash. Each part has a **signed distance field** (SDF): a function that returns how far a point is from the surface (negative inside).
3. `buildSceneField` combines the parts. Parts that are set to melt use a smooth minimum so they blend. Cut-away parts subtract.
4. A **surface-nets mesher** turns the field into a triangle mesh on a grid. It runs in a **Web Worker**. While the user drags it uses a coarse grid ("draft"); a moment after they stop it re-meshes finely ("final"). The latest request always wins.
5. The main thread only draws. three.js renders the mesh on demand. Canvas 2D draws the Front and Side views.
6. **Save to print** meshes at final quality, checks the model, and writes a binary STL.

## Folder map
```
src/core/     Pure TypeScript. No DOM, no three.js. doc/ geom/ print/
src/worker/   Mesher worker, protocol, scheduler (latest-wins)
src/render/   three.js viewport, camera, gizmo, picking
src/views2d/  Front and Side canvases and the drawing tools
src/app/      State (signals), commands, performance tier
src/storage/  IndexedDB autosave, project files
src/ui/       Design tokens, components, panels, all user-facing text (copy.ts)
tests/unit/   Vitest
tests/e2e/    Playwright
scripts/      bench.ts, extract-icons.ts
legacy/       The old single-file prototype (reference only)
```

## Data model (`src/core/doc/types.ts`)
- `Part`: `id, name, kind, outline (Vec2[]), color, depthMm, round, z, blend, melt, cut, rot {x,y,z}, taper, squash, profile?, twinOf?`
- `SideProfile`: `{ front: number[]; back: number[] }`, 64 samples each, normalised by half the depth, maximum 1.8.
- `Dab`: a sculpt edit stored in the **part's local space**, so it follows the part when the part moves.
- `Groove`: a carved line (the Crease tool).
- Documents carry a `version`. `migrate()` upgrades old saves, including the prototype's `localStorage` key `sketch3d.v2`.
- Rotation is applied about the part's bounding-box centre, in the order Z then Y then X.
- **Front view** maps screen (x, y) to world (x, y). **Side view** maps screen (x, y) to world (z, y).

## Workflow
- One plan task per branch. Write the failing test, see it fail, implement, see it pass, commit.
- Keep commits small. Messages like `feat(core): chunked surface-nets mesher`.
- CI runs lint, typecheck, unit tests, build, size check and e2e. A red CI blocks merging.
- Pushing to `main` runs `.github/workflows/deploy.yml`: all checks, then publish `dist/` to GitHub Pages (base path `/sketch3d/`). Do the real-device checks in `docs/release-checklist.md` first.
- Offline support is a service worker (vite-plugin-pwa, `src/app/pwa.ts`). It is feature-detected and the app never depends on it. Offline tests run against the built app (`npm run preview`, port 4174).

## Performance rules
- The main thread must never run SDF or meshing code.
- Meshes cross the worker boundary as transferred typed arrays, never copied or cloned.
- Preallocate and reuse buffers inside `distance()` and the mesher. No allocation in hot loops.
- Detect a performance tier at startup (`low` / `mid` / `high`) from a short benchmark, and pick voxel sizes from it.
- Profile with Chrome DevTools at 4–6x CPU throttle before calling a feature done.

## Testing
- **Unit tests** cover everything in `src/core` and the scheduler: shapes, SDFs, meshing (watertight, manifold edges), STL bytes, history, migration, print checks.
- **E2E tests** run on `chromium`, `webkit-ipad` (iPad Pro 11) and `chromebook` (1366×768, throttled). They check touch behaviour (no page zoom or scroll), Undo/Redo visibility and size (at least 48 px) at all five viewports, drawing, editing, saving and printing.
- **Real devices:** run `docs/release-checklist.md` on a real low-end Chromebook and a real iPad in Chrome before each release. Emulators miss memory and GPU problems.

## Platform notes
- Chrome on iPad is WebKit underneath. Test in WebKit. iOS limits memory per tab.
- On iPad set `touch-action: none`, `overscroll-behavior: none`, `user-select: none` and `-webkit-touch-callout: none` on canvases, and use a non-zoomable viewport meta tag.
- Service workers may not register in Chrome on iPad. The app must load and work without one.
- `navigator.deviceMemory` exists only in Chrome. Use it as a hint, never as the only signal.
- WebGPU is not available everywhere on school devices. Use WebGL2.
- STL download on iPad should reach the Files app. Fall back to the Web Share API if it does not.

## Releasing
1. All CI checks pass on `main`.
2. Run `docs/release-checklist.md` on real hardware.
3. Tag the release (`v1.x.x`). GitHub Pages serves `dist/`.
4. Record anything surprising in `docs/perf-baseline.md`.

## Known limitations and ideas
- Gizmo resize is uniform only, on purpose, to keep it simple for kids.
- Ideas for later: undo history saved between sessions, a classroom share link, 3MF export.
