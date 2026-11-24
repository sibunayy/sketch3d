import { expect, test } from '@playwright/test';

const VIEWPORTS = [
  { width: 1180, height: 820 },
  { width: 820, height: 1180 },
  { width: 1024, height: 768 },
  { width: 1280, height: 650 },
  { width: 1366, height: 768 },
];

for (const vp of VIEWPORTS) {
  test.describe(`${vp.width}x${vp.height}`, () => {
    test.use({ viewport: vp });

    test('Undo and Redo are visible, at least 48x48 px, and fully on screen', async ({ page }) => {
      await page.goto('/');
      for (const id of ['undo', 'redo']) {
        const button = page.getByTestId(id);
        await expect(button).toBeVisible();
        const box = (await button.boundingBox())!;
        expect(box.width).toBeGreaterThanOrEqual(48);
        expect(box.height).toBeGreaterThanOrEqual(48);
        expect(box.x).toBeGreaterThanOrEqual(0);
        expect(box.y).toBeGreaterThanOrEqual(0);
        expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
        expect(box.y + box.height).toBeLessThanOrEqual(vp.height);
      }
    });

    test('every button on the screen is at least 48 px in its smaller side', async ({ page }) => {
      await page.goto('/');
      const small = await page.evaluate(() =>
        [...document.querySelectorAll('button, input[type="range"]')]
          .filter((el) => (el as HTMLElement).offsetParent !== null)
          .map((el) => {
            const r = el.getBoundingClientRect();
            return { text: (el.textContent || el.getAttribute('aria-label') || el.tagName).trim().slice(0, 30), w: r.width, h: r.height };
          })
          .filter((b) => Math.min(b.w, b.h) < 47.5),
      );
      expect(small).toEqual([]);
    });

    test('the page does not scroll sideways or get cut off', async ({ page }) => {
      await page.goto('/');
      const overflow = await page.evaluate(() => ({
        x: document.documentElement.scrollWidth - document.documentElement.clientWidth,
        y: document.documentElement.scrollHeight - document.documentElement.clientHeight,
      }));
      expect(overflow.x).toBeLessThanOrEqual(0);
      expect(overflow.y).toBeLessThanOrEqual(0);
    });
  });
}

// iPads in both directions: nobody should have to switch between the drawing and the 3D view
const TABLETS = [
  { width: 1180, height: 820 },
  { width: 1024, height: 768 },
  { width: 820, height: 1180 },
  { width: 768, height: 1024 },
];
for (const vp of TABLETS) {
  test(`${vp.width}x${vp.height}: the drawing and the 3D view are both on screen and big enough to use`, async ({ page }) => {
    await page.setViewportSize(vp);
    await page.goto('/');
    await expect(page.getByLabel('Drawing view')).toBeVisible();
    await expect(page.getByLabel('3D view', { exact: true })).toBeVisible();
    await expect(page.getByRole('button', { name: 'See in 3D' })).toBeHidden();
    const draw = (await page.locator('.draw-canvas').boundingBox())!;
    const three = (await page.locator('.three canvas').boundingBox())!;
    expect(Math.min(draw.width, draw.height)).toBeGreaterThanOrEqual(240);
    expect(Math.min(three.width, three.height)).toBeGreaterThanOrEqual(200);
    // Undo and Redo stay over the drawing, never over the 3D view
    const undo = (await page.getByTestId('undo').boundingBox())!;
    expect(undo.y + undo.height).toBeLessThanOrEqual(draw.y + draw.height + 96);
    if (vp.width > vp.height) expect(undo.x + undo.width).toBeLessThanOrEqual(three.x);
    else expect(undo.y + undo.height).toBeLessThanOrEqual(three.y);
    // the part settings are still one tap away
    const settings = vp.width >= 1100 ? page.locator('.contextbar') : page.getByRole('button', { name: 'Edit this part' });
    await expect(settings).toBeVisible();
  });
}

test('wide screens show the drawing and the 3D view together, phones one at a time', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await expect(page.getByLabel('Drawing view')).toBeVisible();
  await expect(page.getByLabel('3D view', { exact: true })).toBeVisible();

  await page.setViewportSize({ width: 430, height: 900 });
  await expect(page.getByLabel('Drawing view')).toBeVisible();
  await expect(page.getByLabel('3D view', { exact: true })).toBeHidden();
  await page.getByRole('button', { name: 'See in 3D' }).click();
  await expect(page.getByLabel('3D view', { exact: true })).toBeVisible();
  await expect(page.getByLabel('Drawing view')).toBeHidden();
  // Undo and Redo stay visible in the 3D view too
  await expect(page.getByTestId('undo')).toBeVisible();
});

test('Undo and Redo start switched off on a new toy', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByTestId('undo')).toBeDisabled();
  await expect(page.getByTestId('redo')).toBeDisabled();
});
