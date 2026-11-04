import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';
import { readFileSync } from 'node:fs';

const LEGACY = readFileSync('tests/fixtures/legacy-v2.json', 'utf8');

async function open(page: Page) {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await page.waitForFunction(() => !!window.__sketch3d);
}

async function placeBall(page: Page, dx = 0) {
  const b = (await page.getByTestId('canvas-front').boundingBox())!;
  await page.getByTestId('tool-shape:circle').click();
  await page.mouse.click(b.x + b.width / 2 + dx, b.y + b.height / 2);
}

const parts = (page: Page) => page.evaluate(() => window.__sketch3d.app.doc.value.parts.length);
const saved = (page: Page) => expect(page.getByTestId('savestatus')).toHaveText('Saved', { timeout: 8000 });

test('reload restores the last toy, with the selection cleared and the camera reset', async ({ page }) => {
  await open(page);
  await placeBall(page);
  await placeBall(page, 80);
  await saved(page);

  await page.reload();
  await page.waitForFunction(() => !!window.__sketch3d);
  await expect.poll(() => parts(page), { timeout: 8000 }).toBe(2);
  expect(await page.evaluate(() => window.__sketch3d.app.selection.value.size)).toBe(0);
  expect(await page.evaluate(() => window.__sketch3d.cameraDistance())).toBeGreaterThan(0);
});

test('the status shows Saving and then Saved', async ({ page }) => {
  await open(page);
  await placeBall(page);
  await saved(page);
  await expect(page.getByTestId('savestatus')).toHaveAttribute('data-status', 'saved');
});

test.describe("the prototype's toy", () => {
  test.beforeEach(async ({ page }) => {
    await page.addInitScript((legacy) => {
      // plant the prototype's save once, as the old app would have left it
      if (!localStorage.getItem('sketch3d.planted')) {
        localStorage.setItem('sketch3d.v2', legacy);
        localStorage.setItem('sketch3d.planted', '1');
      }
    }, LEGACY);
  });

  test("localStorage 'sketch3d.v2' is imported once and then marked done", async ({ page }) => {
    await open(page);
    await expect.poll(() => parts(page), { timeout: 8000 }).toBe(6);
    expect(await page.evaluate(() => localStorage.getItem('sketch3d.v2.imported'))).toBe('1');
    await saved(page);

    // take one part away, as a child might
    await page.evaluate(() => {
      const app = window.__sketch3d.app as unknown as { commit: (label: string, f: (d: { parts: { id: string }[]; dabs: { partId: string }[] }) => void) => boolean };
      app.commit('Delete', (d) => {
        const gone = d.parts.pop()!;
        d.dabs = d.dabs.filter((x) => x.partId !== gone.id); // sculpting goes with its part
      });
    });
    expect(await parts(page)).toBe(5);
    await saved(page);

    await page.reload();
    await page.waitForFunction(() => !!window.__sketch3d);
    await expect.poll(() => parts(page), { timeout: 8000 }).toBe(5); // the old toy did not come back
  });
});

test('when storage is blocked the app still works, says so, and tells the child what to do', async ({ page }) => {
  await page.addInitScript(() => {
    Object.defineProperty(window, 'indexedDB', {
      get() {
        throw new DOMException('Storage is turned off', 'SecurityError');
      },
    });
  });
  await open(page);
  await placeBall(page);
  expect(await parts(page)).toBe(1); // drawing works
  await expect(page.getByTestId('savestatus')).toHaveText('Not saved', { timeout: 8000 });
  await expect(page.getByText("Your work can't be saved on this device. Tap Save to keep a copy.")).toBeVisible();
});

test('My toys lists saved toys, makes a new one, and opens an old one again', async ({ page }) => {
  await open(page);
  await placeBall(page);
  await saved(page);

  await page.getByRole('button', { name: 'My toys' }).click();
  const dialog = page.getByRole('dialog', { name: 'My toys' });
  await expect(dialog.getByText('1 parts')).toBeVisible();
  await dialog.getByRole('button', { name: 'Make a new toy' }).click();
  expect(await parts(page)).toBe(0);

  await page.getByRole('button', { name: 'My toys' }).click();
  // the newest toy (the empty one) is first; open the one with a part in it
  const saved1 = page.getByRole('dialog', { name: 'My toys' }).locator('li', { hasText: '1 parts' });
  await saved1.getByRole('button', { name: 'Open' }).click();
  await expect.poll(() => parts(page)).toBe(1);
});

test('deleting a toy asks first', async ({ page }) => {
  await open(page);
  await placeBall(page);
  await saved(page);
  await page.getByRole('button', { name: 'My toys' }).click();
  const dialog = page.getByRole('dialog', { name: 'My toys' });
  await dialog.getByRole('button', { name: 'Delete this toy' }).click();
  await dialog.getByRole('button', { name: 'Keep it' }).click();
  await expect(dialog.getByText('1 parts')).toBeVisible();
  await dialog.getByRole('button', { name: 'Delete this toy' }).click();
  await dialog.getByRole('button', { name: 'Yes, delete it' }).click();
  await expect(dialog.getByText('No saved toys yet. Your work saves by itself.')).toBeVisible();
});

test('a toy saved to a file opens again from that file, and a wrong file gets a friendly message', async ({ page }) => {
  await open(page);
  await placeBall(page);
  await placeBall(page, 90);
  await saved(page);

  const [download] = await Promise.all([page.waitForEvent('download'), page.getByRole('button', { name: 'Save a file' }).click()]);
  expect(download.suggestedFilename()).toMatch(/\.sketch3d\.json$/);
  const path = await download.path();
  expect(path).toBeTruthy();

  await page.getByRole('button', { name: 'My toys' }).click();
  await page.getByRole('dialog', { name: 'My toys' }).getByRole('button', { name: 'Make a new toy' }).click();
  expect(await parts(page)).toBe(0);

  await page.getByRole('button', { name: 'My toys' }).click();
  await page.locator('input[type="file"]').setInputFiles(path!);
  await expect.poll(() => parts(page)).toBe(2);

  await page.getByRole('button', { name: 'My toys' }).click();
  await page.locator('input[type="file"]').setInputFiles({ name: 'notes.txt', mimeType: 'text/plain', buffer: Buffer.from('hello') });
  await expect(page.getByText("That file isn't a Sketch3D toy.")).toBeVisible();
  expect(await parts(page)).toBe(2); // nothing was lost
});
