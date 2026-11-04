/**
 * Meshing benchmark.
 *
 *   npm run bench            runs in Chromium with CPU throttling (the numbers that count)
 *   npm run bench -- --node  quick check in Node, no throttling
 *
 * Compares each result with bench.budget.json and exits with 1 if any budget is missed.
 */
import { chromium } from '@playwright/test';
import { build } from 'vite';
import { mkdtempSync, readFileSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import type { PerfTier } from '../src/app/perfTier';
import { runBench } from './benchCore';
import type { BenchRow } from './benchCore';

interface Budget {
  mustPass: string[];
  draftMs: number;
  finalMs: number;
  tiers: Record<PerfTier, { throttle: number }>;
}

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const budget: Budget = JSON.parse(readFileSync(path.join(root, 'bench.budget.json'), 'utf8'));
const TIERS: PerfTier[] = ['high', 'mid', 'low'];
const nodeOnly = process.argv.includes('--node');
const json = process.argv.includes('--json');
const repeats = 7;

async function runInChromium(): Promise<(BenchRow & { throttle: number })[]> {
  const out = mkdtempSync(path.join(tmpdir(), 'sketch3d-bench-'));
  try {
    await build({
      root,
      configFile: false,
      logLevel: 'silent',
      build: {
        outDir: out,
        emptyOutDir: true,
        minify: false,
        target: 'es2020',
        lib: { entry: path.join(root, 'scripts/benchRunner.ts'), name: 'SketchBench', formats: ['iife'], fileName: () => 'bench.js' },
      },
    });
    const browser = await chromium.launch();
    const rows: (BenchRow & { throttle: number })[] = [];
    try {
      for (const tier of TIERS) {
        const page = await browser.newPage();
        const cdp = await page.context().newCDPSession(page);
        await page.setContent('<!doctype html><title>bench</title>');
        await page.addScriptTag({ path: path.join(out, 'bench.js') });
        const throttle = budget.tiers[tier].throttle;
        await cdp.send('Emulation.setCPUThrottlingRate', { rate: throttle });
        const result = await page.evaluate(([t, n]) => (window as unknown as { __bench: (t: string[], n: number) => Promise<BenchRow[]> }).__bench([t], n), [tier, repeats] as const);
        rows.push(...result.map((r) => ({ ...r, throttle })));
        await page.close();
      }
    } finally {
      await browser.close();
    }
    return rows;
  } finally {
    rmSync(out, { recursive: true, force: true });
  }
}

const rows: (BenchRow & { throttle: number })[] = nodeOnly
  ? (await runBench(TIERS, repeats)).map((r) => ({ ...r, throttle: 1 }))
  : await runInChromium();

let misses = 0;
let extremeOver = 0;
const lines: string[] = [];
lines.push(`Meshing time per mesh, milliseconds (${nodeOnly ? 'Node, no throttling' : 'Chromium, CPU throttled'}). Median of ${repeats} repeats after the first.`);
lines.push('');
lines.push('| fixture | tier | throttle | quality | grid mm | first (cold) | repeat (median) | worst | triangles | budget | result |');
lines.push('| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |');
for (const r of rows) {
  const limit = r.quality === 'draft' ? budget.draftMs : budget.finalMs;
  const ok = r.warmMs <= limit;
  const counts = budget.mustPass.includes(r.fixture);
  if (!ok && counts) misses++;
  if (!ok && !counts) extremeOver++;
  lines.push(
    `| ${r.fixture} | ${r.tier} | ${r.throttle}x | ${r.quality} | ${r.voxelMm} | ${r.coldMs.toFixed(0)} | ${r.warmMs.toFixed(0)} | ${r.worstMs.toFixed(0)} | ${r.triangles} | ${limit} | ${ok ? 'ok' : counts ? 'MISS' : 'over (extreme toy, not counted)'} |`,
  );
}
lines.push('');
lines.push(misses ? `${misses} measurements of the toys that must pass are over budget.` : `Every toy that must pass (${budget.mustPass.join(', ')}) is within budget.`);
if (extremeOver) lines.push(`${extremeOver} measurements of the extreme toys are over budget; the scheduler coarsens the grid for those.`);
console.log(lines.join('\n'));
if (json) console.log(JSON.stringify(rows));
process.exit(misses ? 1 : 0);
