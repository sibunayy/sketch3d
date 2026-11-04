import { expect, test } from '@playwright/test';

type Shown = { quality: string; width: number; triangles: number };
type Api = {
  single(diameter: number): Promise<Shown[]>;
  burst(count: number): Promise<{ shown: Shown[]; lastDiameter: number }>;
  tier(): Promise<string>;
};
declare global {
  interface Window {
    sketch3dWorkerTest: Api;
  }
}

test.beforeEach(async ({ page }) => {
  page.on('pageerror', (e) => {
    throw new Error(`page error: ${e.message}`);
  });
  await page.goto('/dev/worker.html');
  await page.waitForFunction(() => document.title === 'ready');
});

test('a request comes back as a real mesh, draft first and then final', async ({ page }) => {
  const shown = await page.evaluate(() => window.sketch3dWorkerTest.single(30));
  expect(shown.length).toBeGreaterThanOrEqual(1);
  const final = shown[shown.length - 1];
  expect(final.quality).toBe('final');
  expect(final.triangles).toBeGreaterThan(500);
  expect(final.width).toBeGreaterThan(28);
  expect(final.width).toBeLessThan(31);
  // a draft, if one reached the screen, comes before the final and is coarser
  if (shown.length > 1) expect(shown[0].triangles).toBeLessThan(final.triangles);
});

test('a burst of 20 requests ends on the last one, and the screen never goes back to an older one', async ({ page }) => {
  const { shown, lastDiameter } = await page.evaluate(() => window.sketch3dWorkerTest.burst(20));
  const final = shown[shown.length - 1];
  expect(final.quality).toBe('final');
  expect(final.width).toBeGreaterThan(lastDiameter - 2.5);
  expect(final.width).toBeLessThan(lastDiameter + 0.5);
  // later requests are bigger balls, so what is shown must never get smaller
  for (let i = 1; i < shown.length; i++) expect(shown[i].width).toBeGreaterThanOrEqual(shown[i - 1].width - 0.01);
  expect(shown.length).toBeLessThanOrEqual(20 + 1); // never more results than requests plus the final
});

test('the speed test runs in the worker and picks a tier', async ({ page }) => {
  const tier = await page.evaluate(() => window.sketch3dWorkerTest.tier());
  expect(['low', 'mid', 'high']).toContain(tier);
});
