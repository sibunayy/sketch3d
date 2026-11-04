import { describe, expect, it } from 'vitest';
import {
  chaikin,
  dedupeClose,
  findCrossing,
  repairOutline,
  resampleClosed,
  signedArea,
  smoothStroke,
  strokeToOutline,
} from '../../src/core/geom/outline';
import { bbox } from '../../src/core/geom/bounds';
import type { Vec2 } from '../../src/core/geom/vec';

const circle = (r: number, n = 120, cx = 0, cy = 0): Vec2[] =>
  Array.from({ length: n }, (_, i) => [cx + r * Math.cos((i / n) * 2 * Math.PI), cy + r * Math.sin((i / n) * 2 * Math.PI)]);

/** Deterministic wobble so tests do not depend on Math.random. */
const wobble = (pts: Vec2[], amount: number): Vec2[] =>
  pts.map(([x, y], i) => [x + amount * Math.sin(i * 12.9898), y + amount * Math.cos(i * 78.233)]);

/** A figure-eight drawn in one stroke: two fat lobes that cross in the middle. */
const figureEight = (n = 200): Vec2[] =>
  Array.from({ length: n }, (_, i) => {
    const t = (i / n) * 2 * Math.PI;
    return [40 * Math.cos(t), 30 * Math.sin(2 * t)];
  });

