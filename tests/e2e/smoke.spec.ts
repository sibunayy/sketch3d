import { test, expect } from '@playwright/test';

test('app boots', async ({ page }) => {
  const problems: string[] = [];
  page.on('pageerror', (e) => problems.push(`pageerror: ${e.message}`));
  page.on('console', (m) => {
    if (m.type() === 'error') problems.push(`console: ${m.text()}`);
  });

  await page.goto('/');

  expect(await page.title()).toBe('Sketch3D');
  await expect(page.locator('#app')).toBeVisible();
  expect(problems).toEqual([]);
});
