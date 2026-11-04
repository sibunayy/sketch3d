import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await page.waitForFunction(() => !!window.__sketch3d);
});

async function placeBall(page: Page, dx = 0, dy = 0) {
  const b = (await page.getByTestId('canvas-front').boundingBox())!;
  await page.getByTestId('tool-shape:circle').click();
  await page.mouse.click(b.x + b.width / 2 + dx, b.y + b.height / 2 + dy);
}

const depths = (page: Page) => page.evaluate(() => window.__sketch3d.app.doc.value.parts.map((p) => p.depthMm));

/** The 3D mesh's size front to back, once the mesher has caught up. */
async function meshDepth(page: Page, atLeast = 0) {
  return page.evaluate(async (min) => {
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    let best = 0;
    for (let i = 0; i < 40; i++) {
      const p = window.__sketch3d.latestMesh.value?.mesh.positions;
      if (p && p.length) {
        let lo = Infinity, hi = -Infinity;
        for (let k = 2; k < p.length; k += 3) {
          lo = Math.min(lo, p[k]);
          hi = Math.max(hi, p[k]);
        }
        best = hi - lo;
        if (best >= min) break;
      }
      await wait(60);
    }
    return best;
  }, atLeast);
}

test('a new circle is a sphere and the thickness slider reads its diameter', async ({ page }) => {
  await placeBall(page);
  const slider = page.locator('.contextbar').getByLabel('How thick?');
  await expect(slider).toHaveValue('28');
  await expect(page.locator('.contextbar').locator('label', { hasText: 'How thick?' }).locator('strong')).toHaveText('28 mm');
  expect((await meshDepth(page, 20))).toBeGreaterThan(24); // about 28 mm front to back, like its width
});

test('dragging the thickness slider updates the 3D mesh live and makes one undo step on release', async ({ page }) => {
  await placeBall(page);
  const slider = page.locator('.contextbar').getByLabel('How thick?');
  const box = (await slider.boundingBox())!;
  const at = (v: number) => box.x + 24 + ((v - 2) / 78) * (box.width - 48);
  const y = box.y + box.height / 2;

  await page.mouse.move(at(28), y);
  await page.mouse.down();
  await page.mouse.move(at(50), y, { steps: 6 });
  // still holding: the toy already shows the new thickness, in both the data and the 3D picture
  const during = (await depths(page))[0];
  expect(during).toBeGreaterThan(40);
  expect(await meshDepth(page, 40)).toBeGreaterThan(40);
  await page.mouse.up();

  const after = (await depths(page))[0];
  expect(after).toBeGreaterThan(40);
  await page.getByTestId('undo').click(); // one click takes the whole drag back
  expect((await depths(page))[0]).toBe(28);
  expect(await page.evaluate(() => window.__sketch3d.app.doc.value.parts.length)).toBe(1);
});

test('with several parts picked, a change applies to all of them in one step, and different values read Mixed', async ({ page }) => {
  await placeBall(page, -60, 0);
  await placeBall(page, 60, 0);
  // make them differ
  await page.evaluate(() => {
    // the second ball is already the picked one; thicken it a little through the real controls instead of the data
  });
  await page.locator('.contextbar').getByLabel('How thick?').fill('50');
  expect(await depths(page)).toEqual([28, 50]);

  await page.getByRole('button', { name: 'Pick several' }).click();
  await page.getByRole('button', { name: 'Circle 1' }).click();
  expect(await page.evaluate(() => window.__sketch3d.app.selection.value.size)).toBe(2);
  await expect(page.locator('.contextbar').locator('label', { hasText: 'How thick?' }).locator('strong')).toHaveText('Mixed');

  await page.getByRole('button', { name: 'Square' }).click();
  expect(await page.evaluate(() => window.__sketch3d.app.doc.value.parts.map((p) => p.round))).toEqual([0.04, 0.04]);
  await page.getByTestId('undo').click();
  expect(await page.evaluate(() => window.__sketch3d.app.doc.value.parts.map((p) => p.round))).toEqual([1, 1]);
});

