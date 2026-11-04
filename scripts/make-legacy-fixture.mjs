/* eslint-disable no-undef -- the names used inside page.evaluate() exist in the prototype page, not in this file */
// Builds tests/fixtures/legacy-v2.json: a project saved by the prototype in legacy/.
// Run once: node scripts/make-legacy-fixture.mjs  (needs `cd legacy && node build.mjs` first)
import { chromium } from '@playwright/test';
import { pathToFileURL } from 'node:url';
import { writeFileSync } from 'node:fs';
import path from 'node:path';

const page = await (await chromium.launch()).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(e.message));
await page.goto(pathToFileURL(path.resolve('legacy/index.html')).href);

const saved = await page.evaluate(() => {
  localStorage.clear();
  // same steps as the prototype's init(), for the "Chibi buddy" preset
  parts = []; counters = {}; nid = 1;
  PRESETS.find((p) => p.id === 'chibi').build((name, pts, color, depth, z, round, blend) => {
    parts.push({ id: uid(), name, pts, color, depth, round, z, blend });
  });
  linkTwins(); normalizeParts();
  const body = parts.find((p) => p.name === 'Body');
  const head = parts.find((p) => p.name === 'Head');
  const b = bbox(body.pts);
  // two attached dabs (as the sculpt tool makes them) and one old-style dab with no part
  const attach = (d, p) => { d.pid = p.id; d.fr = partFrame(p); d.c0 = d.c.slice(); d.r0 = d.r; return d; };
  sculpt = [
    attach({ t: 'add', r: 4.5, s: true, c: [b.cx + 6, b.cy, body.z + body.depth / 2] }, body),
    attach({ t: 'dent', r: 4.5, s: false, c: [b.cx - 4, b.cy + 3, body.z + body.depth / 2] }, body),
    { t: 'smooth', r: 4.5, s: false, w: 0.35, c: [0, bbox(head.pts).cy, head.z + head.depth / 2] },
  ];
  grooves = [{ pts: [[-6, bbox(head.pts).cy - 2, head.z + head.depth / 2], [0, bbox(head.pts).cy - 4, head.z + head.depth / 2], [6, bbox(head.pts).cy - 2, head.z + head.depth / 2]], r: 1.8, sym: false }];
  commit();
  return JSON.parse(localStorage.getItem('sketch3d.v2'));
});
if (errors.length) throw new Error('prototype errors: ' + errors.join('; '));
writeFileSync('tests/fixtures/legacy-v2.json', JSON.stringify(saved, null, 1) + '\n');
console.log('parts:', saved.parts.length, 'sculpt:', saved.sculpt.length, 'grooves:', saved.grooves.length);
await page.context().browser().close();
