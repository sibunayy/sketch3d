# Performance baseline (Task 7)

Measured on 2026-11-04. Run it again with `npm run bench` (slowed-down browser, the numbers that count) or `npm run bench -- --node` (quick check, no slow-down).

## Result in one paragraph

**A typical toy now meets the meshing budget on all three device tiers, in a browser slowed down to stand in for a weak Chromebook.** Drafts take 29–33 ms against a 40 ms limit, and final meshes 243–360 ms against 400. Two deliberately extreme toys (20 parts, and 300 sculpt dabs) are still over budget at the tier's normal grid size. For those the scheduler makes the grid coarser until meshing is quick again; this was simulated with real timings but is not yet proven on a real device. Nothing here replaces testing on a real Chromebook and iPad (Task 16).

## How it was measured

- **Machine:** AMD Ryzen 7 5800X3D (8 cores, 34 GB RAM), Windows 11, Node 24.22, Chromium 156. This is a fast desktop, much faster than a school Chromebook.
- **Slow-down:** Chrome DevTools CPU throttling from `bench.budget.json`: 2× for the `high` tier, 4× for `mid`, 6× for `low`. The test runs on the page's main thread so the throttling is certain to apply. Throttling is only a rough stand-in for a real Chromebook.
- **What is timed:** `meshDocument` (build the toy's distance field and mesh it). "First" is the first mesh with nothing remembered, as right after opening a toy. "Repeat" is the median of 7 meshes with the shape caches kept, which is what dragging feels like.
- **Budget:** a draft mesh in under 40 ms, a final mesh in under 400 ms. The toy listed in `mustPass` (the character) has to be inside it. The other two are extreme and are reported only.
- **Fixtures** (`scripts/benchFixtures.ts`): `character` is the prototype's 6-part "Chibi buddy" as saved by the prototype. `stress-20` is 20 mixed parts, half melted, some turned and tapered. `sculpt-heavy` is the character with 300 sculpt dabs (pull, push, smooth, grab).
- **Grid sizes per tier** (`src/app/perfTier.ts`), in millimetres. A smaller number is finer and slower.

| | low | mid | high |
| --- | --- | --- | --- |
| draft | 2.9 | 2.1 | 1.5 |
| final | 1.2 | 0.8 | 0.6 |

## Results: slowed-down Chromium (milliseconds)

| fixture | tier | slow-down | quality | grid mm | first | repeat (median) | budget | result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| character | high | 2x | draft | 1.5 | 105 | 33 | 40 | ok |
| character | high | 2x | final | 0.6 | 355 | 328 | 400 | ok |
| character | mid | 4x | draft | 2.1 | 149 | 33 | 40 | ok |
| character | mid | 4x | final | 0.8 | 407 | 360 | 400 | ok |
| character | low | 6x | draft | 2.9 | 213 | 29 | 40 | ok |
| character | low | 6x | final | 1.2 | 347 | 243 | 400 | ok |
| stress-20 | high | 2x | draft | 1.5 | 201 | 91 | 40 | over (extreme) |
| stress-20 | high | 2x | final | 0.6 | 899 | 847 | 400 | over (extreme) |
| stress-20 | mid | 4x | draft | 2.1 | 249 | 93 | 40 | over (extreme) |
| stress-20 | mid | 4x | final | 0.8 | 1009 | 913 | 400 | over (extreme) |
| stress-20 | low | 6x | draft | 2.9 | 346 | 80 | 40 | over (extreme) |
| stress-20 | low | 6x | final | 1.2 | 872 | 643 | 400 | over (extreme) |
| sculpt-heavy | high | 2x | draft | 1.5 | 153 | 113 | 40 | over (extreme) |
| sculpt-heavy | high | 2x | final | 0.6 | 1605 | 1553 | 400 | over (extreme) |
| sculpt-heavy | mid | 4x | draft | 2.1 | 156 | 105 | 40 | over (extreme) |
| sculpt-heavy | mid | 4x | final | 0.8 | 1559 | 1524 | 400 | over (extreme) |
| sculpt-heavy | low | 6x | draft | 2.9 | 177 | 81 | 40 | over (extreme) |
| sculpt-heavy | low | 6x | final | 1.2 | 926 | 837 | 400 | over (extreme) |

For comparison, the first run of this benchmark (before the speed-up work) had every one of the 18 rows over budget, for example `character` on `mid`: draft 72 ms and final 830 ms.

## What made it faster, and what was found

1. **Skipping blocks that cannot hold surface** (`sampleWithSkipping` in `surfaceNets.ts`). The mesher asks the scene whether a whole block of space is certainly empty or certainly solid (`SceneField.probe`) and does not look inside if so. Final meshes of the character got about 2.7 times faster. Drafts hardly changed, because on a small toy at a coarse grid there is little empty space to skip. The scene says "can't tell" near sculpt dabs and grooves, which can bend space.
   - **Proof it is safe:** a test meshes 80 random toys (turned, tapered, melted, cut, sculpted, grooved, at grid sizes from 0.7 to 2.2 mm) and several hand-made ones both ways, and the two meshes must match exactly. A one-off run of 500 random toys also matched. Thin fins and sheets and separate islands are tested on purpose.
   - **A first version was wrong,** and the comparison test caught it. The field only looks at parts that are near a point, so it can overstate the distance to a far-away part, and a block could wrongly be skipped. The first fix (a wider safety margin) was not enough, so the decision now looks at every part that could matter anywhere in the block.
2. **Asking only the nearby parts** (a spatial lookup in `scene.ts`). Measured on its own in Node, the 20-part toy went from 109 ms to about 68 ms for a draft at the finest grid.
3. **Cheaper sculpt dabs.** Dabs that provably cannot change a value are skipped using squared distances, and the rare grab dabs have their own lookup. Dab-heavy toys got a little faster.
4. **A flaw in the smooth brush was fixed.** It averaged in neighbouring values even where one of them had switched to the rough far-away answer, which made the field jump. It now skips those places.
5. **The shape-grid cache was being missed whenever the mesh resolution changed.** The cache was keyed on the grid size, so every switch between draft and final rebuilt every part's grid. The fixed-size benchmark never showed it. It showed up when simulating the adaptive grid. Part grids are now independent of the mesh resolution (0.75 mm cells, 12 mm margin), so one cached grid serves every resolution.
6. **Coarser draft grids** (2.9 / 2.1 / 1.5 mm for low / mid / high). Drafts only have to feel responsive while dragging.
7. **The grid adapts on its own** (`MeshScheduler.adapt`). The worker reports how long each mesh took. If a draft takes much longer than 35 ms (or a final longer than 350 ms), the next one uses a coarser grid, at most 3 times coarser than the tier's. When meshing is quick again it goes back, but never finer than the tier's grid. Simulated with real timings scaled 4× (a mid-tier device), it settles within two or three meshes:

   | toy | draft grid and time | final grid and time |
   | --- | --- | --- |
   | character | 2.4 mm, about 26 ms | 0.8 mm, about 335 ms |
   | stress-20 | 3.8 mm, about 33 ms | 1.2 mm, about 375 ms |
   | sculpt-heavy | 3.7 mm, about 34 ms | 1.4 mm, about 360 ms |

## Other measurements

- **Speed test for choosing a tier:** a 50 ms test in the worker scores about 11.5 ms per standard mesh on this desktop. The tier limits are 23 ms (high) and 52 ms (mid), about 2 and 4.5 times slower than this desktop, so each tier's slow-down above sits inside its own range. These are a first guess and need checking on real hardware.
- **Bundle size so far:** the mesher worker is about 22 KB (about 9 KB gzipped) and the page code for it about 8 KB (3.3 KB gzipped). three.js is not in yet. The limit is 500 KB gzipped.
- **Worker in browsers:** the real worker is tested in Chromium and in WebKit (iPad Pro 11 emulation). A burst of 20 quick requests ends on the last one, and the picture never steps back to an older one.

## Still open

- **First mesh is slower** (105–350 ms in the slowed-down browser) because the shape grids are built once. This happens when a toy is opened and when a part's outline changes (only that part's grid is rebuilt). A progress hint over 300 ms (Task 9) covers the worst case.
- **Extreme toys** (20 parts, 300 dabs) rely on the adaptive grid, so they will look coarser while dragging.
- **Not measured:** real Chromebook and iPad hardware, memory use, and the cost of sending meshes to the page. These come at Task 8 and Task 16.
- **Not needed yet:** re-meshing only the chunks that changed (option B) and WebAssembly (option D). If real devices disagree with these numbers, re-meshing only what changed is the next thing to try.
