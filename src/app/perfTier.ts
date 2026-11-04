import type { Quality } from '../worker/protocol';

/** How fast this device is, from a short test at start-up. */
export type PerfTier = 'low' | 'mid' | 'high';

/**
 * Grid sizes (millimetres) for each tier. A bigger number is a coarser, quicker mesh.
 * These are starting points; docs/perf-baseline.md records the measurements behind them.
 */
export const VOXEL_MM: Record<Quality, Record<PerfTier, number>> = {
  draft: { low: 2.9, mid: 2.1, high: 1.5 },
  final: { low: 1.2, mid: 0.8, high: 0.6 },
};

export function voxelFor(tier: PerfTier, quality: Quality): number {
  return VOXEL_MM[quality][tier];
}

/** Hints the browser gives about the device. They can only lower the tier, never raise it. */
export interface TierHints {
  /** navigator.hardwareConcurrency */
  cores?: number;
  /** navigator.deviceMemory, in GB. Only Chrome has it. */
  memoryGb?: number;
}

/**
 * A benchmark time (milliseconds per standard mesh, see `runMicroBenchmark`) at or under
 * HIGH_MAX_MS is a high tier; under MID_MAX_MS is mid. The development desktop scores about 11.5, so these are about 2 and 4.5 times slower than it.
 */
export const HIGH_MAX_MS = 23;
export const MID_MAX_MS = 52;

const ORDER: PerfTier[] = ['high', 'mid', 'low'];

export function tierFromBench(msPerMesh: number, hints: TierHints = {}): PerfTier {
  if (!Number.isFinite(msPerMesh) || msPerMesh <= 0) return 'low';
  let i = msPerMesh <= HIGH_MAX_MS ? 0 : msPerMesh <= MID_MAX_MS ? 1 : 2;
  if (hints.cores !== undefined && hints.cores <= 2) i++;
  if (hints.memoryGb !== undefined && hints.memoryGb <= 2) i++;
  return ORDER[Math.min(i, 2)];
}

/** Reads the hints from the browser, where it offers them. */
export function currentHints(): TierHints {
  const nav = typeof navigator === 'undefined' ? undefined : (navigator as Navigator & { deviceMemory?: number });
  return { cores: nav?.hardwareConcurrency, memoryGb: nav?.deviceMemory };
}

/**
 * Works out the tier. `runBench` runs the speed test inside the mesher worker (so the page is
 * never blocked) and returns milliseconds per mesh. If the test cannot run, the safe choice is `low`.
 */
export async function detectTier(runBench: () => Promise<number>, hints: TierHints = currentHints()): Promise<PerfTier> {
  try {
    return tierFromBench(await runBench(), hints);
  } catch {
    return 'low';
  }
}
