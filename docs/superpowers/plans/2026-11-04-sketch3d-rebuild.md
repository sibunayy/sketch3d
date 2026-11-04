# Sketch3D Rebuild Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Rebuild Sketch3D from scratch as a fast, typed, tested, offline-friendly web app where kids (about ages 9–11) draw shapes, shape them into smooth 3D parts, join them into a character, and save a printable STL, running well on low-end Chromebooks and iPads in Chrome.

**Architecture:** A pure-TypeScript core (document model, outline maths, signed distance fields (SDF), surface-nets mesher, STL writer) with no DOM access, so it is fully unit-testable and runs unchanged in a Web Worker. A thin three.js renderer, Canvas 2D drawing views and a Preact + signals UI sit on top. Edits update the document; the document is re-meshed in a worker (coarse while dragging, fine when the user stops, only the changed chunks); the main thread never blocks.

**Tech Stack:** Vite, TypeScript (strict), three.js (named imports, tree-shaken), Preact + @preact/signals, plain CSS custom properties, Web Worker (typed arrays, transferable buffers), IndexedDB via `idb-keyval`, Vitest, Playwright (Chromium + WebKit), `size-limit`, GitHub Actions + GitHub Pages. Optional later: WebAssembly for the SDF hot loop, only if the benchmark in Task 7 misses budget.

**Spec:** `CLAUDE.md` (constraints and UX rules), `DEVELOPMENT.md` (data model and known limitations), and the working prototype in `legacy/` (behaviour reference only, do not copy its structure). Executors read all three.

## Global Constraints

- Targets: Chromebooks (often Celeron/MediaTek, 4 GB RAM, weak GPU) in Chrome, and iPads in Chrome. **Chrome on iOS runs on Apple's WebKit engine**, so build and test for Safari behaviour. Touch-first; mouse and trackpad must also work.
- JS bundle under **500 KB gzipped**, including three.js. The build fails if it grows past that.
- Drag, sculpt and rotate: **30 fps or better**, no single frame task over **50 ms** on a 4 GB Chromebook (verify with Chrome DevTools CPU throttling at 4–6x).
- Render on demand, not in a constant loop. Cap `devicePixelRatio` at **2**.
- Touch targets at least **48 px**, with spacing. No hover-only features.
- Every action is undoable; Undo/Redo is always visible; autosave constantly so work is never lost.
- Wording: about a grade 3 reading level, sentence case, verb-first buttons ("Save to print", "Make a copy"), no jargon ("How thick?", not "extrusion depth"). Errors say what happened and what to do next, and never blame the user.
- Show progress for anything over 300 ms. Respect `prefers-reduced-motion`.
- Build area **110 × 110 × 70 mm**. STL export is binary, in millimetres.
- No account, no login, no tracking, **no network calls at runtime**. Student projects never leave the device.
- TypeScript strict mode. Plain CSS with custom properties: **no React, no UI kits, no CSS frameworks**. Ask Nathan before adding any dependency not listed in the Tech Stack.
- Input is Pointer Events with `touch-action: none` on canvases. One code path for mouse, touch and pen.
- Test viewports: 1180×820, 820×1180, 1024×768, 1280×650, 1366×768.
- Nathan does not write code: pull requests and summaries are short and plain-language. Plan first for anything bigger than a small fix; small commits.

## Review Focus

Failure modes the spec implies but no feature task would otherwise test. Each has a test in the task named in brackets.

1. **Scribbles that are not shapes:** a stroke with fewer than 3 points, near-zero area, or that crosses itself many times. Expected: a friendly message ("Draw a bigger, closed loop and try again.") or an untwisted outline, never a crash or an invisible part. [Task 3]
2. **Models that cannot be printed:** no parts, only cut-away parts, a part thinner than the printer can make, a part floating apart from the rest, or a model bigger than the build area. Expected: a plain explanation and a suggested fix; never an empty or invalid STL file. [Task 14]
3. **Out-of-order mesher results:** rapid dragging queues many jobs, and an old result can arrive after a newer one. Expected: the latest edit always wins, with no flicker and no memory growth. [Task 7]
4. **Storage that fails:** IndexedDB blocked (private mode, school policy), quota full, or the tab killed mid-save. Expected: the app still works, tells the student their work is not being saved, and the last good save is intact. [Task 13]
5. **iPad touch quirks:** page pinch-zoom, double-tap zoom, rubber-band scrolling, a resting palm while drawing with a pen, and a second finger landing mid-stroke. Expected: the page never zooms or scrolls, the stroke is not corrupted, and a pinch becomes a camera/view zoom instead. [Task 10]

---

## File Structure

```
sketch3d/
  CLAUDE.md  DEVELOPMENT.md  README.md
  legacy/                      # old prototype, moved here in Task 1, deleted when the rebuild matches it
  index.html  vite.config.ts  tsconfig.json  package.json
  public/icons/                # icons extracted from legacy/src/skin.js (Task 9)
  src/
    main.tsx                   # boot: detect tier, load project, mount UI
    core/                      # pure TS, NO DOM / three.js imports (enforced by lint rule)
      doc/   types.ts  schema.ts  migrate.ts  history.ts  presets.ts
      geom/  vec.ts  outline.ts  shapes.ts  profile.ts  sdf.ts  scene.ts  surfaceNets.ts  bounds.ts
      print/ stl.ts  check.ts
    worker/  mesher.worker.ts  protocol.ts  scheduler.ts
    render/  viewport.ts  camera.ts  gizmo.ts  picking.ts  materials.ts
    views2d/ canvas.ts  viewTransform.ts  front.ts  side.ts  tools/*.ts
    app/     state.ts  commands.ts  perfTier.ts
    storage/ db.ts  autosave.ts  projectFile.ts
    ui/      tokens.css  components/*  panels/*  Shell.tsx  copy.ts
  tests/  unit/  e2e/  fixtures/
  scripts/  bench.ts  extract-icons.ts
  .github/workflows/ci.yml  deploy.yml
```

