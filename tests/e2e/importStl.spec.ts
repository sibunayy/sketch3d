import { expect, test } from '@playwright/test';

/** A 30 x 20 x 10 mm box as a binary STL. */
function boxStl(): Buffer {
  const v = [[0, 0, 0], [30, 0, 0], [30, 20, 0], [0, 20, 0], [0, 0, 10], [30, 0, 10], [30, 20, 10], [0, 20, 10]];
  const f = [[0, 3, 2], [0, 2, 1], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [2, 3, 7], [2, 7, 6], [1, 2, 6], [1, 6, 5], [3, 0, 4], [3, 4, 7]];
  const b = Buffer.alloc(84 + 50 * f.length);
  b.writeUInt32LE(f.length, 80);
  f.forEach((t, i) => t.forEach((vi, j) => v[vi].forEach((x, k) => b.writeFloatLE(x, 84 + i * 50 + 12 + (j * 3 + k) * 4))));
  return b;
}

for (const vp of [{ width: 820, height: 1180 }, { width: 1280, height: 650 }]) {
  test.describe(`${vp.width}x${vp.height}`, () => {
    test.use({ viewport: vp });

    test('the Add an STL file button is big enough and fully on screen', async ({ page }) => {
      await page.goto('/');
      const box = (await page.getByRole('button', { name: 'Add an STL file' }).boundingBox())!;
      expect(box.height).toBeGreaterThanOrEqual(48);
      expect(box.x).toBeGreaterThanOrEqual(0);
      expect(box.x + box.width).toBeLessThanOrEqual(vp.width);
    });

    test('a good file becomes a part, and a bad file shows a message', async ({ page }) => {
      await page.goto('/');
      await page.getByTestId('stl-input').setInputFiles({ name: 'box.stl', mimeType: 'model/stl', buffer: boxStl() });
      await expect(page.getByText('Added your shape.')).toBeVisible({ timeout: 15000 });
      await page.getByTestId('stl-input').setInputFiles({ name: 'bad.stl', mimeType: 'model/stl', buffer: Buffer.from('not a shape') });
      await expect(page.getByText("That file isn't a 3D shape we can open", { exact: false })).toBeVisible();
      await expect(page.getByTestId('undo')).toBeEnabled();
    });
  });
}

test('a shape from a file has no Shape or Stretch settings', async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await page.getByTestId('stl-input').setInputFiles({ name: 'box.stl', mimeType: 'model/stl', buffer: boxStl() });
  await expect(page.getByText('Added your shape.')).toBeVisible({ timeout: 15000 });
  await expect(page.getByRole('button', { name: 'Turn', exact: true }).last()).toBeVisible();
  await expect(page.getByRole('button', { name: 'Stretch', exact: true })).toHaveCount(0);
});