test('tapping nothing hides the settings and shows the parts list', async ({ page }) => {
  await placeBall(page);
  await expect(page.locator('.contextbar').getByLabel('How thick?')).toBeVisible();
  await page.getByTestId('tool-select').click();
  const b = (await page.getByTestId('canvas-front').boundingBox())!;
  await page.mouse.click(b.x + 20, b.y + 20);
  await expect(page.locator('.contextbar').getByLabel('How thick?')).toBeHidden();
  await expect(page.getByText('Tap a part to change it.')).toBeVisible();
});

test('colour, copy and delete work, and delete can be undone', async ({ page }) => {
  await placeBall(page);
  await page.getByRole('button', { name: 'Colour', exact: true }).click(); // the Colour tab of the context bar
  await page.getByRole('button', { name: 'Colour 6' }).click();
  await page.getByRole('button', { name: 'Make a copy' }).click();
  expect(await page.evaluate(() => window.__sketch3d.app.doc.value.parts.length)).toBe(2);
  await page.getByRole('button', { name: 'Delete' }).click();
  expect(await page.evaluate(() => window.__sketch3d.app.doc.value.parts.length)).toBe(1);
  await page.getByRole('button', { name: 'Undo' }).last().click();
  expect(await page.evaluate(() => window.__sketch3d.app.doc.value.parts.length)).toBe(2);
});

test('on a narrow screen the settings open in a sheet', async ({ page }) => {
  await page.setViewportSize({ width: 820, height: 1180 });
  await placeBall(page);
  await page.getByRole('button', { name: 'Edit this part' }).click();
  const slider = page.locator('.sheet').getByLabel('How thick?');
  await expect(slider).toBeVisible();
  const box = (await slider.boundingBox())!;
  expect(box.y + box.height).toBeLessThanOrEqual(1180);
});

test('the settings sit in a bar under the toy, one group at a time, and the shape group shows first', async ({ page }) => {
  await placeBall(page);
  const bar = page.locator('.contextbar');
  const canvas = (await page.getByTestId('canvas-front').boundingBox())!;
  const barBox = (await bar.boundingBox())!;
  expect(barBox.y).toBeGreaterThanOrEqual(canvas.y + canvas.height - 1); // under the drawing, not off to the side
  expect(barBox.width).toBeGreaterThan(900); // the whole width, so it is hard to miss

  await expect(bar.getByLabel('How thick?')).toBeVisible();
  await expect(bar.getByLabel('Spin like a wheel')).toHaveCount(0);
  await bar.getByRole('button', { name: 'Turn', exact: true }).click();
  await expect(bar.getByLabel('Spin like a wheel')).toBeVisible();
  await expect(bar.getByLabel('Turn left or right')).toBeVisible();
  await expect(bar.getByLabel('Nod up or down')).toBeVisible();
  await bar.getByRole('button', { name: 'Stretch' }).click();
  await expect(bar.getByLabel('Squash and stretch')).toBeVisible();
  await bar.getByRole('button', { name: 'Melt' }).click();
  await expect(bar.getByRole('button', { name: 'A little' })).toBeVisible();
});

test('with nothing picked the bar says what to do and the group buttons are switched off', async ({ page }) => {
  const bar = page.locator('.contextbar');
  await expect(bar.getByText('Tap a part to change it.')).toBeVisible();
  await expect(bar.getByRole('button', { name: 'Shape' })).toBeDisabled();
});

test('the bar keeps the same height whichever group is open, so the toy does not jump', async ({ page }) => {
  await placeBall(page);
  const bar = page.locator('.contextbar');
  const heights: number[] = [];
  for (const name of ['Shape', 'Stretch', 'Turn', 'Melt', 'Colour']) {
    await bar.getByRole('button', { name, exact: true }).click();
    heights.push((await bar.boundingBox())!.height);
  }
  expect(Math.max(...heights) - Math.min(...heights)).toBeLessThanOrEqual(2);
});
