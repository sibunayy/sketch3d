import { describe, expect, it } from 'vitest';
import { ViewTransform } from '../../src/views2d/viewTransform';
import type { Vec2 } from '../../src/core/geom/vec';

function rng(seed = 5) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

describe('ViewTransform', () => {
  it('screenToWorld inverts worldToScreen', () => {
    const r = rng();
    const vt = new ViewTransform();
    vt.zoomAt([200, 100], 1.7);
    vt.pan(33, -12);
    for (let i = 0; i < 100; i++) {
      const w: Vec2 = [(r() - 0.5) * 200, (r() - 0.5) * 200];
      const back = vt.screenToWorld(vt.worldToScreen(w));
      expect(back[0]).toBeCloseTo(w[0], 8);
      expect(back[1]).toBeCloseTo(w[1], 8);
    }
  });

  it('y goes up on the page: a higher world y is higher on the screen (smaller screen y)', () => {
    const vt = new ViewTransform();
    expect(vt.worldToScreen([0, 10])[1]).toBeLessThan(vt.worldToScreen([0, 0])[1]);
  });

  it('zoomAt keeps the point under the finger fixed', () => {
    const r = rng(9);
    const vt = new ViewTransform();
    for (let i = 0; i < 30; i++) {
      const finger: Vec2 = [r() * 800, r() * 600];
      const under = vt.screenToWorld(finger);
      vt.zoomAt(finger, 0.6 + r() * 1.2);
      const after = vt.worldToScreen(under);
      expect(after[0]).toBeCloseTo(finger[0], 6);
      expect(after[1]).toBeCloseTo(finger[1], 6);
    }
  });

  it('zoom stays between a minimum and a maximum', () => {
    const vt = new ViewTransform();
    for (let i = 0; i < 100; i++) vt.zoomAt([0, 0], 2);
    const big = vt.scale;
    for (let i = 0; i < 100; i++) vt.zoomAt([0, 0], 2);
    expect(vt.scale).toBe(big);
    for (let i = 0; i < 400; i++) vt.zoomAt([0, 0], 0.5);
    const small = vt.scale;
    for (let i = 0; i < 100; i++) vt.zoomAt([0, 0], 0.5);
    expect(vt.scale).toBe(small);
    expect(small).toBeGreaterThan(0);
  });

  it('ignores nonsense zoom factors', () => {
    const vt = new ViewTransform();
    const s = vt.scale;
    vt.zoomAt([0, 0], NaN);
    vt.zoomAt([0, 0], 0);
    vt.zoomAt([0, 0], -2);
    expect(vt.scale).toBe(s);
  });

  it('pan moves the picture by the same number of pixels', () => {
    const vt = new ViewTransform();
    const before = vt.worldToScreen([5, 5]);
    vt.pan(20, -7);
    const after = vt.worldToScreen([5, 5]);
    expect(after[0] - before[0]).toBeCloseTo(20, 9);
    expect(after[1] - before[1]).toBeCloseTo(-7, 9);
  });

  it('fit puts a box in the middle of the screen with room around it', () => {
    const vt = new ViewTransform();
    vt.fit({ x0: -55, y0: 0, x1: 55, y1: 110 }, 800, 600);
    const bl = vt.worldToScreen([-55, 0]);
    const tr = vt.worldToScreen([55, 110]);
    expect(bl[0]).toBeGreaterThan(0);
    expect(tr[0]).toBeLessThan(800);
    expect(tr[1]).toBeGreaterThan(0);
    expect(bl[1]).toBeLessThan(600);
    expect((bl[0] + tr[0]) / 2).toBeCloseTo(400, 6);
    expect((bl[1] + tr[1]) / 2).toBeCloseTo(300, 6);
  });
});
