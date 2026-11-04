import { expect, test } from '@playwright/test';

type Stats = { colours: number; nonBackground: number; total: number };
type Api = {
  show(): Promise<Stats>;
  stats(): Stats;
  loseContext(): void;
  isLost(): boolean;
};
declare global {
  interface Window {
    sketch3dRenderTest: Api;
  }
}

test.beforeEach(async ({ page }) => {
  await page.goto('/dev/render.html');
  await page.waitForFunction(() => document.title === 'ready');
});

test('the canvas renders a non-blank frame for the preset character', async ({ page }) => {
  const s = await page.evaluate(() => window.sketch3dRenderTest.show());
  expect(s.nonBackground).toBeGreaterThan(s.total * 0.02); // something is drawn
  expect(s.colours).toBeGreaterThan(10); // not one flat colour: shading and part colours
});

test('after the 3D is lost the page says so, and tapping brings it back', async ({ page }) => {
  await page.evaluate(() => window.sketch3dRenderTest.show());
  await page.evaluate(() => window.sketch3dRenderTest.loseContext());
  const button = page.getByRole('button', { name: 'The 3D view stopped. Tap to restart it.' });
  await expect(button).toBeVisible();
  expect(await page.evaluate(() => window.sketch3dRenderTest.isLost())).toBe(true);

  await button.click();
  await expect(button).toBeHidden();
  expect(await page.evaluate(() => window.sketch3dRenderTest.isLost())).toBe(false);
  const s = await page.evaluate(() => window.sketch3dRenderTest.stats());
  expect(s.total).toBeGreaterThan(0);
});
