import { expect, test } from '@playwright/test';
import type { Page } from '@playwright/test';

test.beforeEach(async ({ page }) => {
  await page.setViewportSize({ width: 1280, height: 800 });
  await page.goto('/');
  await page.waitForFunction(() => !!window.__sketch3d);
});

const parts = (page: Page) => page.evaluate(() => window.__sketch3d.app.doc.value.parts.length);

async function canvasBox(page: Page, view: 'front' | 'side' = 'front') {
  const box = await page.getByTestId(`canvas-${view}`).boundingBox();
  if (!box) throw new Error('no canvas');
  return box;
}

/** Drag the mouse along a list of points (page coordinates). */
async function drag(page: Page, pts: [number, number][]) {
  await page.mouse.move(pts[0][0], pts[0][1]);
  await page.mouse.down();
  for (const [x, y] of pts.slice(1)) await page.mouse.move(x, y, { steps: 2 });
  await page.mouse.up();
}

const loop = (cx: number, cy: number, r: number, n = 40): [number, number][] =>
  Array.from({ length: n + 1 }, (_, i) => [cx + r * Math.cos((i / n) * 2 * Math.PI), cy + r * Math.sin((i / n) * 2 * Math.PI)]);

async function meshZRange(page: Page) {
  return page.evaluate(async () => {
    const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));
    for (let i = 0; i < 60 && !window.__sketch3d.latestMesh.value?.mesh.positions.length; i++) await wait(50);
    await wait(400); // let the newest mesh arrive
    const p = window.__sketch3d.latestMesh.value?.mesh.positions;
    if (!p || !p.length) return null;
    let lo = Infinity, hi = -Infinity;
    for (let i = 2; i < p.length; i += 3) {
      lo = Math.min(lo, p[i]);
      hi = Math.max(hi, p[i]);
    }
    return { lo, hi };
  });
}

test('drawing a loop with the Draw tool creates one part and selects it', async ({ page }) => {
  const b = await canvasBox(page);
  await page.getByTestId('tool-draw').click();
  await drag(page, loop(b.x + b.width / 2, b.y + b.height / 2, 70));
  expect(await parts(page)).toBe(1);
  const picked = await page.evaluate(() => [...window.__sketch3d.app.selection.value]);
  const id = await page.evaluate(() => window.__sketch3d.app.doc.value.parts[0].id);
  expect(picked).toEqual([id]);
  await expect(page.getByTestId('undo')).toBeEnabled();
});

test('a scribble creates no part and shows the friendly message', async ({ page }) => {
  const b = await canvasBox(page);
  await page.getByTestId('tool-draw').click();
  // a straight back-and-forth line has no inside
  const y = b.y + b.height / 2;
  await drag(page, [
    [b.x + 100, y], [b.x + 200, y + 2], [b.x + 120, y + 1], [b.x + 220, y + 2], [b.x + 140, y],
  ]);
  expect(await parts(page)).toBe(0);
  await expect(page.getByText('Draw a bigger, closed loop and try again.')).toBeVisible();
});

test('a tap with the Draw tool is not a shape and says nothing', async ({ page }) => {
  const b = await canvasBox(page);
  await page.getByTestId('tool-draw').click();
  await drag(page, [[b.x + 200, b.y + 200], [b.x + 202, b.y + 201], [b.x + 203, b.y + 202]]);
  expect(await parts(page)).toBe(0);
  await expect(page.locator('.toast')).toHaveCount(0);
});

test('a shape tool places a sphere with a tap, and a drag makes the size you drew', async ({ page }) => {
  const b = await canvasBox(page);
  await page.getByTestId('tool-shape:circle').click();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  expect(await parts(page)).toBe(1);
  const depth = await page.evaluate(() => (window.__sketch3d.app.doc.value.parts[0] as unknown as { depthMm: number }).depthMm);
  expect(depth).toBe(28); // a 28 mm circle is a 28 mm ball
});