describe('basic outline maths', () => {
  it('signedArea is positive for counter-clockwise and negative for clockwise', () => {
    const sq: Vec2[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    expect(signedArea(sq)).toBeCloseTo(100, 9);
    expect(signedArea([...sq].reverse())).toBeCloseTo(-100, 9);
    expect(signedArea([])).toBe(0);
  });

  it('bbox covers the points', () => {
    const b = bbox([[1, 2], [5, -3], [2, 9]]);
    expect([b.x0, b.y0, b.x1, b.y1, b.w, b.h, b.cx, b.cy]).toEqual([1, -3, 5, 9, 4, 12, 3, 3]);
  });

  it('resampleClosed gives n evenly spaced points on the same loop', () => {
    const out = resampleClosed(circle(10, 400), 50);
    expect(out).toHaveLength(50);
    for (const [x, y] of out) expect(Math.hypot(x, y)).toBeGreaterThan(9.97);
    const gaps = out.map((p, i) => Math.hypot(p[0] - out[(i + 1) % 50][0], p[1] - out[(i + 1) % 50][1]));
    expect(Math.max(...gaps) - Math.min(...gaps)).toBeLessThan(0.05);
  });

  it('resampleClosed copes with tiny inputs', () => {
    expect(resampleClosed([], 10)).toEqual([]);
    expect(resampleClosed([[1, 1]], 3)).toHaveLength(3);
  });

  it('chaikin rounds corners but keeps the loop closed and inside the box', () => {
    const sq: Vec2[] = [[0, 0], [10, 0], [10, 10], [0, 10]];
    const out = chaikin(sq, 2);
    expect(out.length).toBe(16);
    // no point is left on a sharp corner, and nothing sticks out of the original box
    for (const corner of sq) expect(out.some(([x, y]) => x === corner[0] && y === corner[1])).toBe(false);
    const b = bbox(out);
    expect(b.x0).toBeGreaterThanOrEqual(0);
    expect(b.x1).toBeLessThanOrEqual(10);
  });

  it('dedupeClose removes repeated points and a repeated closing point', () => {
    expect(dedupeClose([[0, 0], [0, 0], [1, 0], [1, 1], [0, 0]], 0.01)).toEqual([[0, 0], [1, 0], [1, 1]]);
  });
});

describe('findCrossing', () => {
  it('finds a bow-tie crossing and none on a clean loop', () => {
    expect(findCrossing([[0, 0], [10, 10], [10, 0], [0, 10]])).not.toBeNull();
    expect(findCrossing(circle(10))).toBeNull();
  });
});

describe('smoothStroke', () => {
  it('turns a wobbly hand-drawn circle into a smooth, closed, untwisted loop', () => {
    const raw = wobble(circle(20, 90), 0.6);
    const out = smoothStroke(raw)!;
    expect(out).not.toBeNull();
    expect(out.length).toBeGreaterThanOrEqual(64);
    expect(out.length).toBeLessThanOrEqual(160);
    expect(findCrossing(out)).toBeNull();
    expect(signedArea(out)).toBeGreaterThan(0.95 * Math.PI * 20 * 20);
    expect(signedArea(out)).toBeLessThan(1.05 * Math.PI * 20 * 20);
  });

  it('closes a stroke that does not quite meet its start', () => {
    const arc = circle(20, 100).slice(0, 92); // missing the last 8 percent
    const out = smoothStroke(arc);
    expect(out).not.toBeNull();
    expect(signedArea(out!)).toBeGreaterThan(0);
  });

  // Review focus 1: scribbles that are not shapes
  it('returns null for an empty stroke, 2 points, 3 points and identical points', () => {
    expect(smoothStroke([])).toBeNull();
    expect(smoothStroke([[0, 0], [10, 10]])).toBeNull();
    expect(smoothStroke([[0, 0], [10, 10], [20, 0]])).toBeNull();
    expect(smoothStroke(Array.from({ length: 100 }, () => [5, 5] as Vec2))).toBeNull();
  });

  it('returns null for a straight line and for a tiny dot of a loop', () => {
    expect(smoothStroke(Array.from({ length: 50 }, (_, i) => [i, 2 * i] as Vec2))).toBeNull();
    expect(smoothStroke(circle(0.8, 40))).toBeNull();
  });

  it('returns null, and does not throw, for points that are not numbers', () => {
    expect(smoothStroke([[0, 0], [NaN, 3], [10, 10], [Infinity, 2], [0, 10]])).toBeNull();
  });

  it('untwists a figure-eight into one clean lobe', () => {
    const out = smoothStroke(figureEight());
    expect(out).not.toBeNull();
    expect(Math.abs(signedArea(out!))).toBeGreaterThan(50);
    expect(findCrossing(out!)).toBeNull();
  });

  it('survives a random scribble: either a clean outline or null, never a crash', () => {
    let seed = 7;
    const rnd = () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
    for (let k = 0; k < 60; k++) {
      const raw: Vec2[] = Array.from({ length: 5 + Math.floor(rnd() * 80) }, () => [rnd() * 100, rnd() * 100]);
      const out = smoothStroke(raw);
      if (out) {
        expect(findCrossing(out)).toBeNull();
        expect(out.every(([x, y]) => Number.isFinite(x) && Number.isFinite(y))).toBe(true);
        expect(signedArea(out)).toBeGreaterThan(0);
      }
    }
  });
});

describe('strokeToOutline', () => {
  it('says whether it had to untwist the outline', () => {
    expect(strokeToOutline(wobble(circle(20, 90), 0.3))!.untwisted).toBe(false);
    expect(strokeToOutline(figureEight())!.untwisted).toBe(true);
    expect(strokeToOutline([])).toBeNull();
  });
});

describe('repairOutline', () => {
  it('untwists a bow-tie, keeps the bigger loop and makes it counter-clockwise', () => {
    const bow: Vec2[] = [[0, 0], [30, 30], [30, 0], [0, 30]];
    const out = repairOutline(bow)!;
    expect(out).not.toBeNull();
    expect(findCrossing(out)).toBeNull();
    expect(signedArea(out)).toBeGreaterThan(0);
  });

  it('makes a clockwise loop counter-clockwise', () => {
    const cw = circle(10).reverse();
    expect(signedArea(repairOutline(cw)!)).toBeGreaterThan(0);
  });

  it('removes a sharp spike', () => {
    const spiky = circle(15, 60);
    spiky.splice(10, 0, [spiky[10][0] * 3, spiky[10][1] * 3], [spiky[9][0], spiky[9][1]].map((v) => v * 1.0001) as Vec2);
    const out = repairOutline(spiky)!;
    expect(out).not.toBeNull();
    expect(Math.max(...out.map(([x, y]) => Math.hypot(x, y)))).toBeLessThan(16);
  });

  it('keeps no more than 160 points', () => {
    expect(repairOutline(circle(20, 500))!.length).toBeLessThanOrEqual(160);
  });

  // Review focus 1: loops that are too small
  it('returns null for a loop smaller than 4 square millimetres', () => {
    expect(repairOutline([[0, 0], [1, 0], [1, 1], [0, 1]])).toBeNull(); // 1 mm²
    expect(repairOutline([[0, 0], [1.9, 0], [1.9, 1.9], [0, 1.9]])).toBeNull(); // 3.6 mm²
    expect(repairOutline([[0, 0], [2.1, 0], [2.1, 2.1], [0, 2.1]])).not.toBeNull(); // 4.4 mm²
  });

  it('returns null for fewer than 3 distinct points', () => {
    expect(repairOutline([])).toBeNull();
    expect(repairOutline([[0, 0], [5, 5]])).toBeNull();
    expect(repairOutline([[1, 1], [1, 1], [1, 1], [1, 1]])).toBeNull();
  });
});
