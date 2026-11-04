// Bundled by scripts/bench.ts and loaded into a Chromium page, so the benchmark can run with CPU throttling.
import type { PerfTier } from '../src/app/perfTier';
import { runBench } from './benchCore';

(window as unknown as { __bench: typeof run }).__bench = run;

function run(tiers: PerfTier[], repeats: number) {
  return runBench(tiers, repeats);
}
