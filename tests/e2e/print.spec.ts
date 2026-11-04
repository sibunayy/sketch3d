import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await page.waitForFunction(() => !!window.__sketch3d);
});

/** Counts downloads, so a test can prove none happened. */
function watchDownloads(page: Page) {
  const seen: string[] = [];
  page.on('download', (d) => seen.push(d.suggestedFilename()));
  return seen;
}

async function placeBall(page: Page, dx = 0) {
  const b = (await page.getByTestId('canvas-front').boundingBox())!;
  await page.getByTestId('tool-shape:circle').click();
  await page.mouse.click(b.x + b.width / 2 + dx, b.y + b.height / 2);
}

const openPrint = (page: Page) => page.getByRole('button', { name: 'Save to print' }).click();

test('Save to print shows the problem list with a fix button for each problem, and never downloads when the toy cannot print', async ({ page }) => {
  const downloads = watchDownloads(page);
  await openPrint(page);
  const issues = page.getByTestId('print-issues');
  await expect(issues).toBeVisible({ timeout: 10_000 });
  await expect(issues.getByText('There is nothing to print yet.')).toBeVisible();
  await expect(issues.getByText('Draw a shape first.')).toBeVisible();
  const items = issues.locator('li');
  expect(await items.count()).toBeGreaterThanOrEqual(1);
  for (let i = 0; i < (await items.count()); i++) {
    await expect(items.nth(i).getByRole('button')).toBeVisible(); // every problem has a button
  }
  await expect(page.getByRole('button', { name: 'Download the STL' })).toHaveCount(0);
  expect(downloads).toEqual([]);

  // the fix button takes the child to drawing
  await issues.getByRole('button', { name: 'Start drawing' }).click();
  expect(await page.evaluate(() => window.__sketch3d.app.tool.value)).toBe('draw');
  expect(downloads).toEqual([]);
});

test('Save to print on a good toy downloads a .stl whose size matches 84 + 50 × triangles', async ({ page }) => {
  await placeBall(page);
  await openPrint(page);
  await expect(page.getByTestId('print-checking')).toBeVisible();
  await expect(page.getByTestId('print-ready')).toBeVisible({ timeout: 30_000 });
  await expect(page.getByText('Your toy is ready to print.')).toBeVisible();

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download the STL' }).click()]);
  expect(download.suggestedFilename()).toBe('sketch3d-toy.stl');
  const bytes = readFileSync((await download.path())!);
  const triangles = bytes.readUInt32LE(80);
  expect(triangles).toBeGreaterThan(500);
  expect(bytes.length).toBe(84 + 50 * triangles);
  expect(bytes.subarray(0, 5).toString('latin1')).not.toBe('solid');

  // the toy stands on the plate and is centred: its lowest point is z = 0 and it is about 28 mm across
  let zMin = Infinity, zMax = -Infinity, xMin = Infinity, xMax = -Infinity;
  for (let t = 0; t < triangles; t++) {
    for (let v = 0; v < 3; v++) {
      const o = 84 + t * 50 + 12 + v * 12;
      const x = bytes.readFloatLE(o);
      const z = bytes.readFloatLE(o + 8);
      xMin = Math.min(xMin, x); xMax = Math.max(xMax, x); zMin = Math.min(zMin, z); zMax = Math.max(zMax, z);
    }
  }
  expect(zMin).toBeCloseTo(0, 3);
  expect(xMax + xMin).toBeCloseTo(0, 1);
  expect(zMax - zMin).toBeGreaterThan(24);
  expect(zMax - zMin).toBeLessThan(29);
});

test('the flat bottom option makes the toy a little shorter and can be switched off', async ({ page }) => {
  await placeBall(page);
  await openPrint(page);
  await expect(page.getByTestId('print-ready')).toBeVisible({ timeout: 30_000 });
  const height = async () => {
    const [d] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download the STL' }).click()]);
    const b = readFileSync((await d.path())!);
    let max = 0;
    for (let t = 0; t < b.readUInt32LE(80); t++) for (let v = 0; v < 3; v++) max = Math.max(max, b.readFloatLE(84 + t * 50 + 12 + v * 12 + 8));
    return max;
  };
  const flat = await height();
  await page.getByRole('button', { name: 'No', exact: true }).click();
  await expect(page.getByTestId('print-ready')).toBeVisible({ timeout: 30_000 });
  const round = await height();
  expect(round - flat).toBeGreaterThan(1);
  expect(round - flat).toBeLessThan(2);
});

test('a toy that is too big says so, offers Make it fit, and prints once it fits', async ({ page }) => {
  const downloads = watchDownloads(page);
  await placeBall(page);
  // blow it up to 130 mm through the real data (the drawing area only goes to 100)
  await page.evaluate(() => {
    const app = window.__sketch3d.app as unknown as { commit: (l: string, f: (d: { parts: { outline: number[][]; depthMm: number }[] }) => void) => boolean };
    app.commit('Make it big', (d) => {
      const p = d.parts[0];
      p.outline = p.outline.map(([x, y]) => [x * 4.6, y * 4.6]);
      p.depthMm = 130;
    });
  });
  await expect(page.getByTestId('size')).toHaveAttribute('data-toobig', 'true', { timeout: 15_000 });
  await expect(page.getByTestId('size')).toContainText('Too big');

  await openPrint(page);
  const issues = page.getByTestId('print-issues');
  await expect(issues.getByText('Your toy is too big for the printer.')).toBeVisible({ timeout: 40_000 });
  await expect(issues.getByText('Make it smaller.')).toBeVisible();
  expect(downloads).toEqual([]);

  await issues.getByRole('button', { name: 'Make it fit' }).click();
  await expect(page.getByTestId('print-ready')).toBeVisible({ timeout: 60_000 });
  const [d] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Download the STL' }).click()]);
  expect(d.suggestedFilename()).toBe('sketch3d-toy.stl');
});

test('a toy with parts floating apart is not offered for printing', async ({ page }) => {
  const downloads = watchDownloads(page);
  await placeBall(page, -110);
  await placeBall(page, 110);
  await openPrint(page);
  const issues = page.getByTestId('print-issues');
  await expect(issues.getByText('Some parts are floating apart from the rest.')).toBeVisible({ timeout: 30_000 });
  await expect(issues.getByRole('button', { name: 'Melt them together' })).toBeVisible();
  expect(downloads).toEqual([]);
});
