import { describe, expect, it } from 'vitest';
import { bbox } from '../../src/core/geom/bounds';
import { findCrossing, signedArea } from '../../src/core/geom/outline';
import { SHAPES, defaultThickness } from '../../src/core/geom/shapes';
import type { PartKind } from '../../src/core/doc/types';

const NAMES = ['circle', 'box', 'star', 'heart', 'egg', 'capsule', 'triangle', 'drop', 'moon'] as const;

describe('SHAPES', () => {
  it('has the nine ready-made shapes', () => {
    expect(Object.keys(SHAPES).sort()).toEqual([...NAMES].sort());
  });

  describe.each(NAMES)('%s', (name) => {
    const pts = SHAPES[name](10, -5, 40, 25);

    it('has at least 16 points and every point is a real number', () => {
      expect(pts.length).toBeGreaterThanOrEqual(16);
      expect(pts.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
    });

    it('is closed without repeating its first point, and does not cross itself', () => {
      const [a, b] = [pts[0], pts[pts.length - 1]];
      expect(Math.hypot(a[0] - b[0], a[1] - b[1])).toBeGreaterThan(1e-6);
      expect(findCrossing(pts)).toBeNull();
    });

    it('has a positive area (counter-clockwise)', () => {
      expect(signedArea(pts)).toBeGreaterThan(10);
    });

    it('fits exactly in the box it was asked for', () => {
      const b = bbox(pts);
      expect(b.x0).toBeCloseTo(10, 6);
      expect(b.y0).toBeCloseTo(-5, 6);
      expect(b.x1).toBeCloseTo(40, 6);
      expect(b.y1).toBeCloseTo(25, 6);
    });
  });

  it('a circle in a square box is round', () => {
    const pts = SHAPES.circle(-15, -15, 15, 15);
    for (const [x, y] of pts) expect(Math.hypot(x, y)).toBeCloseTo(15, 9);
  });

  it('shapes still work in a very thin box', () => {
    for (const name of NAMES) {
      const pts = SHAPES[name](0, 0, 40, 4);
      expect(pts.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
    }
  });
});

describe('defaultThickness', () => {
  const rect = (w: number, h: number) => SHAPES.box(0, 0, w, h);

  it('circle default is a sphere', () => {
    expect(defaultThickness('circle', SHAPES.circle(0, 0, 30, 30))).toEqual({ depthMm: 30, round: 1 });
  });

  it('a circle is capped between 8 and 80 mm', () => {
    expect(defaultThickness('circle', SHAPES.circle(0, 0, 3, 3)).depthMm).toBe(8);
    expect(defaultThickness('circle', SHAPES.circle(0, 0, 120, 120)).depthMm).toBe(80);
  });

  it('other shapes default to 0.7 of the narrowest side, clamped to 12–60 mm', () => {
    expect(defaultThickness('box', rect(40, 20)).depthMm).toBe(14);
    expect(defaultThickness('star', rect(5, 5)).depthMm).toBe(12);
    expect(defaultThickness('heart', rect(200, 200)).depthMm).toBe(60);
    expect(defaultThickness('draw', rect(100, 50)).depthMm).toBe(35);
  });

  it('other shapes are soft-edged by default', () => {
    const kinds: PartKind[] = ['box', 'star', 'draw', 'limb'];
    for (const k of kinds) expect(defaultThickness(k, rect(30, 30)).round).toBe(0.7);
  });
});
