# CLAUDE.md: Sketch3D

## What this project is
Sketch3D is a free web app where kids draw shapes, turn them into smooth 3D parts, join parts into a character, and save an STL file to 3D print.

- **Users:** primary-school students, about ages 9–11. Many are neurodiverse and get frustrated easily.
- **Owner:** Nathan, an education support worker. He does not write code, so explain decisions in plain language and keep summaries short.
- **Current state:** a working single-file prototype lives in `index.html`, built from `src/` (see `DEVELOPMENT.md`). We are rebuilding it with a cleaner, faster architecture. **Treat the prototype as the behaviour spec, not as code to copy.** Keep the old files in a `legacy/` folder for reference until the rebuild matches it.

## Target devices (hard constraints)
- **Chromebooks**: school-managed, often low-end (Celeron or MediaTek, 4 GB RAM, weak GPU), in Chrome.
- **iPads in Chrome**: Chrome on iOS runs on Apple's WebKit engine, so build and test for Safari behaviour. Memory per tab is limited.
- Touch-first, but must also work with a mouse and trackpad.
- Works offline once loaded (PWA). No account, no login, no tracking, no network calls at runtime.
- Student projects stay on the device. Never upload models or send any data anywhere.

## Stack
- Vite + TypeScript (strict mode).
- three.js, imported by named module so it tree-shakes. No other large dependencies without asking Nathan first.
- UI: vanilla TypeScript, or Preact if components really help. **No React, no UI kits, no CSS frameworks.** Plain CSS with custom properties.
- Heavy maths (SDF sampling, meshing) runs in a **Web Worker**. The main thread never blocks.
- Input: Pointer Events with `touch-action: none` on canvases. No separate mouse/touch code paths.
- Storage: IndexedDB for projects. Export: Blob download of a binary STL.
- Tests: Vitest for geometry/sculpt/profile maths; Playwright (Chromium **and** WebKit projects) for UI checks.

## Performance budgets
- JS bundle under 500 KB gzipped, including three.js. Fail the build if it grows past that.
- Drag, sculpt and rotate stay smooth on a 4 GB Chromebook. Target 30 fps or better, and no single frame task over 50 ms.
- Render on demand, not in a constant loop. Cap `devicePixelRatio` at 2.
- Use adaptive mesh resolution: coarse while dragging, refined when the user stops.
- Profile with Chrome DevTools CPU throttling at 4–6x before calling any feature done.

## UX rules for kids
- Touch targets at least 48 px, with spacing between them. No hover-only features.
- Every action is undoable, and Undo/Redo is always visible. Never lose a student's work: autosave constantly.
- Plain, friendly wording at about a grade 3 reading level. Sentence case. Verb-first buttons ("Save to print", "Make a copy"). No jargon (say "How thick?", not "extrusion depth").
- Errors say what happened and what to do next. Never blame the user.
- Don't make the user wait without feedback. Show progress for anything over 300 ms.
- Calm visual design: few controls on screen at once, clear icons with text labels, strong colour contrast, respect `prefers-reduced-motion`.
- One obvious way to do each thing. Remove clutter rather than adding options.

## Core features to preserve (see `DEVELOPMENT.md` for the data model)
Front, Side and 3D views that always agree; draw outlines or pick ready-made shapes; Tail/arm tool; reshape, size, turn, thickness slider, roundness; melt parts together; cut away (hole/slot); eyes, smile, crease; sculpt mode; paint; multi-select; 3D gizmo (move, turn, resize); presets; Save to print (STL, within a 110 x 110 x 70 mm build area).

## Working style
- **Plan first.** For any change bigger than a small fix, write a short plan and wait for Nathan's OK before coding.
- Build in stages and test after each: data model + meshing worker, then 2D views, then 3D editing, then export, then polish.
- Run `npm run build`, the unit tests and the Playwright tests before saying something is done. Take screenshots at 1180x820, 820x1180, 1024x768, 1280x650 and 1366x768.
- Ask before adding a dependency, changing the file structure, or removing a feature.
- Keep commits small, with clear messages. Do not commit `node_modules/` or build output unless the host needs it (GitHub Pages serves `index.html` or `dist/`).
- When unsure about behaviour, check the prototype in `legacy/` and match it.

## Known risks
- The SDF smoothing is the most expensive part. Benchmark it on a low-end Chromebook early, and be ready to switch to a cheaper approach (such as surface nets on a coarse grid with local refinement).
- iOS memory limits and WebKit differences. Test in WebKit, and on a real iPad before release.
- School networks may block some hosts. Keep the app a static site that can be hosted anywhere.
