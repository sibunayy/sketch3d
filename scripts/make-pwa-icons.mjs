/* eslint-disable no-undef -- the drawing code inside page.evaluate runs in the browser */
// Makes the PNG home-screen icons from Nathan's logo (public/icons/logo.webp).
// Run once: node scripts/make-pwa-icons.mjs
import { chromium } from '@playwright/test';
import { readFileSync, writeFileSync } from 'node:fs';

const logo = readFileSync('public/icons/logo.webp').toString('base64');
const browser = await chromium.launch();
const page = await browser.newPage();
const sizes = { 'pwa-192.png': 192, 'pwa-512.png': 512, 'apple-touch-icon.png': 180 };
for (const [name, size] of Object.entries(sizes)) {
  const dataUrl = await page.evaluate(
    async ([b64, s]) => {
      const img = new Image();
      img.src = 'data:image/webp;base64,' + b64;
      await img.decode();
      const c = document.createElement('canvas');
      c.width = c.height = s;
      const g = c.getContext('2d');
      g.fillStyle = '#ffffff';
      g.fillRect(0, 0, s, s);
      const pad = s * 0.12;
      const k = Math.min((s - 2 * pad) / img.width, (s - 2 * pad) / img.height);
      const w = img.width * k;
      const h = img.height * k;
      g.drawImage(img, (s - w) / 2, (s - h) / 2, w, h);
      return c.toDataURL('image/png');
    },
    [logo, size],
  );
  writeFileSync('public/icons/' + name, Buffer.from(dataUrl.split(',')[1], 'base64'));
  console.log('wrote public/icons/' + name);
}
await browser.close();
