# Performance baseline (Task 7)

Measured on 2026-11-04. Run it again with `npm run bench` (slowed-down browser, the numbers that count) or `npm run bench -- --node` (quick check, no slowdown).

## Result in one paragraph

**The meshing budget is missed everywhere once the browser is slowed down, including on the `low` tier.** The work is correct and tested; it is just too slow for a weak Chromebook. This is the Task 7 decision gate: Nathan chooses the next step before the drawing and 3D screens (Task 8 onwards) are built. Recommendation is at the end.

## How it was measured

- **Machine:** AMD Ryzen 7 5800X3D (8 cores, 34 GB RAM), Windows 11, Node 24.22, Chromium 156. This is a fast desktop, much faster than a school Chromebook.
- **Slow-down:** Chrome DevTools CPU throttling set from `bench.budget.json`: 2× for the `high` tier, 4× for `mid`, 6× for `low`. The test runs on the page's main thread so the throttling is certain to apply. Throttling is only a rough stand-in for a real Chromebook; real hardware is checked at release (Task 16).
- **What is timed:** `meshDocument` (build the toy's distance field and mesh it), with the shape caches kept between runs, which is what dragging feels like. "First" is the very first mesh with nothing remembered. Median of 7 repeats.
- **Budget:** a draft mesh in under 40 ms, a final mesh in under 400 ms.
- **Fixtures** (`scripts/benchFixtures.ts`): `character` is the prototype's 6-part "Chibi buddy" as saved by the prototype. `stress-20` is 20 mixed parts, half melted, some turned and tapered. `sculpt-heavy` is the character with 300 sculpt dabs (pull, push, smooth, grab).
- **Grid sizes per tier** (`src/app/perfTier.ts`): draft 2.4 / 1.6 / 1.2 mm and final 1.2 / 0.8 / 0.6 mm for low / mid / high. A smaller number is a finer, slower mesh.

## Results: slowed-down Chromium (milliseconds)

| fixture | tier | slow-down | quality | grid mm | first | repeat (median) | budget | result |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
| character | high | 2x | draft | 1.2 | 127 | 68 | 40 | MISS |
| character | high | 2x | final | 0.6 | 852 | 810 | 400 | MISS |
| stress-20 | high | 2x | draft | 1.2 | 270 | 205 | 40 | MISS |
| stress-20 | high | 2x | final | 0.6 | 2251 | 2129 | 400 | MISS |
| sculpt-heavy | high | 2x | draft | 1.2 | 245 | 205 | 40 | MISS |
| sculpt-heavy | high | 2x | final | 0.6 | 1966 | 1938 | 400 | MISS |
| character | mid | 4x | draft | 1.6 | 163 | 72 | 40 | MISS |
| character | mid | 4x | final | 0.8 | 912 | 830 | 400 | MISS |
| stress-20 | mid | 4x | draft | 1.6 | 313 | 224 | 40 | MISS |
| stress-20 | mid | 4x | final | 0.8 | 1752 | 1605 | 400 | MISS |
| sculpt-heavy | mid | 4x | draft | 1.6 | 250 | 203 | 40 | MISS |
| sculpt-heavy | mid | 4x | final | 0.8 | 1966 | 1904 | 400 | MISS |
| character | low | 6x | draft | 2.4 | 150 | 51 | 40 | MISS |
| character | low | 6x | final | 1.2 | 621 | 552 | 400 | MISS |
| stress-20 | low | 6x | draft | 2.4 | 247 | 161 | 40 | MISS |
| stress-20 | low | 6x | final | 1.2 | 1377 | 1257 | 400 | MISS |
| sculpt-heavy | low | 6x | draft | 2.4 | 163 | 128 | 40 | MISS |
| sculpt-heavy | low | 6x | final | 1.2 | 1209 | 1161 | 400 | MISS |

18 of 18 measurements are over budget. The closest are `character` on `low` (draft 51 ms against 40, final 552 against 400).

## Results: Node, no slow-down (milliseconds, for comparison)

| fixture | tier | quality | grid mm | repeat (median) | triangles |
| --- | --- | --- | --- | --- | --- |
| character | high | draft | 1.2 | 35 | 27,484 |
| character | high | final | 0.6 | 399 | 110,328 |
| character | mid | draft | 1.6 | 17 | 15,424 |
| character | mid | final | 0.8 | 200 | 62,044 |
| character | low | draft | 2.4 | 7 | 6,736 |
| character | low | final | 1.2 | 82 | 27,484 |
| stress-20 | mid | draft | 1.6 | 58 | 18,956 |
| stress-20 | mid | final | 0.8 | 403 | 76,448 |
| sculpt-heavy | mid | draft | 1.6 | 52 | 20,256 |
| sculpt-heavy | mid | final | 0.8 | 490 | 82,520 |

The throttled browser numbers are roughly the Node numbers times the slow-down, so the browser test agrees with Node.

## Where the time goes

Profiled in Node on the `character` and the other fixtures:

| fixture and grid | whole mesh | sampling the distance field | colouring vertices | field set-up |
| --- | --- | --- | --- | --- |
| character @ 1.2 mm | 43 ms | 25 ms (171,600 points, 0.15 µs each) | 2.5 ms | 0.3 ms |
| character @ 0.6 mm | 195 ms | 149 ms (1.2 million points) | 7 ms | 0.3 ms |
| stress-20 @ 1.2 mm | 109 ms | 81 ms (0.47 µs each, 20 parts to check) | 9 ms | 0.6 ms |
| sculpt-heavy @ 1.2 mm | 109 ms | 91 ms (0.30 µs each) | 3 ms | 1.3 ms |

- **Asking the field for a value is 60–80% of the time.** The rest is building vertices and triangles.
- **Setting up the field is cheap** (under 2 ms), so the shape-grid cache is working and the 300 dabs are not a problem (they are found through a spatial index).
- **Cost rises with the cube of how fine the grid is.** Halving the grid size makes a mesh about 8 times slower, which is why the finest settings are the slowest.
- **The grid is mostly near the surface already.** The toys are small (about 40 mm), so a simple "skip blocks far from the surface" trick would save only 25–60% of samples (measured: 4-voxel blocks keep 64% of blocks at 1.2 mm and 38% at 0.6 mm; 8-voxel blocks keep 71–90%).

## Other measurements

- **Speed test for choosing a tier:** the 50 ms test in the worker scores about 10 ms per mesh on this desktop. The tier limits are 20 ms (high) and 70 ms (mid), so a Chromebook 4–6 times slower should land on `mid` or `low`. These limits are a first guess and need checking on real hardware.
- **Bundle size so far:** the mesher worker is 21.9 KB (9.2 KB gzipped) and the page code for it 7.9 KB (3.3 KB gzipped). three.js is not in yet. The limit is 500 KB gzipped.
- **Worker in browsers:** the real worker was tested in Chromium and in WebKit (iPad Pro 11 emulation). A burst of 20 quick requests ends on the last one, and the picture never steps back to an older one.
- **Not measured yet:** real Chromebook and iPad hardware, memory use, and the cost of sending meshes to the page. These come at Task 8 and Task 16.

## The decision for Nathan

The mesher works and is tested, but is between 1.3 and 5.3 times too slow in these tests (the slowed-down browser stands in for a weak Chromebook). The 3D picture will lag behind the finger while dragging (about 5–15 updates a second instead of 30). The page itself will not freeze, because meshing runs in the background worker and the Front and Side drawings do not wait for it.

Options, with my estimate of the gain on the slowest tier:

| Option | What it does | Estimated gain | Cost and risk |
| --- | --- | --- | --- |
| **A. Follow the surface** | Only sample grid cells next to the surface instead of the whole box, found by spreading outwards from seed points. Plus a quick lookup of which parts are near a point (helps `stress-20`). | 3–4× at 1.2 mm, 6–7× at 0.6 mm; the 20-part case about 1.5× more | Medium. Pure TypeScript, no feature change. Needs care so thin parts and separate islands are never missed (tests for both). |
| **B. Re-mesh only what changed** | Remember the mesh in chunks. When one part moves, re-mesh only the chunks near its old and new position. | 3–5× for dragging one part; none for changes to everything | Medium. Task 8's viewport must draw chunks. Combines well with A. |
| **C. Coarser grids on the low tier** | Use bigger grid sizes (for example draft 3.2 mm, final 1.6 mm). | About 2–2.5× on the low tier | Low effort. Lumpier shapes while dragging, and blockier final models on weak devices. |
| **D. WebAssembly** | Move the field and mesher hot loop to WebAssembly. | About 1.5–2×, from experience; not measured | High: needs a Rust or C toolchain and a new dependency, which needs Nathan's approval. The work being done is the problem, not the language. |

**Recommendation: A, then B, with C as a safety net on the `low` tier. Do not use WebAssembly yet.** A and B change how much work is done, which is where the gain is. A on its own should bring `character` on `low` inside the budget. The 20-part and 300-dab fixtures are deliberately extreme, so A plus B is what should get them close. After A, run `npm run bench` again before deciding whether B is needed straight away.

Two cheaper ideas to remember: while dragging a part with the 3D arrows, the existing mesh could simply be moved (no re-mesh) until the user lets go, and the draft could skip colouring vertices. Neither is needed yet.