test('Tail/arm in the Side view creates a part and the view stays Side', async ({ page }) => {
  await page.getByRole('button', { name: 'Side', exact: true }).click();
  expect(await page.evaluate(() => window.__sketch3d.app.view.value)).toBe('side');
  const b = await canvasBox(page, 'side');
  await page.getByTestId('tool-limb').click();
  await drag(page, [
    [b.x + b.width / 2 - 40, b.y + b.height / 2 + 60],
    [b.x + b.width / 2, b.y + b.height / 2],
    [b.x + b.width / 2 + 60, b.y + b.height / 2 - 40],
  ]);
  expect(await parts(page)).toBe(1);
  expect(await page.evaluate(() => window.__sketch3d.app.view.value)).toBe('side');
});

test('moving a part in the Side view changes its z, and the 3D mesh follows', async ({ page }) => {
  const b = await canvasBox(page);
  await page.getByTestId('tool-shape:circle').click();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2 - 60);
  const before = await meshZRange(page);
  const z0 = await page.evaluate(() => window.__sketch3d.app.doc.value.parts[0].z);

  await page.getByRole('button', { name: 'Side', exact: true }).click();
  await page.getByTestId('tool-select').click();
  const s = await canvasBox(page, 'side');
  // the ball is at the middle of the build area; drag it to the right (more depth)
  const start: [number, number] = [s.x + s.width / 2, s.y + s.height / 2 - 60];
  await drag(page, [start, [start[0] + 30, start[1]], [start[0] + 80, start[1]]]);

  const z1 = await page.evaluate(() => window.__sketch3d.app.doc.value.parts[0].z);
  expect(z1).toBeGreaterThan(z0 + 5);
  const after = await meshZRange(page);
  expect(before && after).toBeTruthy();
  expect(after!.hi).toBeGreaterThan(before!.hi + 3);
  expect(await page.evaluate(() => window.__sketch3d.app.view.value)).toBe('side');
});

test('moving a part is one undo step', async ({ page }) => {
  const b = await canvasBox(page);
  await page.getByTestId('tool-shape:circle').click();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await page.getByTestId('tool-select').click();
  const at: [number, number] = [b.x + b.width / 2, b.y + b.height / 2];
  const x0 = await page.evaluate(() => window.__sketch3d.app.doc.value.parts[0].outline[0][0]);
  await drag(page, [at, [at[0] + 20, at[1]], [at[0] + 50, at[1] + 10], [at[0] + 90, at[1] + 20]]);
  const x1 = await page.evaluate(() => window.__sketch3d.app.doc.value.parts[0].outline[0][0]);
  expect(x1).toBeGreaterThan(x0 + 5);
  await page.getByTestId('undo').click(); // undoes the move, keeps the ball
  expect(await parts(page)).toBe(1);
  expect(await page.evaluate(() => window.__sketch3d.app.doc.value.parts[0].outline[0][0])).toBeCloseTo(x0, 6);
});

test('Erase removes a part and offers Undo', async ({ page }) => {
  const b = await canvasBox(page);
  await page.getByTestId('tool-shape:circle').click();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await page.getByTestId('tool-erase').click();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  expect(await parts(page)).toBe(0);
  await page.getByRole('button', { name: 'Undo' }).filter({ hasText: 'Undo' }).last().click();
  expect(await parts(page)).toBe(1);
});

test('eyes come as a matching pair when symmetry is on', async ({ page }) => {
  const b = await canvasBox(page);
  await page.getByTestId('tool-eyes').click();
  await page.mouse.click(b.x + b.width / 2 + 60, b.y + b.height / 2);
  expect(await parts(page)).toBe(2);
  const xs = await page.evaluate(() => window.__sketch3d.app.doc.value.parts.map((p) => p.outline[0][0]));
  expect(xs[0] + 0).not.toBe(xs[1]);
});

test('a hole is cut through, not added', async ({ page }) => {
  const b = await canvasBox(page);
  await page.getByTestId('tool-hole:circle').click();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  expect(await page.evaluate(() => window.__sketch3d.app.doc.value.parts[0].cut)).toBe(true);
});

