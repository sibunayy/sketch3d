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

test.describe('top bar', () => {
  // 1024 wide leaves room on every machine. At 820 the bar fits with some fonts and wraps with wider ones.
  test.use({ viewport: { width: 1024, height: 768 } });

  test('stays on one row on an iPad, and See more holds Add an STL file and Help', async ({ page }) => {
    await page.goto('/');
    const bar = (await page.locator('.topbar').boundingBox())!;
    expect(bar.height).toBeLessThan(90); // one row, not two
    await expect(page.getByRole('button', { name: 'Add an STL file' })).toBeHidden();
    await page.getByRole('button', { name: 'See more', exact: true }).click();
    await expect(page.getByRole('button', { name: 'Add an STL file' })).toBeVisible();
    await expect(page.getByRole('button', { name: 'Help' })).toBeVisible();
    await page.getByRole('button', { name: 'Close' }).click();
    await expect(page.getByRole('button', { name: 'Help' })).toBeHidden();
  });
});

test('wide screens keep Add an STL file and Help in the top bar, with no See more button', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await expect(page.getByRole('button', { name: 'Add an STL file' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Help' })).toBeVisible();
  await expect(page.getByRole('button', { name: 'See more', exact: true })).toBeHidden();
});

test('a row of buttons that scrolls sideways fades at the edge that has more, and a row that fits does not', async ({ page }) => {
  await page.setViewportSize({ width: 1024, height: 768 });
  await page.goto('/');
  const row = page.locator('.pane-3d .picker');
  await expect(row).toHaveAttribute('data-fade-end', 'true'); // the 3D view buttons do not all fit
  await expect(row).toHaveAttribute('data-fade-start', 'false');
  await row.evaluate((el) => (el.scrollLeft = el.scrollWidth));
  await expect(row).toHaveAttribute('data-fade-end', 'false');
  await expect(row).toHaveAttribute('data-fade-start', 'true');

  await page.setViewportSize({ width: 1366, height: 768 });
  await expect(row).toHaveAttribute('data-fade-end', 'false'); // wide enough now
});

test('the shape group in the settings bar shows all its choices, none cut off', async ({ page }) => {
  await page.setViewportSize({ width: 1180, height: 820 });
  await page.goto('/');
  const b = (await page.getByTestId('canvas-front').boundingBox())!;
  await page.getByTestId('tool-shape:circle').click();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  const group = page.getByRole('group', { name: 'How round?' });
  await expect(group).toBeVisible();
  const clipped = await group.evaluate((el) => [...el.querySelectorAll('button')].filter((x) => x.scrollWidth > x.clientWidth + 1).length);
  expect(clipped).toBe(0);
  const box = (await group.boundingBox())!;
  const widest = await group.evaluate((el) => [...el.querySelectorAll('button')].reduce((n, x) => n + x.scrollWidth, 0));
  expect(box.width).toBeGreaterThanOrEqual(widest);
});

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
