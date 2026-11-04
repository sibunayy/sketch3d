import { expect, test } from '@playwright/test';

// These tests use the built app (the way GitHub Pages serves it), because only that has a service worker.
const APP = 'http://localhost:4174/sketch3d/';

test.beforeEach(async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sketch3d.guide.done', '1'));
  await page.setViewportSize({ width: 1280, height: 800 });
});

test.describe('with a service worker (Chromium)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'WebKit under test does not keep a service worker between runs');

  test('after one visit, going offline and reloading still loads the app and the last toy', async ({ page, context }) => {
    await page.goto(APP);
    // wait until the service worker has saved the app and taken control
    await page.waitForFunction(async () => (await navigator.serviceWorker.getRegistration())?.active?.state === 'activated', null, { timeout: 30_000 });
    // the first page after the worker wakes may not be controlled yet, so visit again until one is
    for (let n = 2; n < 6 && !(await page.evaluate(() => !!navigator.serviceWorker.controller)); n++) {
      await page.goto(APP + '?visit=' + n);
      await page.waitForTimeout(500);
    }
    expect(await page.evaluate(() => !!navigator.serviceWorker.controller)).toBe(true);

    const b = (await page.getByTestId('canvas-front').boundingBox())!;
    await page.getByTestId('tool-shape:circle').click();
    await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
    await expect(page.getByTestId('savestatus')).toHaveText('Saved', { timeout: 10_000 });

    await context.setOffline(true);
    await page.goto(APP + '?visit=9'); // with no network at all
    await expect(page.getByTestId('canvas-front')).toBeVisible({ timeout: 15_000 }); // the app opened with no network
    await expect(page.getByRole('button', { name: 'Circle 1' })).toBeVisible({ timeout: 15_000 }); // and the toy came back
    await context.setOffline(false);
  });
});

test('when service workers are unavailable the app still loads and shows no error', async ({ page }) => {
  await page.addInitScript(() => {
    // what Chrome on an iPad may look like: no service worker support at all
    Object.defineProperty(navigator, 'serviceWorker', { get: () => undefined, configurable: true });
  });
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push('pageerror: ' + e.message));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push('console: ' + m.text());
  });
  await page.goto(APP);
  await expect(page.getByTestId('canvas-front')).toBeVisible();
  await expect(page.getByRole('button', { name: 'Save to print' })).toBeVisible();
  const b = (await page.getByTestId('canvas-front').boundingBox())!;
  await page.getByTestId('tool-shape:circle').click();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await expect(page.getByRole('button', { name: 'Circle 1' })).toBeVisible(); // it works, just without offline support
  expect(problems.filter((p) => !/GL Driver|WebGL|GPU stall/i.test(p))).toEqual([]);
});

test('the app can be installed: it has a manifest with icons', async ({ page, request }) => {
  await page.goto(APP);
  const href = await page.locator('link[rel="manifest"]').getAttribute('href');
  expect(href).toBeTruthy();
  const res = await request.get(new URL(href!, APP).toString());
  expect(res.ok()).toBe(true);
  const manifest = await res.json();
  expect(manifest.name).toBe('Sketch3D');
  expect(manifest.icons.length).toBeGreaterThanOrEqual(2);
  expect(manifest.display).toBe('standalone');
});
