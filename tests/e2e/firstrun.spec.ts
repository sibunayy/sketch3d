import { expect, test } from '@playwright/test';

// these tests are about the guide itself, so they start as a brand new visitor
test.use({ storageState: { cookies: [], origins: [] } });

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
});

test('first run shows the guide; after finishing it, a reload does not show it again', async ({ page }) => {
  await page.goto('/');
  const guide = page.getByRole('dialog', { name: 'How to make a toy' });
  await expect(guide).toBeVisible();
  await expect(guide.getByRole('heading', { name: 'Draw a shape' })).toBeVisible();

  await guide.getByRole('button', { name: 'Next' }).click();
  await expect(guide.getByRole('heading', { name: 'Pull it and turn it' })).toBeVisible();
  await guide.getByRole('button', { name: 'Back' }).click();
  await expect(guide.getByRole('heading', { name: 'Draw a shape' })).toBeVisible();
  await guide.getByRole('button', { name: 'Next' }).click();
  await guide.getByRole('button', { name: 'Next' }).click();
  await expect(guide.getByRole('heading', { name: 'Save to print' })).toBeVisible();
  await guide.getByRole('button', { name: 'Start making' }).click();
  await expect(guide).toBeHidden();

  await page.reload();
  await page.waitForFunction(() => !!window.__sketch3d);
  await expect(page.getByRole('dialog', { name: 'How to make a toy' })).toHaveCount(0);
});

test('Skip also finishes it for good', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('dialog', { name: 'How to make a toy' }).getByRole('button', { name: 'Skip' }).click();
  await page.reload();
  await page.waitForFunction(() => !!window.__sketch3d);
  await expect(page.getByRole('dialog', { name: 'How to make a toy' })).toHaveCount(0);
});

test('the Help button shows the guide again', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sketch3d.guide.done', '1'));
  await page.goto('/');
  await expect(page.getByRole('dialog', { name: 'How to make a toy' })).toHaveCount(0);
  await page.getByRole('button', { name: 'Help' }).click();
  await expect(page.getByRole('dialog', { name: 'How to make a toy' })).toBeVisible();
});

test('the one-time tip about the handles appears once, the first time a part is picked in 3D', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sketch3d.guide.done', '1'));
  await page.goto('/');
  await page.waitForFunction(() => !!window.__sketch3d);
  const b = (await page.getByTestId('canvas-front').boundingBox())!;
  await page.getByTestId('tool-shape:circle').click();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await expect(page.locator('.toast', { hasText: 'Drag an arrow to move' })).toBeVisible();
  expect(await page.evaluate(() => localStorage.getItem('sketch3d.tip.gizmo'))).toBe('1');

  await page.reload();
  await page.waitForFunction(() => !!window.__sketch3d);
  await page.evaluate(() => window.__sketch3d.app.select([]));
  await page.getByTestId('tool-select').click();
  const b2 = (await page.getByTestId('canvas-front').boundingBox())!;
  await page.mouse.click(b2.x + b2.width / 2, b2.y + b2.height / 2); // picks the saved ball again
  await expect(page.locator('.toast', { hasText: 'Drag an arrow to move' })).toHaveCount(0);
});

test('ready-made toys can be started from My toys', async ({ page }) => {
  await page.addInitScript(() => localStorage.setItem('sketch3d.guide.done', '1'));
  await page.goto('/');
  await page.waitForFunction(() => !!window.__sketch3d);
  await page.getByRole('button', { name: 'See my toys' }).click();
  const dialog = page.getByRole('dialog', { name: 'My toys' });
  await expect(dialog.getByText('Robo bot')).toBeVisible();
  await dialog.locator('li', { hasText: 'Robo bot' }).getByRole('button', { name: 'Use this one' }).click();
  await expect.poll(() => page.evaluate(() => window.__sketch3d.app.doc.value.parts.length)).toBe(8);
});
