# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

# Sketch3D

Sketch3D is a free web app where kids (about ages 9–11, many neurodiverse, easily frustrated) draw shapes, turn them into smooth 3D parts, join parts into a character, and save an STL file to 3D print.

**Owner:** Nathan, an education support worker. He does not write code. Explain decisions in plain language and keep summaries short.

## Where things are
- The plan to follow: `docs/superpowers/plans/2026-11-04-sketch3d-rebuild.md`. Work through its tasks in order, one task per branch or PR.
- How the code is organised, commands, data model, testing: `DEVELOPMENT.md`.
- The old prototype (behaviour reference only, do not copy its structure): `legacy/`, and `DEVELOPMENT-prototype.md` describes it.

## Commands
Node 22+. The full "done" gate is under "How to work" below; `DEVELOPMENT.md` has the rest.
- One unit test file: `npx vitest run tests/unit/history.test.ts`. One test by name: `npx vitest run -t "part of the name"`. Unit tests run in Node (no DOM), so anything under `src/core` must be testable there.
- One e2e file on one browser: `npx playwright test tests/e2e/drawing.spec.ts --project=chromium`. Projects are `chromium`, `webkit-ipad` and `chromebook` (1366×768, throttled). First time: `npx playwright install --with-deps chromium webkit`.
- Playwright starts two servers itself: the dev server on 4173 (most specs) and a built `vite preview` on 4174 under `/sketch3d/` (only `offline.spec.ts`, since only the built app has a service worker).
- `npm run bench` times the mesher against `bench.budget.json`. In CI it warns but never blocks.

## Architecture (the parts that span several files)
- **One store, one way in.** `src/app/state.ts` holds all app state as signals. Every change to the document goes through `commit(label, mutate)`, which validates, records undo history (`src/core/doc/history.ts`) and triggers a re-mesh. Do not mutate `doc` anywhere else, or undo and autosave will miss it.
- **Document to screen.** `Doc` (plain data in `src/core/doc`) → `buildSceneField` (`src/core/geom/scene.ts`, combines per-part SDFs) → surface-nets mesher in a Web Worker (`src/worker/`, latest request wins, draft grid while dragging, final grid after) → `src/app/mesher.ts` puts the result in the `latestMesh` signal → `src/render/viewport.ts` draws it on demand.
- **Front and Side views are not three.js.** They are Canvas 2D (`src/views2d/`), driven by Pointer Events. Tools are split across `toolKit.ts`, `drawTools.ts` and `editTools.ts`. 3D picking, gizmo and sculpt/paint live in `src/render/` and `src/app/edit3d.ts`.
- **Persistence.** `src/storage/` autosaves to IndexedDB (`idb-keyval`) and reads/writes project files. `migrate()` in `src/core/doc/migrate.ts` must be extended whenever the `Doc` shape changes (bump `version`); `tests/fixtures/legacy-v2.json` is a real prototype save used to check it.
- **STL import** builds a signed-distance grid in `importStl.worker.ts` using `src/core/mesh/`, so imported shapes behave like any other part.
- **Dev-only test hook.** In dev builds `window.__sketch3d` exposes the store and mesh to Playwright (typed in `tests/e2e/api.d.ts`, set in `src/main.tsx`). The `dev/` folder holds small standalone pages (worker and render harnesses) that specs load directly.
- **Copy.** Every user-facing string comes from `src/ui/copy.ts`; `tests/unit/copy.test.ts` checks its reading level (Flesch–Kincaid), so add new text there rather than inline and keep it simple.

## Current status
The rebuild is feature-complete (plan Tasks 1–16) and waits on real-device checks (`docs/release-checklist.md`). Merging to `main` deploys to GitHub Pages and replaces the prototype, so do not merge without Nathan's OK. `docs/overnight-notes.md` has the latest hand-off notes.

## Hard constraints
- **Devices:** low-end school Chromebooks (4 GB RAM, weak GPU) in Chrome, and iPads in Chrome. **Chrome on iOS runs on Apple's WebKit engine**, so build and test for Safari behaviour. Touch-first; mouse and trackpad must also work.
- **Budgets:** JS under 500 KB gzipped (the build fails past that). 30 fps or better while dragging, sculpting and rotating, and no single frame task over 50 ms. Render on demand, not in a constant loop. Cap `devicePixelRatio` at 2.
- **Privacy:** no account, no login, no tracking, no network calls at runtime. Student work never leaves the device.
- **Print:** a toy may be at most 100 × 100 × 100 mm (Nathan's printer is a Bambu P1S with a 256 mm bed, so this keeps prints small and quick); binary STL in millimetres. The limit lives in `BUILD_MM` in `src/core/doc/types.ts`.

## Stack (do not add to it without asking Nathan)
Vite, TypeScript (strict), three.js (named imports only), Preact + @preact/signals, plain CSS custom properties, Web Worker with typed arrays, `idb-keyval`, Vitest, Playwright (Chromium and WebKit), `size-limit`.
- **No** React, UI kits, CSS frameworks, or `SharedArrayBuffer` (GitHub Pages cannot send the headers it needs).
- `src/core/` is pure TypeScript with no DOM or three.js imports (a lint rule enforces this).
- Input is Pointer Events with `touch-action: none` on canvases. One code path for mouse, touch and pen.

## UX rules for kids
- Touch targets at least 48 px, with spacing. No hover-only features.
- Every action is undoable. Undo/Redo is always visible (bottom-left of the drawing view). Autosave constantly. Never lose a student's work.
- Words: about a grade 3 reading level, sentence case, verb-first buttons ("Save to print", "Make a copy"), no jargon ("How thick?", not "extrusion depth"). All user-facing text lives in `src/ui/copy.ts`.
- Errors say what happened and what to do next, and never blame the user.
- Show progress for anything over 300 ms. Respect `prefers-reduced-motion`.
- Calm design: few controls on screen at once, icons with text labels, strong contrast. One obvious way to do each thing. Remove clutter rather than add options.
- Icons are Nathan's artwork in `public/icons/`. Keep the names and do not redraw them.

## How to work
- **Plan first** for anything bigger than a small fix. Write a short plan and wait for Nathan's OK.
- **Test first.** Write the failing test, see it fail, make it pass, commit. Small commits with clear messages.
- Before saying anything is done, run `npm run lint && npm run typecheck && npm test && npm run build && npm run size && npm run test:e2e`, and look at screenshots at 1180×820, 820×1180, 1024×768, 1280×650 and 1366×768.
- Ask before adding a dependency, changing the folder structure, or removing a feature.
- Do not commit `node_modules/` or `dist/`.
- When unsure how something should behave, run the prototype in `legacy/` and match it.
- Stop and ask at the Task 7 performance gate in the plan.

## Known risks
- The signed-distance-field meshing is the most expensive part. Benchmark early on a throttled low-end profile.
- iOS memory limits and WebKit differences. Test on a real iPad before each release.
- Service workers may not work in Chrome on iPad. Feature-detect them, and never make the app depend on them.
- School networks may block hosts. Keep it a static site that can be hosted anywhere.