test('the crease tool carves a line', async ({ page }) => {
  const b = await canvasBox(page);
  await page.getByTestId('tool-shape:circle').click();
  await page.mouse.click(b.x + b.width / 2, b.y + b.height / 2);
  await page.getByTestId('tool-crease').click();
  await drag(page, [[b.x + b.width / 2 - 40, b.y + b.height / 2], [b.x + b.width / 2, b.y + b.height / 2 + 10], [b.x + b.width / 2 + 40, b.y + b.height / 2]]);
  expect(await page.evaluate(() => window.__sketch3d.app.doc.value.grooves.length)).toBe(1);
});

test.describe('the page never scrolls or zooms', () => {
  test('after dragging on the drawing and the 3D view', async ({ page }) => {
    const b = await canvasBox(page);
    await page.getByTestId('tool-draw').click();
    await drag(page, loop(b.x + b.width / 2, b.y + b.height / 2, 90));
    await page.mouse.wheel(0, 400).catch(() => {}); // mobile WebKit has no mouse wheel
    const state = await page.evaluate(() => ({
      scale: window.visualViewport?.scale ?? 1,
      top: document.scrollingElement?.scrollTop ?? 0,
      left: document.scrollingElement?.scrollLeft ?? 0,
      meta: document.querySelector('meta[name="viewport"]')?.getAttribute('content') ?? '',
      touchAction: getComputedStyle(document.querySelector('canvas')!).touchAction,
      overscroll: getComputedStyle(document.documentElement).overscrollBehaviorY,
    }));
    expect(state.scale).toBe(1);
    expect(state.top).toBe(0);
    expect(state.left).toBe(0);
    expect(state.meta).toMatch(/user-scalable=no/);
    expect(state.meta).toMatch(/maximum-scale=1/);
    expect(state.touchAction).toBe('none');
    if (state.overscroll !== undefined) expect(state.overscroll).toBe('none'); // older WebKit builds do not report it
  });
});

test.describe('fingers (Chromium touch)', () => {
  test.skip(({ browserName }) => browserName !== 'chromium', 'real two-finger touch needs the Chromium debugging protocol');

  async function fingers(page: Page) {
    const cdp = await page.context().newCDPSession(page); // one session, so the browser keeps track of the touches
    return (type: 'touchStart' | 'touchMove' | 'touchEnd', points: [number, number][]) =>
      cdp.send('Input.dispatchTouchEvent', { type, touchPoints: points.map(([x, y], id) => ({ x, y, id })) });
  }

  test('a second finger landing mid-stroke cancels the stroke without making a shape, and the page does not zoom', async ({ page }) => {
    const b = await canvasBox(page);
    await page.getByTestId('tool-draw').click();
    const cx = b.x + b.width / 2;
    const cy = b.y + b.height / 2;
    const ring = loop(cx, cy, 80, 24);
    const send = await fingers(page);
    const touch = (_p: Page, type: 'touchStart' | 'touchMove' | 'touchEnd', points: [number, number][]) => send(type, points);
    await touch(page, 'touchStart', [ring[0]]);
    for (const p of ring.slice(1, 12)) await touch(page, 'touchMove', [p]);
    // a second finger lands (a new touchStart that lists both fingers)
    await touch(page, 'touchStart', [ring[11], [cx + 150, cy + 150]]);
    await touch(page, 'touchMove', [ring[12], [cx + 160, cy + 160]]);
    await touch(page, 'touchMove', [ring[13], [cx + 170, cy + 170]]);
    for (const p of ring.slice(14)) await touch(page, 'touchMove', [p, [cx + 170, cy + 170]]);
    await touch(page, 'touchEnd', []);
    expect(await parts(page)).toBe(0);
    expect(await page.evaluate(() => window.visualViewport?.scale ?? 1)).toBe(1);
    expect(await page.evaluate(() => document.scrollingElement?.scrollTop ?? 0)).toBe(0);
  });
});
