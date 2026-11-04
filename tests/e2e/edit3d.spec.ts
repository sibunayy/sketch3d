import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await page.waitForFunction(() => !!window.__sketch3d);
});

/** Places a ball with the Shapes tool and waits for its 3D mesh. */
async function ballWithMesh(page: Page) {
  const b = (await page.getByTestId('canvas-front').boundingBox())!;
  await page.getByTestId('tool-shape:circle').click();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await page.waitForFunction(() => (window.__sketch3d.latestMesh.value?.mesh.positions.length ?? 0) > 300);
  await page.waitForTimeout(500); // let the finer mesh arrive
}

/** Where the middle of the first part is on the page, in the 3D view. */
async function ballOnScreen(page: Page) {
  return page.evaluate(() => {
    const p = window.__sketch3d.app.doc.value.parts[0];
    const xs = p.outline.map((q) => q[0]);
    const ys = p.outline.map((q) => q[1]);
    const c: [number, number, number] = [(Math.min(...xs) + Math.max(...xs)) / 2, (Math.min(...ys) + Math.max(...ys)) / 2, p.z];
    return window.__sketch3d.screenOf(c)!;
  });
}

const selected = (page: Page) => page.evaluate(() => window.__sketch3d.app.selection.value.size);

test('tapping a part in 3D selects it and shows the gizmo with Move active', async ({ page }) => {
  await ballWithMesh(page);
  await page.evaluate(() => window.__sketch3d.app.select([]));
  expect(await selected(page)).toBe(0);
  await expect(page.getByTestId('gizmo')).toHaveCount(0);

  const [x, y] = await ballOnScreen(page);
  await page.mouse.click(x, y);
  expect(await selected(page)).toBe(1);
  await expect(page.getByTestId('gizmo')).toHaveAttribute('data-active', 'move');
});

test('tapping empty space in 3D picks nothing', async ({ page }) => {
  await ballWithMesh(page);
  const r = (await page.locator('.three canvas').boundingBox())!;
  await page.mouse.click(r.x + 10, r.y + 10);
  expect(await selected(page)).toBe(0);
});

test('Sculpt mode hides the gizmo', async ({ page }) => {
  await ballWithMesh(page);
  await expect(page.getByTestId('gizmo')).toHaveCount(1); // the new ball is picked, so the handles are on show
  await page.getByRole('button', { name: 'Sculpt', exact: true }).click();
  await expect(page.getByTestId('gizmo')).toHaveCount(0);
  await page.getByRole('button', { name: 'Move', exact: true }).click();
  await expect(page.getByTestId('gizmo')).toHaveCount(1);
});

test('dragging an arrow moves the part, and the whole drag is one undo step', async ({ page }) => {
  await ballWithMesh(page);
  const before = await page.evaluate(() => window.__sketch3d.app.doc.value.parts[0].outline[0][0]);
  const [cx, cy] = await ballOnScreen(page);
  // the red arrow points along +x: grab it part way along
  const dist = await page.evaluate(() => window.__sketch3d.cameraDistance());
  const size = dist * 0.17;
  const p = await page.evaluate(([s]) => {
    const part = window.__sketch3d.app.doc.value.parts[0];
    const xs = part.outline.map((q) => q[0]);
    const ys = part.outline.map((q) => q[1]);
    return window.__sketch3d.screenOf([(Math.min(...xs) + Math.max(...xs)) / 2 + s * 0.7, (Math.min(...ys) + Math.max(...ys)) / 2, part.z])!;
  }, [size]);
  expect(Math.hypot(p[0] - cx, p[1] - cy)).toBeGreaterThan(20);

  await page.mouse.move(p[0], p[1]);
  await page.mouse.down();
  await page.mouse.move(p[0] + 30, p[1], { steps: 4 });
  await page.mouse.move(p[0] + 60, p[1], { steps: 4 });
  await page.mouse.up();
  const after = await page.evaluate(() => window.__sketch3d.app.doc.value.parts[0].outline[0][0]);
  expect(after).toBeGreaterThan(before + 3);

  await page.getByTestId('undo').click();
  expect(await page.evaluate(() => window.__sketch3d.app.doc.value.parts.length)).toBe(1);
  expect(await page.evaluate(() => window.__sketch3d.app.doc.value.parts[0].outline[0][0])).toBeCloseTo(before, 6);
});

test('sculpting adds dabs to the part, in one undo step', async ({ page }) => {
  await ballWithMesh(page);
  await page.getByRole('button', { name: 'Sculpt', exact: true }).click();
  const [x, y] = await ballOnScreen(page);
  await page.mouse.move(x - 20, y);
  await page.mouse.down();
  await page.mouse.move(x, y, { steps: 5 });
  await page.mouse.move(x + 20, y, { steps: 5 });
  await page.mouse.up();
  const dabs = await page.evaluate(() => window.__sketch3d.app.doc.value.dabs.length);
  expect(dabs).toBeGreaterThanOrEqual(1);
  await page.getByTestId('undo').click();
  expect(await page.evaluate(() => window.__sketch3d.app.doc.value.dabs.length)).toBe(0);
});

test('painting colours the part under the finger', async ({ page }) => {
  await ballWithMesh(page);
  const first = await page.evaluate(() => window.__sketch3d.app.doc.value.parts[0].color);
  await page.getByRole('button', { name: 'Paint', exact: true }).click();
  await page.getByLabel('3D view', { exact: true }).getByRole('button', { name: 'Colour 6' }).click();
  const [x, y] = await ballOnScreen(page);
  await page.mouse.click(x, y); // a tap is not taken by painting: drag a little instead
  await page.mouse.move(x - 5, y);
  await page.mouse.down();
  await page.mouse.move(x + 5, y, { steps: 3 });
  await page.mouse.up();
  const after = await page.evaluate(() => window.__sketch3d.app.doc.value.parts[0].color);
  expect(after).not.toBe(first);
  expect(after).toBe('#0091ff');
});

test('the Fill button colours the picked part', async ({ page }) => {
  await ballWithMesh(page);
  await page.getByRole('button', { name: 'Paint', exact: true }).click();
  await page.getByLabel('3D view', { exact: true }).getByRole('button', { name: 'Colour 4' }).click();
  await page.getByRole('button', { name: 'Fill the part' }).click();
  expect(await page.evaluate(() => window.__sketch3d.app.doc.value.parts[0].color)).toBe('#46a758');
});
