/* eslint-disable @typescript-eslint/no-unused-vars -- these are globals of the prototype page, assigned inside page.evaluate */
/**
 * Builds src/core/doc/presetData.json from the prototype's ready-made toys (legacy/src/presets.js).
 * Each preset is built inside the prototype page, saved the way the prototype saves, and converted with migrate().
 * Run once: npx tsx scripts/make-presets.ts   (needs `cd legacy && node build.mjs` first)
 */
import { chromium } from '@playwright/test';
import { writeFileSync } from 'node:fs';
import path from 'node:path';
import { pathToFileURL } from 'node:url';
import { scaleToy } from '../src/core/doc/edit';
import { migrate } from '../src/core/doc/migrate';

// the prototype's own functions, used inside page.evaluate below
declare const PRESETS: unknown[];
declare let parts: unknown[];
declare let counters: Record<string, number>;
declare let nid: number;
declare let grooves: unknown[];
declare let sculpt: unknown[];
declare function uid(): string;
declare function linkTwins(): void;
declare function normalizeParts(): void;
declare function clampAll(): void;
declare function commit(): void;

const browser = await chromium.launch();
const page = await browser.newPage();
const errors: string[] = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(pathToFileURL(path.resolve('legacy/index.html')).href);

const saves = await page.evaluate(() => {
  const out: Record<string, { name: string; desc: string; save: unknown }> = {};
  for (const P of PRESETS as { id: string; name: string; desc: string; build: (a: unknown) => void }[]) {
    if (P.id === 'blank') continue;
    localStorage.clear();
    parts = [];
    counters = {};
    nid = 1;
    grooves = [];
    sculpt = [];
    P.build((name: string, pts: number[][], color: string, depth: number, z: number, round: number, blend: number) => {
      parts.push({ id: uid(), name, pts, color, depth, round, z, blend });
    });
    linkTwins();
    normalizeParts();
    if (typeof clampAll === 'function') clampAll();
    commit();
    out[P.id] = { name: P.name, desc: P.desc, save: JSON.parse(localStorage.getItem('sketch3d.v2') as string) };
  }
  return out;
});
if (errors.length) throw new Error('prototype errors: ' + errors.join('; '));
await browser.close();

/**
 * The prototype blurred small gaps together on screen. For printing, a toy has to be one solid piece within
 * 100 mm, so: parts that have a melt amount really melt, the rocket's fins and flame overlap its body,
 * and the dino is a little smaller.
 */
function fixForPrinting(id: string, doc: ReturnType<typeof migrate>) {
  for (const part of doc.parts) if (!part.cut && part.blend > 0) part.melt = true;
  const move = (name: string, dx: number, dy: number) => {
    const part = doc.parts.find((p) => p.name === name);
    if (part) part.outline = part.outline.map(([x, y]) => [x + dx, y + dy]);
  };
  if (id === 'rocket') {
    move('Fin left', 3, 0);
    move('Fin right', -3, 0);
    move('Flame', 0, 4);
  }
  if (id === 'dino') scaleToy(doc, 0.93);
}

const round = (n: number) => Math.round(n * 1000) / 1000;
const data: Record<string, { name: string; description: string; doc: unknown }> = {};
for (const [id, p] of Object.entries(saves)) {
  const doc = migrate(p.save);
  fixForPrinting(id, doc);
  for (const part of doc.parts) part.outline = part.outline.map(([x, y]) => [round(x), round(y)]);
  data[id] = { name: p.name, description: p.desc, doc };
  console.log(id.padEnd(8), `${doc.parts.length} parts`, `"${p.name}"`);
}
writeFileSync('src/core/doc/presetData.json', JSON.stringify(data));
console.log('wrote src/core/doc/presetData.json');
