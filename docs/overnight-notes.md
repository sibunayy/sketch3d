# Overnight notes (2026-11-05)

What was done while Nathan slept, and what is left.

## Done
- **`main` now holds the rebuilt app.** The old prototype's `main` was saved first as the branch `main-prototype-backup`. To go back to the prototype, point `main` at that branch.
- **CI benchmark step** added to `.github/workflows/ci.yml`. It warns but never blocks a merge.
- **`tools.ts` split** into `toolKit.ts` (shared types and helpers), `drawTools.ts` (draw, shapes, limbs, eyes, smile, creases) and `editTools.ts` (pick and move, erase, size, turn, reshape). `tools.ts` keeps `createTool`. Behaviour is unchanged. All unit and browser tests pass.

## Not done, and why
- **TypeScript 7 upgrade: skipped.** It compiles, but the linter (typescript-eslint) refuses to run on TypeScript 7. It plans support in 7.1. Stay on 6.0.3 until then.
- **`legacy/` kept**, as agreed, until the real-device checklist is signed off.
- **Real-device checks** (`docs/release-checklist.md`) still need a Chromebook and an iPad.
- The old `rebuild` branch on GitHub was kept, as agreed.

## Things to know
- `npm audit` reports a "deepmerge" warning inside the offline-support build tool (`vite-plugin-pwa` → `workbox-build`). It is build-time only and is not shipped to children's browsers. The fix needs a breaking upgrade, so it was left alone.
- The live site is the new app, so test it on real devices soon.
