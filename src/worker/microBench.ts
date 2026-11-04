import { createDoc } from '../core/doc/schema';
import type { Doc, Part } from '../core/doc/types';
import { buildSceneField } from '../core/geom/scene';
import { SHAPES } from '../core/geom/shapes';
import { meshField } from '../core/geom/surfaceNets';

/** A small, fixed toy: three melted parts. The same work on every device, so times can be compared. */
function benchDoc(): Doc {
  const part = (id: string, shape: keyof typeof SHAPES, box: [number, number, number, number], depthMm: number): Part => ({
    id,
    name: id,
    kind: shape,
    outline: SHAPES[shape](...box),
    color: '#e5484d',
    depthMm,
    round: 0.9,
    z: 0,
    blend: 5,
    melt: true,
    cut: false,
    rot: { x: 0, y: 0, z: 0 },
    taper: 0,
    squash: 0,
  });
  const doc = createDoc();
  doc.parts = [
    part('body', 'egg', [-14, -2, 14, 30], 26),
    part('head', 'circle', [-12, 26, 12, 50], 24),
    part('arm', 'capsule', [12, 8, 30, 16], 12),
  ];
  return doc;
}

const BENCH_VOXEL_MM = 1.5;

/**
 * Meshes the fixed toy over and over for about `budgetMs`, and reports the average time per mesh.
 * Used once at start-up to guess how fast this device is.
 */
export function runMicroBenchmark(budgetMs: number): { msPerMesh: number; runs: number } {
  const doc = benchDoc();
  const once = () => {
    const t0 = performance.now();
    meshField(buildSceneField(doc, { voxelMm: BENCH_VOXEL_MM }), { voxelMm: BENCH_VOXEL_MM });
    return performance.now() - t0;
  };
  once(); // warm-up: lets the JavaScript engine optimise the hot loops
  let total = 0;
  let runs = 0;
  do {
    total += once();
    runs++;
  } while (total < budgetMs);
  return { msPerMesh: total / runs, runs };
}
