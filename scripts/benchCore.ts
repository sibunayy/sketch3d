import { voxelFor } from '../src/app/perfTier';
import type { PerfTier } from '../src/app/perfTier';
import type { OutlineCache } from '../src/core/geom/sdf';
import { meshDocument } from '../src/worker/meshJob';
import type { Quality } from '../src/worker/protocol';
import { fixtures } from './benchFixtures';

export interface BenchRow {
  fixture: string;
  tier: PerfTier;
  quality: Quality;
  voxelMm: number;
  /** First mesh with nothing remembered (outline grids are built). */
  coldMs: number;
  /** Median of repeat meshes, outline grids remembered. This is what dragging feels like. */
  warmMs: number;
  worstMs: number;
  triangles: number;
}

const median = (a: number[]) => a.slice().sort((x, y) => x - y)[Math.floor(a.length / 2)];

/** Meshes every fixture at every tier's grid sizes and times it. Runs in Node or in a browser page. */
export async function runBench(tiers: PerfTier[], repeats = 7, only?: string[]): Promise<BenchRow[]> {
  const rows: BenchRow[] = [];
  for (const fx of fixtures()) {
    if (only && !only.includes(fx.name)) continue;
    for (const tier of tiers) {
      for (const quality of ['draft', 'final'] as const) {
        const voxelMm = voxelFor(tier, quality);
        const cache: OutlineCache = new Map();
        const t0 = performance.now();
        const first = await meshDocument(fx.doc, voxelMm, quality, { cache });
        const coldMs = performance.now() - t0;
        const times: number[] = [];
        for (let i = 0; i < repeats; i++) {
          const t = performance.now();
          await meshDocument(fx.doc, voxelMm, quality, { cache });
          times.push(performance.now() - t);
        }
        rows.push({
          fixture: fx.name,
          tier,
          quality,
          voxelMm,
          coldMs,
          warmMs: median(times),
          worstMs: Math.max(...times),
          triangles: first ? first.indices.length / 3 : 0,
        });
      }
    }
  }
  return rows;
}