`src/core` imports nothing outside `src/core`. This is what makes the worker, the tests and any future WebAssembly swap easy.

---

### Task 1: Project scaffold, tooling, CI and budgets

**Files:**
- Create: `package.json`, `vite.config.ts`, `tsconfig.json`, `index.html`, `src/main.tsx`, `.github/workflows/ci.yml`, `.size-limit.json`, `playwright.config.ts`, `vitest.config.ts`, `eslint.config.js`, `tests/e2e/smoke.spec.ts`
- Move: `index.html`, `src/`, `build.mjs`, `package.json` (the old ones) → `legacy/` (so the prototype stays runnable and readable)
- Modify: `README.md`. (`CLAUDE.md` and `DEVELOPMENT.md` already describe the rebuild; `DEVELOPMENT-prototype.md` documents the old app.)

**Interfaces:**
- Produces: npm scripts `dev`, `build`, `test` (Vitest), `test:e2e` (Playwright), `size` (size-limit), `lint`, `typecheck`, `bench`. Every later task uses these names.

- [ ] **Step 1: Write the failing smoke test.** `tests/e2e/smoke.spec.ts::app boots` opens `/`, expects `document.title === 'Sketch3D'` and a visible `#app` with no console errors. Run on projects `chromium`, `webkit-ipad` (device `iPad Pro 11`), `chromebook` (viewport 1366×768, Chromium).
- [ ] **Step 2: Run `npm run test:e2e` and confirm it fails** (no app yet).
- [ ] **Step 3: Scaffold** with Vite + TypeScript strict + Preact (`@preact/preset-vite`). Add ESLint rule `no-restricted-imports` forbidding `three`, `preact` and DOM globals inside `src/core/**`. Configure `build.target: 'es2020'` and `build.rollupOptions` to emit a separate worker chunk.
- [ ] **Step 4: Add `size-limit`** with a 500 KB gzip limit on the main JS and worker JS combined.
- [ ] **Step 5: CI** (`ci.yml`): `npm ci`, `lint`, `typecheck`, `test`, `build`, `size`, `npx playwright install --with-deps chromium webkit`, `test:e2e`. Run `npm run test:e2e` and expect PASS.
- [ ] **Step 6: Move the prototype to `legacy/`,** update `README.md` for the new layout, and commit: `chore: scaffold Vite+TS app, CI, budgets; move prototype to legacy/`.

---

### Task 2: Document model, schema validation, migrations, history

**Files:**
- Create: `src/core/doc/types.ts`, `schema.ts`, `migrate.ts`, `history.ts`, `src/core/geom/vec.ts`
- Test: `tests/unit/doc.test.ts`, `tests/unit/history.test.ts`, `tests/unit/migrate.test.ts`, `tests/fixtures/legacy-v2.json` (a real project saved by the prototype)

