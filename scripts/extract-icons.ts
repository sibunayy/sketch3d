/**
 * Unpacks the prototype's icon pictures (Nathan's artwork) from legacy/src/skin.js into public/icons/.
 * Names are kept exactly as they were. Run once: npx tsx scripts/extract-icons.ts
 */
import { mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import path from 'node:path';

const source = readFileSync('legacy/src/skin.js', 'utf8');
const match = source.match(/const IMGS=(\{[^}]*\})/);
if (!match) throw new Error('Could not find the icon table in legacy/src/skin.js');
const icons = JSON.parse(match[1]) as Record<string, string>;

mkdirSync('public/icons', { recursive: true });
for (const [name, base64] of Object.entries(icons)) {
  writeFileSync(path.join('public/icons', `${name}.webp`), Buffer.from(base64, 'base64'));
}
console.log(`Wrote ${Object.keys(icons).length} icons: ${Object.keys(icons).join(', ')}`);