**Interfaces:**
- Produces (types): `Vec2 = [number, number]`; `Part = { id: string; name: string; kind: PartKind; outline: Vec2[]; color: string; depthMm: number; round: number; z: number; blend: number; melt: boolean; cut: boolean; rot: { x: number; y: number; z: number }; taper: number; squash: number; profile?: SideProfile; twinOf?: string }`; `SideProfile = { front: number[]; back: number[] }` (64 samples each, normalised by half-depth, max 1.8); `Dab = { partId: string; type: 'push'|'pull'|'smooth'|'grab'; at: [number, number, number]; radius: number; strength: number }` (positions in the part's local space, so dabs follow the part); `Groove = { points: [number, number, number][]; radius: number; mirror: boolean }`; `Doc = { version: 3; parts: Part[]; dabs: Dab[]; grooves: Groove[]; settings: { symmetry: boolean; build: { w: 110; h: 110; d: 70 } } }`.
- Produces (functions): `createDoc(): Doc`; `validateDoc(input: unknown): Doc` (throws `DocError` with a kid-safe message); `migrate(input: unknown): Doc` (accepts the prototype's `sketch3d.v2` object and any older Doc version); `class History { constructor(initial: Doc, max = 100); push(doc: Doc, label: string): void; undo(): Doc | null; redo(): Doc | null; readonly canUndo: boolean; readonly canRedo: boolean }`.

- [ ] **Step 1: Write failing tests.**
  - `migrate converts the prototype save`: `migrate(legacyV2).parts.length === 6` and each part has `depthMm` equal to the old `depth`.
  - `migrate attaches legacy sculpt dabs to the nearest part and stores them part-local`.
  - `validateDoc rejects NaN and out-of-range values with a DocError whose message has no jargon`.
  - `history: push after undo drops the redo branch`; `history caps at 100 entries`; `history snapshots are not aliased` (mutating a returned Doc does not change stored states).
- [ ] **Step 2: Run `npx vitest run tests/unit/doc.test.ts tests/unit/history.test.ts tests/unit/migrate.test.ts`.** Expected: FAIL (modules missing).
- [ ] **Step 3: Implement** the types and functions above. Approach: validation with hand-written guards (no schema library); history stores `structuredClone` snapshots (the document is small, so this is simpler than patches).
- [ ] **Step 4: Run the same tests.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat(core): document model, validation, legacy migration, history`.

---

### Task 3: Outline geometry: shapes, stroke smoothing, repair

**Files:**
- Create: `src/core/geom/outline.ts`, `src/core/geom/shapes.ts`, `src/core/geom/bounds.ts`
- Test: `tests/unit/outline.test.ts`, `tests/unit/shapes.test.ts`

**Interfaces:**
- Consumes: `Vec2` from Task 2.
- Produces: `smoothStroke(raw: Vec2[]): Vec2[] | null` (closes, de-noises, resamples; `null` if unusable); `repairOutline(pts: Vec2[]): Vec2[] | null` (untwists self-intersections, returns `null` if area under 4 mm²); `resampleClosed(pts: Vec2[], n: number): Vec2[]`; `signedArea(pts: Vec2[]): number`; `bbox(pts: Vec2[]): { x0: number; y0: number; x1: number; y1: number; w: number; h: number; cx: number; cy: number }`; `SHAPES: Record<'circle'|'box'|'star'|'heart'|'egg'|'capsule'|'triangle'|'drop'|'moon', (x0: number, y0: number, x1: number, y1: number) => Vec2[]>`; `defaultThickness(kind: PartKind, outline: Vec2[]): { depthMm: number; round: number }`.

- [ ] **Step 1: Write failing tests.**
  - `circle default is a sphere`: `defaultThickness('circle', SHAPES.circle(0,0,30,30))` returns `{ depthMm: 30, round: 1 }`.
  - `other shapes default to 0.7 of the narrowest side, clamped to 12–60 mm`.
  - **Review Focus 1:** `smoothStroke([])`, `smoothStroke` of 2 points, and a 100-point stroke with all points identical all return `null`; a figure-eight stroke returns a non-null outline whose `signedArea` is non-zero and has no self-intersections; a 1 mm² loop makes `repairOutline` return `null`.
  - `every SHAPES entry is closed, has at least 16 points, positive area, and fits its bounding box`.
- [ ] **Step 2: Run `npx vitest run tests/unit/outline.test.ts tests/unit/shapes.test.ts`.** Expected: FAIL.
- [ ] **Step 3: Implement.** Port the *behaviour* of the prototype's `smoothStroke`, `repairOutline`, `dedupeE`, `resample2` and `SHAPES` from `legacy/src/part3.js`, `fix.js` and `part2.js` into typed, tested functions; use a sweep-line or O(n²) segment test (n is small) for self-intersection.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat(core): outline smoothing, repair and shape library with tests`.

---

### Task 4: Part SDF (a signed distance function for one part)

**Files:**
- Create: `src/core/geom/profile.ts`, `src/core/geom/sdf.ts`
- Test: `tests/unit/sdf-part.test.ts`

**Interfaces:**
- Consumes: `Part`, `SideProfile`, `Vec2`.
- Produces: `buildPartField(part: Part): PartField` where `PartField = { bounds: Box3; distance(x: number, y: number, z: number): number }` (negative inside, millimetres, world space, honours `rot`, `taper`, `squash`, `round`, `depthMm`, `z` and `profile`); `profileFromLoop(loop: Vec2[], depthMm: number): SideProfile`; `profileAt(p: SideProfile, y01: number): { front: number; back: number }`; `type Box3 = { min: [number, number, number]; max: [number, number, number] }`.

- [ ] **Step 1: Write failing tests.**
  - `a circle part with depth equal to its width is a sphere`: for a 30 mm circle, `distance(0,0,0) ≈ -15` and `distance(15,0,0) ≈ 0` within 0.05 mm.
  - `round = 0.04 keeps near-square edges; round = 1 gives a pill` (compare a corner point).
  - `thickness change moves the z extent`: `bounds.max[2] - bounds.min[2] === depthMm` within 0.01.
  - `rotation by 90° about z swaps width and height of bounds`.
  - `distance is continuous`: sampled gradient magnitude along a line stays within 0.5–1.5 (no jumps).
  - `profile clamps to 1.8 × half depth`.
- [ ] **Step 2: Run `npx vitest run tests/unit/sdf-part.test.ts`.** Expected: FAIL.
- [ ] **Step 3: Implement.** Approach: 2D signed distance to the polygon (exact, via nearest segment + winding), extruded with a rounded-extrusion formula; the side profile scales the z-extent per y; transforms are applied by inverse-transforming the sample point. Keep it allocation-free inside `distance` (it is the hot path).
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat(core): per-part signed distance field with profile, rotation, taper`.

---

### Task 5: Scene SDF: blending, cut-aways, mirror twins, sculpt dabs, grooves

**Files:**
- Create: `src/core/geom/scene.ts`
- Test: `tests/unit/scene.test.ts`

**Interfaces:**
- Consumes: `Doc`, `buildPartField`.
- Produces: `buildSceneField(doc: Doc, opts?: { onlyParts?: ReadonlySet<string> }): SceneField` where `SceneField = { bounds: Box3; sample(x: number, y: number, z: number): number; partAt(x: number, y: number, z: number): number }` (`partAt` returns the index of the nearest non-cut part, used for per-part colour and picking). Smooth union uses a polynomial smooth-min with radius `part.blend` when `melt` is true, and a hard min otherwise; `cut` parts subtract; `twinOf` parts are the mirrored copy of another part across x = 0 when `settings.symmetry` is on.

- [ ] **Step 1: Write failing tests.**
  - `two overlapping spheres with melt on produce a smaller field value at the seam than with melt off`.
  - `a cut part removes material`: a sample inside both a body and a cut hole is positive (outside).
  - `a cut-away part removes only what it overlaps` (parts outside the cut are untouched).
  - `mirror twin: sample(x,y,z) equals sample(-x,y,z) for a symmetric doc`.
  - `a push dab at a local point moves the surface outward; moving the part moves the dab with it` (dabs are stored part-local).
  - `an empty doc returns +Infinity everywhere, and bounds are empty` (needed by Task 14).
- [ ] **Step 2: Run `npx vitest run tests/unit/scene.test.ts`.** Expected: FAIL.
- [ ] **Step 3: Implement** `buildSceneField`, with dabs and grooves evaluated only inside their influence radius (cheap rejection by bounding sphere first).
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat(core): scene SDF with melt, cuts, mirror and sculpt`.

---

### Task 6: Surface-nets mesher with chunking

**Files:**
- Create: `src/core/geom/surfaceNets.ts`
- Test: `tests/unit/surfaceNets.test.ts`

**Interfaces:**
- Consumes: `SceneField`.
- Produces: `meshField(field: SceneField, opts: { voxelMm: number; region?: Box3 }): MeshData` where `MeshData = { positions: Float32Array; normals: Float32Array; indices: Uint32Array; partIds: Uint16Array }` (one part index per vertex, from `partAt`); `chunkGrid(bounds: Box3, chunkVoxels: number, voxelMm: number): ChunkKey[]`; `meshChunk(field: SceneField, key: ChunkKey, voxelMm: number): MeshData`; `mergeMeshes(chunks: MeshData[]): MeshData`.

- [ ] **Step 1: Write failing tests.**
  - `sphere mesh is watertight`: every edge is shared by exactly two triangles (write an `edgeManifold(mesh)` test helper).
  - `sphere vertices lie within one voxel of the true surface`.
  - `normals point outward and are unit length`.
  - `merging chunk meshes gives the same triangle count as meshing the whole field` (seams match, no cracks).
  - `a finer voxelMm gives more triangles and a smaller maximum error`.
  - `an empty field returns an empty mesh and does not throw`.
- [ ] **Step 2: Run `npx vitest run tests/unit/surfaceNets.test.ts`.** Expected: FAIL.
- [ ] **Step 3: Implement naive surface nets** (one vertex per sign-changing cell, placed at the average of edge crossings, quads split into triangles, normals from the field gradient). Chunks overlap by one cell so seams line up. Typed arrays only; preallocate and reuse buffers between calls.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat(core): chunked surface-nets mesher`.

---

### Task 7: Mesher worker, scheduler and performance benchmark

**Files:**
- Create: `src/worker/protocol.ts`, `src/worker/mesher.worker.ts`, `src/worker/scheduler.ts`, `src/app/perfTier.ts`, `scripts/bench.ts`
- Test: `tests/unit/scheduler.test.ts`, `tests/e2e/worker.spec.ts`

**Interfaces:**
- Consumes: `buildSceneField`, `meshField`, `Doc`.
- Produces: `type MesherRequest = { jobId: number; doc: Doc; voxelMm: number; quality: 'draft' | 'final' }`; `type MesherResponse = { jobId: number; mesh: MeshData; ms: number }` (buffers are transferred, not copied); `class MeshScheduler { constructor(workerFactory: () => Worker | FakeWorker, tier: PerfTier); request(doc: Doc, quality: 'draft' | 'final'): void; onMesh(cb: (mesh: MeshData, quality: 'draft' | 'final') => void): void; dispose(): void }`; `type PerfTier = 'low' | 'mid' | 'high'`; `detectTier(): Promise<PerfTier>` (runs a 50 ms SDF micro-benchmark, uses `navigator.hardwareConcurrency` and, where present, `navigator.deviceMemory` as hints, never as the only signal); `voxelFor(tier: PerfTier, quality: 'draft' | 'final'): number`.
- Note: do **not** use `SharedArrayBuffer`. It needs cross-origin-isolation headers, which GitHub Pages cannot send.

- [ ] **Step 1: Write failing tests (with a fake worker).**
  - **Review Focus 3:** `latest edit wins`: send requests 1, 2, 3, then deliver results in the order 3, 1, 2; `onMesh` is called once, with job 3's mesh, and later results are discarded.
  - `a draft in flight is cancelled by a newer request` (at most one job running, one queued).
  - `a final request is issued only after 150 ms with no new edits` (fake timers).
  - `dispose terminates the worker and ignores late results`.
  - `voxelFor returns coarser values for the low tier and for 'draft'`.
- [ ] **Step 2: Run `npx vitest run tests/unit/scheduler.test.ts`.** Expected: FAIL.
- [ ] **Step 3: Implement** the worker, scheduler and tier detection. Approach: the scheduler keeps `latestJobId`, runs one job at a time, and drops stale responses by id.
- [ ] **Step 4: Write `scripts/bench.ts`** that meshes three fixtures (a 6-part character, a 20-part stress doc, a sculpt-heavy doc) at each tier and prints ms per mesh. Add a budget file `bench.budget.json`: draft mesh under 40 ms and final under 400 ms on the `mid` tier under 4x CPU throttle. Run `npm run bench`; record results in `docs/perf-baseline.md`.
- [ ] **Step 5: Decision gate.** If the budget is missed on `low`, stop and write a short note (in `docs/perf-baseline.md`) proposing one of: a coarser grid, per-chunk dirty re-meshing, or moving the field evaluation to WebAssembly. Nathan approves before the plan continues.
- [ ] **Step 6: Commit:** `feat: mesher worker, scheduler with latest-wins, tier detection, benchmark`.

---

### Task 8: 3D renderer, camera and on-demand rendering

**Files:**
- Create: `src/render/viewport.ts`, `camera.ts`, `materials.ts`
- Test: `tests/unit/camera.test.ts`, `tests/e2e/render.spec.ts`

**Interfaces:**
- Consumes: `MeshData`, `Doc`.
- Produces: `class Viewport { constructor(canvas: HTMLCanvasElement); setMesh(mesh: MeshData, colors: string[]): void; setGhost(mesh: MeshData | null): void; requestRender(): void; resize(): void; setCameraPreset(name: 'front' | 'side' | 'top' | 'home'): void; onContextLost(cb: () => void): void; dispose(): void }`; orbit camera with `orbit(dx: number, dy: number)`, `pan(dx: number, dy: number)`, `zoom(factor: number)`, pointer-driven (one finger orbits, two fingers pan and pinch); `maxPixelRatio = 2`.

- [ ] **Step 1: Write failing tests.**
  - `camera.zoom clamps to the min and max distance`.
  - `camera.orbit clamps elevation so the model never flips`.
  - `requestRender coalesces many calls into one frame` (spy on `requestAnimationFrame`).
  - e2e: `the canvas renders a non-blank frame for the preset character` (read pixels; not all one colour) on `chromium` and `webkit-ipad`.
  - e2e: `after a simulated WebGL context loss, the app shows "The 3D view stopped. Tap to restart it." and restores on tap`.
- [ ] **Step 2: Run the unit tests and e2e.** Expected: FAIL.
- [ ] **Step 3: Implement** with three.js named imports only (`WebGLRenderer`, `Scene`, `PerspectiveCamera`, `BufferGeometry`, `MeshStandardMaterial`, etc.), vertex colours from `partIds`, one directional light plus ambient, antialiasing off on the `low` tier, `setPixelRatio(Math.min(devicePixelRatio, 2))`, and no render loop outside `requestRender`.
- [ ] **Step 4: Run tests.** Expected: PASS. Run `npm run size` and confirm the bundle is under budget; record the three.js cost in `docs/perf-baseline.md`.
- [ ] **Step 5: Commit:** `feat(render): on-demand three.js viewport, orbit camera, context-loss recovery`.

---

### Task 9: Design system, app shell, state and commands

**Files:**
- Create: `src/ui/tokens.css`, `src/ui/copy.ts`, `src/ui/components/{Button,IconButton,Slider,Segmented,Toast,Panel,Sheet}.tsx`, `src/ui/Shell.tsx`, `src/app/state.ts`, `src/app/commands.ts`, `scripts/extract-icons.ts`, `public/icons/*.webp`
- Test: `tests/unit/commands.test.ts`, `tests/e2e/shell.spec.ts`

**Interfaces:**
- Consumes: `Doc`, `History`.
- Produces: signals `doc`, `selection` (`Set<string>`), `tool`, `view` (`'front'|'side'|'3d'`), `toasts`; `commit(label: string, mutate: (draft: Doc) => void): void` (clones, mutates, validates, pushes history, requests a re-mesh); `undo(): void`; `redo(): void`; `select(ids: string[], additive?: boolean): void`; `copy: Record<string, string>` (all user-facing strings in one file, for the reading-level pass in Task 15).

- [ ] **Step 1: Write failing tests.**
  - `commit then undo restores the previous doc and selection`.
  - `commit with an invalid mutation is rejected, shows a toast and leaves the doc unchanged`.
  - `select additive toggles membership`.
  - e2e: `Undo and Redo buttons are visible at all five test viewports and are at least 48×48 px` (also assert the Undo button's box lies inside the viewport).
  - e2e: `every button and slider thumb on the shell is at least 48 px in its smaller dimension`.
- [ ] **Step 2: Run `npx vitest run tests/unit/commands.test.ts` and `npx playwright test tests/e2e/shell.spec.ts`.** Expected: FAIL.
- [ ] **Step 3: Implement** the tokens (colour, spacing on a 4 px scale, radius, type scale, motion durations that collapse to 0 under `prefers-reduced-motion`), the components, and the layout. **Layout:** at ≥1100 px wide, a left tool rail, the Front/Side drawing view and the 3D view side by side, and an inspector on the right; below that (or in portrait) a single viewport with a large "Draw / 3D" switch and the inspector as a bottom sheet. Undo/Redo live in the bottom-left of the drawing view (this fixed a real cut-off bug on tablets in the prototype). `scripts/extract-icons.ts` unpacks the base64 icon set from `legacy/src/skin.js` into `public/icons/*.webp` (Nathan's artwork: keep names, do not redraw).
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat(ui): design tokens, components, responsive shell, command bus`.

---

### Task 10: Front and Side drawing views, drawing tools, touch handling

**Files:**
- Create: `src/views2d/canvas.ts`, `viewTransform.ts`, `front.ts`, `side.ts`, `tools/{draw,shape,select,reshape,size,turn,limb,eyes,smile,crease,hole,slot}.ts`
- Test: `tests/unit/viewTransform.test.ts`, `tests/unit/gestures.test.ts`, `tests/e2e/drawing.spec.ts`

**Interfaces:**
- Consumes: `commit`, `selection`, `smoothStroke`, `repairOutline`, `SHAPES`, `defaultThickness`, `profileFromLoop`.
- Produces: `class ViewTransform { constructor(); worldToScreen(p: Vec2): Vec2; screenToWorld(p: Vec2): Vec2; zoomAt(screen: Vec2, factor: number): void; pan(dx: number, dy: number): void; fit(box: BBox, w: number, h: number): void }`; `interface Tool { id: string; onPointerDown(e: ToolPointer): void; onPointerMove(e: ToolPointer): void; onPointerUp(e: ToolPointer): void; cancel(): void; hint: string }`; `class GestureRecogniser { feed(e: PointerEvent): 'stroke' | 'pinch' | 'pan' | 'none' }`; Front view maps screen (x, y) to world (x, y); **Side view maps screen (x, y) to world (z, y)**, so editing in either view changes the same part the 3D view shows. The Tail/arm tool works in both views and never changes the current view.
- Also draw the real-shape ghost (pink outline of each part's true 3D silhouette, from the current mesh) so the 2D outlines never disagree with the 3D result. This fixes the prototype's known limitation that outlines ignore part rotation.

- [ ] **Step 1: Write failing tests.**
  - `screenToWorld inverts worldToScreen` (property test, 100 random points).
  - `zoomAt keeps the point under the finger fixed`.
  - **Review Focus 5:** `a second finger landing during a stroke cancels the stroke without committing it, and starts a pinch`; `a pen stroke ignores simultaneous touch pointers (palm rejection)`; `a stroke shorter than 6 px is treated as a tap, not a shape`.
  - e2e on `webkit-ipad`: `the page never scrolls or zooms` (`visualViewport.scale === 1` after a two-finger pinch on the canvas, `document.scrollingElement.scrollTop === 0` after a drag); `drawing a loop with the Draw tool creates one part and selects it`; `Tail/arm in Side view creates a part and the view stays Side`; `Review Focus 1: a scribble creates no part and shows the grade-3 message`.
  - e2e: `moving a part in Side view changes its z, and the 3D mesh updates` (compare the mesh bounds before and after).
- [ ] **Step 2: Run the unit tests and `npx playwright test tests/e2e/drawing.spec.ts`.** Expected: FAIL.
- [ ] **Step 3: Implement.** Set in `index.html`: `<meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1, user-scalable=no, viewport-fit=cover">`; in CSS: `touch-action: none; overscroll-behavior: none; -webkit-touch-callout: none; user-select: none` on canvases. Use `setPointerCapture`, and `pointercancel` always cancels the active tool.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat(views2d): front/side drawing views, tools, touch gestures, true-shape ghost`.

---

### Task 11: Inspector panel, layers and multi-select

**Files:**
- Create: `src/ui/panels/{Inspector,Layers,Colour}.tsx`
- Test: `tests/e2e/inspector.spec.ts`, `tests/unit/multiselect.test.ts`

**Interfaces:**
- Consumes: `commit`, `selection`.
- Produces: the controls for **How round?** (Square / Soft / Round / Pill = 0.04 / 0.4 / 0.8 / 1), **How thick?** (a **slider**, 2–80 mm, live value in mm), **Melt into touching parts** (with A little / Some / A lot = blend 3 / 8 / 15), **Turn** (spin, turn, tilt sliders and Reset turn), **Squash and stretch**, **Colour**, and a layers list. `applyToSelection(ids: string[], patch: Partial<Part>): void`. When several parts are selected the inspector edits all of them (this fixes the prototype, which edited only the first). Mixed values show as "Mixed" and a drag sets all.

- [ ] **Step 1: Write failing tests.**
  - `applyToSelection changes every selected part in one history step` (one undo reverts all).
  - `Shift-click or the Multi button toggles selection; selecting nothing hides the inspector`.
  - e2e: `dragging the thickness slider updates the 3D mesh live (draft quality) and commits a single history step on release`.
  - e2e: `a new circle part is a sphere and the slider reads its diameter`.
- [ ] **Step 2: Run the tests.** Expected: FAIL.
- [ ] **Step 3: Implement** the panels. Live changes during a drag call `scheduler.request(doc, 'draft')` without touching history; release commits once.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat(ui): inspector with sliders, layers, multi-select editing`.

---

### Task 12: 3D editing: picking, gizmo, sculpt, paint

**Files:**
- Create: `src/render/picking.ts`, `src/render/gizmo.ts`, `src/views2d/tools/sculpt.ts`, `src/views2d/tools/paint.ts`
- Test: `tests/unit/picking.test.ts`, `tests/unit/gizmo.test.ts`, `tests/e2e/edit3d.spec.ts`

**Interfaces:**
- Consumes: `Viewport`, `MeshData.partIds`, `commit`.
- Produces: `pickPart(mesh: MeshData, ray: Ray): { partIndex: number; point: [number, number, number] } | null` (ray against the mesh, cheap broad-phase on per-chunk boxes); `class Gizmo { constructor(viewport: Viewport); attach(part: Part): void; detach(): void; onChange(cb: (patch: Partial<Part>, final: boolean) => void): void }` with three handles: **arrows** (move along an axis), **rings** (turn around an axis, using angle on the axis plane), and one **cube** (resize uniformly, by screen-distance ratio). The gizmo appears automatically when one part is selected (move is the default), is hidden in sculpt mode and for multi-selection, and its handles are at least 48 px to hit. Sculpt tools (Push, Pull, Smooth, Grab) add a `Dab` in part-local space; Paint colours the part under the finger; Fill colours a whole part.

- [ ] **Step 1: Write failing tests.**
  - `pickPart returns the front-most part for a ray through two overlapping parts`.
  - `gizmo ring drag of 90° on the y ring sets rot.y to 90 ± 0.5`.
  - `gizmo cube drag scales depth, width and height by the same factor`.
  - `a dab placed after moving a part still lands on the same spot of the part` (local space).
  - e2e: `tapping a part in 3D selects it and shows the gizmo with Move active`; `Sculpt mode hides the gizmo`.
- [ ] **Step 2: Run the tests.** Expected: FAIL.
- [ ] **Step 3: Implement.** Gizmo handles are three.js objects in a separate overlay scene rendered with depth test off, so they never get hidden inside the model.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat(3d): picking, move/turn/resize gizmo, sculpt and paint`.

---

### Task 13: Storage: autosave, "My toys", project files

**Files:**
- Create: `src/storage/db.ts`, `autosave.ts`, `projectFile.ts`, `src/ui/panels/MyToys.tsx`
- Test: `tests/unit/autosave.test.ts`, `tests/e2e/storage.spec.ts`

**Interfaces:**
- Consumes: `Doc`, `validateDoc`, `migrate`.
- Produces: `saveProject(id: string, doc: Doc, thumb: Blob): Promise<SaveResult>` where `SaveResult = { ok: true } | { ok: false; reason: 'blocked' | 'quota' | 'unknown' }`; `loadProject(id: string): Promise<Doc | null>`; `listProjects(): Promise<ProjectMeta[]>`; `class Autosave { constructor(save: SaveFn, delayMs = 500); notify(doc: Doc): void; flush(): Promise<void>; readonly status: Signal<'saved' | 'saving' | 'not-saved'> }`; `exportProjectFile(doc: Doc): Blob` and `importProjectFile(file: File): Promise<Doc>` (`.sketch3d.json`, so students can move work between devices via Files or a shared drive); `requestPersistence(): Promise<boolean>` (`navigator.storage.persist()`). Also writes on `visibilitychange` and `pagehide`.

- [ ] **Step 1: Write failing tests.**
  - **Review Focus 4:** `when IndexedDB is blocked, status becomes 'not-saved', the app keeps working and a toast says "Your work can't be saved on this device. Tap Save to keep a copy."`; `a quota error keeps the previous save intact`; `a crash between the two writes of a save (simulated) leaves the last good project loadable` (write the new copy first, then switch a pointer).
  - `autosave debounces 10 edits within 500 ms into one write`; `flush writes immediately and resolves after the write`.
  - `importProjectFile rejects a file that is not a Sketch3D project with "That file isn't a Sketch3D toy."`.
  - e2e: `reload restores the last doc, selection cleared, camera reset`; `legacy localStorage 'sketch3d.v2' is imported once and then marked done`.
- [ ] **Step 2: Run the tests.** Expected: FAIL.
- [ ] **Step 3: Implement** with `idb-keyval` (one store for project JSON, one for thumbnails). Never throw out of `Autosave`; report through `status`.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat(storage): resilient autosave, My toys, project files, legacy import`.

---

### Task 14: Save to print: STL export and print check

**Files:**
- Create: `src/core/print/stl.ts`, `src/core/print/check.ts`, `src/ui/panels/PrintSheet.tsx`
- Test: `tests/unit/stl.test.ts`, `tests/unit/printcheck.test.ts`, `tests/e2e/print.spec.ts`

**Interfaces:**
- Consumes: `buildSceneField`, `meshField`, `MeshData`, `Doc`.
- Produces: `writeBinaryStl(mesh: MeshData, opts?: { name?: string }): ArrayBuffer`; `checkPrintable(doc: Doc, mesh: MeshData): PrintReport` where `PrintReport = { ok: boolean; issues: PrintIssue[] }` and `PrintIssue = { code: 'empty' | 'only-cuts' | 'too-big' | 'too-thin' | 'floating' | 'not-watertight'; message: string; fix: string; partIds?: string[] }` (messages and fixes are grade-3 wording from `copy.ts`); `prepareForPrint(doc: Doc, opts: { flatBase: boolean }): MeshData` (final-quality mesh, centred on the build plate, optionally with a flat base cut at 1.5 mm so round shapes don't roll); `downloadStl(buf: ArrayBuffer, filename: string): Promise<void>` (uses an `<a download>` Blob link; on iPad Chrome verify it reaches the Files app and fall back to the Web Share API when download is not honoured).

- [ ] **Step 1: Write failing tests.**
  - `writeBinaryStl has an 80-byte header, a uint32 triangle count and 50 bytes per triangle` (length `84 + 50n`); coordinates round-trip within 1e-5.
  - **Review Focus 2:** `empty doc → issue 'empty'`, `doc with only a cut part → 'only-cuts'`, `a model larger than 110×110×70 → 'too-big'` (the fix text suggests "Make it smaller" and the report never silently scales), `a 1 mm-thick part → 'too-thin'` (minimum 2 mm), `two separate, non-touching parts → 'floating'` with both part ids, and `checkPrintable never returns ok:true for any of these`.
  - `a normal character is ok:true and edge-manifold` (use the shared `edgeManifold` helper).
  - `flatBase removes the lowest 1.5 mm and gives a flat bottom face; the sphere still fits the build area`.
  - e2e: `Save to print shows the issue list with a fix button for each issue, and never downloads when ok is false`; `Save to print on a good model downloads a .stl whose size matches 84 + 50 × triangles`.
- [ ] **Step 2: Run the tests.** Expected: FAIL.
- [ ] **Step 3: Implement.** Floating-part detection: connected components of the mesh; the smallest must be reported. Thin-wall check: sample field values along gradients, flag regions with thickness under 2 mm.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat(print): binary STL, print check with plain-language fixes, flat base`.

---

### Task 15: Presets, first-run help and the reading-level pass

**Files:**
- Create: `src/core/doc/presets.ts`, `src/ui/panels/{Presets,FirstRun,Hints}.tsx`
- Modify: `src/ui/copy.ts`
- Test: `tests/unit/presets.test.ts`, `tests/unit/copy.test.ts`, `tests/e2e/firstrun.spec.ts`

**Interfaces:**
- Produces: `PRESETS: { id: string; name: string; make(): Doc }[]` (blank plus the prototype's ready-made bodies, ported from `legacy/src/presets.js`); a 3-step first-run guide ("Draw a shape", "Pull it and turn it", "Save to print") shown once, replayable from Help; a one-time gizmo tip ("Drag an arrow to move, a ring to turn, the white cube to resize").

- [ ] **Step 1: Write failing tests.**
  - `every preset validates and is printable` (passes `checkPrintable`).
  - `copy.test: every string in copy.ts is sentence case, under 90 characters, and scores grade 5 or lower on a Flesch–Kincaid check; button labels start with a verb` (implement the scorer in the test; it is a small function).
  - `copy.test: no string contains the banned words: extrude, SDF, mesh, vertex, boolean, parametric, manifold`.
  - e2e: `first run shows the guide; after finishing it, a reload does not show it again`.
- [ ] **Step 2: Run the tests.** Expected: FAIL.
- [ ] **Step 3: Implement** the presets (ported by behaviour), the guide and the hint system.
- [ ] **Step 4: Run the tests.** Expected: PASS.
- [ ] **Step 5: Commit:** `feat: presets, first-run guide, reading-level checks`.

---

### Task 16: Offline, release, deploy and real-device sign-off

**Files:**
- Create: `public/manifest.webmanifest`, `src/sw.ts` (via `vite-plugin-pwa`), `.github/workflows/deploy.yml`, `docs/release-checklist.md`
- Modify: `vite.config.ts`, `README.md`
- Test: `tests/e2e/offline.spec.ts`

**Interfaces:**
- Produces: a precaching service worker with an "Update ready. Tap to restart." prompt; a feature-detected offline path; a deploy workflow that publishes `dist/` to GitHub Pages on `main` after all checks pass; `docs/release-checklist.md` listing the real-device checks below.
- **Caveat to verify, not assume:** service workers are reported not to register in third-party iOS browsers such as Chrome (they run on WKWebView; see Sources). On an iPad in Chrome, offline use may therefore not work. The app must detect this (`'serviceWorker' in navigator` plus a registration promise that rejects), carry on normally, and use long-lived HTTP cache headers plus a small bundle so a second visit is fast even if the network is flaky. Record the real result in `docs/release-checklist.md`.

- [ ] **Step 1: Write failing tests.**
  - e2e (Chromium): `after one visit, going offline and reloading still loads the app and the last toy`.
  - e2e (`webkit-ipad`): `when service workers are unavailable the app still loads and shows no error`.
  - `deploy.yml` is not tested; instead add a CI step that fails if `dist/` is over the size budget.
- [ ] **Step 2: Run `npx playwright test tests/e2e/offline.spec.ts`.** Expected: FAIL.
- [ ] **Step 3: Implement** with `vite-plugin-pwa` (`registerType: 'prompt'`, precache everything in `dist/`, `navigateFallback: 'index.html'`). Add the manifest with the Sketch3D icon set.
- [ ] **Step 4: Write `docs/release-checklist.md`** and run it on real hardware before each release:
  - A real low-end Chromebook (4 GB): draw, melt, sculpt for 10 minutes with no jank; Save to print; check the file in a slicer.
  - A real iPad in Chrome: no page zoom or scroll, Apple Pencil and finger both work, the STL reaches Files, the offline behaviour is noted.
  - The school network: the host is reachable (ask IT to allow it if not).
  - Memory: 10 minutes of editing and the tab survives without a reload.
- [ ] **Step 5: Run the full pipeline** (`lint`, `typecheck`, `test`, `build`, `size`, `test:e2e`, `bench`) and expect all green; merge, let `deploy.yml` publish, then walk through the checklist on the live URL.
- [ ] **Step 6: Commit:** `feat: offline support, deploy workflow, real-device release checklist`.

---

## Self-Review

**Spec coverage.** Each feature in `CLAUDE.md` "Core features to preserve" has an owning task:
- Front/Side/3D agree → Tasks 6, 8, 10 (ghost outline, shared mesh).
- Draw outlines and shapes → Tasks 3, 10.
- Tail/arm in both views → Task 10.
- Reshape, size, turn, thickness slider, roundness → Tasks 10, 11.
- Melt → Tasks 5, 11.
- Cut away (hole/slot) → Tasks 5, 10.
- Eyes, smile, crease → Tasks 5 (grooves), 10.
- Sculpt and paint → Tasks 5, 12.
- Multi-select → Task 11.
- 3D gizmo → Task 12.
- Presets → Task 15.
- Save to print within 110 × 110 × 70 mm → Task 14.
Constraints (bundle, fps, targets, DPR, wording, no network) are enforced in Tasks 1, 7, 9 and 15. The prototype's known limitations (outline vs rotation, single-part inspector, uniform-only resize, dabs bound to whatever part is nearest) are resolved in Tasks 10, 11 and 5, with uniform-only resize kept as a documented, intentional simplification.

**Step scan.** Every code step names the signature and the file; bodies appear nowhere because the signatures and tests determine them.

**Type consistency.** `Doc`, `Part`, `Dab`, `MeshData`, `SceneField`, `PerfTier`, `PrintReport` are defined once (Tasks 2, 5, 6, 7, 14) and consumed under the same names.

**Review Focus.** All five items have tests in Tasks 3, 7, 10, 13 and 14.

**Proportion.** Signatures and test names only; no function bodies.

## Open decisions for Nathan

1. **Meshing approach:** Task 7's benchmark decides whether plain TypeScript is fast enough or WebAssembly is needed. Decide at the Task 7 gate.
2. **Flat base option:** included in Task 14 because round prints roll off the bed; confirm you want it on by default.
3. **Offline on iPad in Chrome:** may not work (see Task 16). Decide whether that matters for your classrooms; if it does, the fallback is to run the app in Safari, which supports service workers and Add to Home Screen.

## Sources

- [Bug 206741: WKWebView support for Service Workers (WebKit)](https://bugs.webkit.org/show_bug.cgi?id=206741)
- [Service worker registration fails on iOS Chrome or Edge (Apple Developer Forums)](https://developer.apple.com/forums/thread/126923)
- [PWA iOS limitations and Safari support (MagicBell)](https://www.magicbell.com/blog/pwa-ios-limitations-safari-support-complete-guide)
