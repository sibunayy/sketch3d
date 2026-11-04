import { describe, expect, it } from 'vitest';
import { bbox } from '../../src/core/geom/bounds';
import { OutlineField } from '../../src/core/geom/outlineField';
import { PROF_MIN, profileAt, profileFromLoop } from '../../src/core/geom/profile';
import { buildPartField } from '../../src/core/geom/sdf';
import { SHAPES } from '../../src/core/geom/shapes';
import type { OutlineCache } from '../../src/core/geom/sdf';
import type { Vec2 } from '../../src/core/geom/vec';
import { makePart, rect } from './helpers/docs';

const ball = (diameter = 30) =>
  makePart({ kind: 'circle', outline: SHAPES.circle(-diameter / 2, -diameter / 2, diameter / 2, diameter / 2), depthMm: diameter, round: 1 });

const slab = (over = {}) => makePart({ outline: rect(40, 40), depthMm: 20, round: 0.5, ...over });

/** Deterministic pseudo-random numbers in [0, 1). */
function rng(seed = 1) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

describe('buildPartField: shape', () => {
  it('a circle part with depth equal to its width is a sphere', () => {
    const f = buildPartField(ball(30));
    expect(f.distance(0, 0, 0)).toBeCloseTo(-15, 1);
    expect(Math.abs(f.distance(0, 0, 0) + 15)).toBeLessThan(0.05);
    expect(Math.abs(f.distance(15, 0, 0))).toBeLessThan(0.05);
    expect(Math.abs(f.distance(0, 15, 0))).toBeLessThan(0.05);
    expect(Math.abs(f.distance(0, 0, 15))).toBeLessThan(0.05);
    expect(f.distance(0, 0, 20)).toBeCloseTo(5, 0);
    // a point on the sphere along the diagonal (15 mm from the middle)
    const r = (x: number, y: number, z: number) => f.distance(x, y, z);
    expect(Math.abs(r(8.66, 8.66, 8.66))).toBeLessThan(0.1);
  });

  it('round = 0.04 keeps near-square edges; round = 1 gives a pill', () => {
    const square = buildPartField(slab({ round: 0.04 }));
    const pill = buildPartField(slab({ round: 1 }));
    // just inside the top face, near the side: solid when square, empty when pill-shaped
    expect(square.distance(19, 0, 9.5)).toBeLessThan(0);
    expect(pill.distance(19, 0, 9.5)).toBeGreaterThan(0);
    // both still reach the middle of the top face
    expect(Math.abs(square.distance(0, 0, 10))).toBeLessThan(0.05);
    expect(Math.abs(pill.distance(0, 0, 10))).toBeLessThan(0.1);
  });

  it('a cut part is always sharp-edged, whatever its roundness', () => {
    const cut = buildPartField(slab({ cut: true, round: 1 }));
    expect(cut.distance(19, 0, 9.5)).toBeLessThan(0);
  });

  it('is empty far away and solid in the middle', () => {
    const f = buildPartField(slab());
    expect(f.distance(200, 0, 0)).toBeGreaterThan(100);
    expect(f.distance(0, 0, 0)).toBeLessThan(-5);
    expect(f.distance(0, 0, 300)).toBeGreaterThan(100);
  });
});

describe('buildPartField: bounds', () => {
  it.each([6, 24, 50])('thickness %i mm sets the z extent', (depthMm) => {
    const { bounds } = buildPartField(slab({ depthMm, z: 3 }));
    expect(bounds.max[2] - bounds.min[2]).toBeCloseTo(depthMm, 2);
    expect((bounds.max[2] + bounds.min[2]) / 2).toBeCloseTo(3, 2);
  });

  it('x and y bounds follow the outline', () => {
    const { bounds } = buildPartField(makePart({ outline: rect(40, 20, 5, 7) }));
    expect(bounds.min[0]).toBeCloseTo(-15, 6);
    expect(bounds.max[0]).toBeCloseTo(25, 6);
    expect(bounds.min[1]).toBeCloseTo(-3, 6);
    expect(bounds.max[1]).toBeCloseTo(17, 6);
  });

  it('rotation by 90° about z swaps the width and height of the bounds', () => {
    const turned = buildPartField(makePart({ outline: rect(40, 20), rot: { x: 0, y: 0, z: 90 } })).bounds;
    expect(turned.max[0] - turned.min[0]).toBeCloseTo(20, 2);
    expect(turned.max[1] - turned.min[1]).toBeCloseTo(40, 2);
  });

  it('a turned part really is turned, not just its bounds', () => {
    const f = buildPartField(makePart({ outline: rect(40, 20), depthMm: 10, round: 0.04, rot: { x: 0, y: 0, z: 90 } }));
    expect(f.distance(0, 18, 0)).toBeLessThan(0); // was outside before turning (tall now)
    expect(f.distance(18, 0, 0)).toBeGreaterThan(0); // was inside before turning
  });
});

describe('buildPartField: distance behaves like a distance', () => {
  const cases: [string, Parameters<typeof slab>[0], [number, number, number], [number, number, number]][] = [
    ['plain, along x', {}, [10, 0, 0], [32, 0, 0]],
    ['plain, along z', { depthMm: 20 }, [0, 0, 2], [0, 0, 18]],
    ['turned 25°, along x', { rot: { x: 0, y: 0, z: 25 } }, [12, 3, 0], [34, 3, 0]],
    ['squashed, along y', { squash: 30 }, [0, 12, 0], [0, 34, 0]],
    ['tapered, along y', { taper: 40, round: 0.2 }, [0, 2, 0], [0, 28, 0]],
  ];
  it.each(cases)('is continuous with a slope of 0.5 to 1.5: %s', (_n, over, from, to) => {
    const f = buildPartField(slab(over));
    const steps = 200;
    let prev = f.distance(...from);
    const len = Math.hypot(to[0] - from[0], to[1] - from[1], to[2] - from[2]);
    const h = len / steps;
    for (let i = 1; i <= steps; i++) {
      const t = i / steps;
      const d = f.distance(from[0] + (to[0] - from[0]) * t, from[1] + (to[1] - from[1]) * t, from[2] + (to[2] - from[2]) * t);
      const slope = Math.abs(d - prev) / h;
      // flat stretches deep inside (slope 0) are fine; jumps and wild slopes are not
      expect(slope).toBeLessThan(1.5);
      prev = d;
    }
  });

  it('crosses the surface with a slope near 1', () => {
    const f = buildPartField(slab({ round: 0.04 }));
    const h = 0.01;
    const slope = (f.distance(20 + h, 0, 0) - f.distance(20 - h, 0, 0)) / (2 * h);
    expect(slope).toBeGreaterThan(0.5);
    expect(slope).toBeLessThan(1.5);
  });
});

describe('side profile', () => {
  const sideLoop = (zFront: number, zBack: number, y0 = 0, y1 = 20): Vec2[] => [
    [zBack, y0], [zFront, y0], [zFront, y1], [zBack, y1],
  ];

  it('profileFromLoop measures front and back as multiples of half the depth', () => {
    const p = profileFromLoop(sideLoop(5, -5), 10)!;
    expect(p.front).toHaveLength(64);
    expect(p.back).toHaveLength(64);
    expect(p.front.every((v) => Math.abs(v - 1) < 1e-9)).toBe(true);
    expect(p.back.every((v) => Math.abs(v + 1) < 1e-9)).toBe(true);
  });

  it('profile clamps to 1.8 × half depth', () => {
    const p = profileFromLoop(sideLoop(500, -500), 10)!;
    expect(Math.max(...p.front)).toBeCloseTo(1.8, 9);
    expect(Math.min(...p.back)).toBeCloseTo(-1.8, 9);
  });

  it('never lets a profile get thinner than the minimum', () => {
    const p = profileFromLoop(sideLoop(0.1, -0.1), 10)!;
    for (let i = 0; i < 64; i++) expect(p.front[i] - p.back[i]).toBeGreaterThanOrEqual(PROF_MIN - 1e-9);
  });

  it('follows a bulge: a diamond is thickest in the middle', () => {
    const diamond: Vec2[] = [[0, 0], [5, 10], [0, 20], [-5, 10]];
    const p = profileFromLoop(diamond, 10)!;
    expect(p.front[31]).toBeGreaterThan(p.front[3]);
    expect(p.front[31]).toBeGreaterThan(0.9);
  });

  it('returns null when the loop does not cover the part', () => {
    expect(profileFromLoop([[0, 0], [1, 0], [2, 0]], 10)).toBeNull();
    expect(profileFromLoop([], 10)).toBeNull();
  });

  it('profileAt reads the profile from bottom (0) to top (1)', () => {
    const front = Array.from({ length: 64 }, (_, i) => 1 + i / 63);
    const back = Array.from({ length: 64 }, () => -1);
    expect(profileAt({ front, back }, 0).front).toBeCloseTo(1, 9);
    expect(profileAt({ front, back }, 1).front).toBeCloseTo(2, 9);
    expect(profileAt({ front, back }, 0.5).front).toBeCloseTo(1.5, 2);
    expect(profileAt({ front, back }, 7).front).toBeCloseTo(2, 9); // clamped
  });

  it('a profile changes the shape and the bounds', () => {
    const front = Array.from({ length: 64 }, () => 1.8);
    const back = Array.from({ length: 64 }, () => -1);
    const f = buildPartField(makePart({ outline: rect(20, 20), depthMm: 10, round: 0, profile: { front, back } }));
    expect(f.bounds.max[2]).toBeCloseTo(9, 2);
    expect(f.bounds.min[2]).toBeCloseTo(-5, 2);
    expect(f.distance(0, 0, 8.5)).toBeLessThan(0);
    expect(f.distance(0, 0, 9.5)).toBeGreaterThan(0);
    expect(f.distance(0, 0, -4.5)).toBeLessThan(0);
    expect(f.distance(0, 0, -5.5)).toBeGreaterThan(0);
  });
});

/** OutlineField works relative to the outline's bottom-left corner; this gives the outline's size. */
const corner = (outline: Vec2[]) => {
  const b = bbox(outline);
  return { w: b.w, h: b.h };
};

describe('OutlineField: the fast grid agrees with the exact distance', () => {
  const shapes: [string, Vec2[]][] = [
    ['circle', SHAPES.circle(-15, -15, 15, 15)],
    ['box', SHAPES.box(-20, -10, 20, 10)],
    ['star', SHAPES.star(-18, -18, 18, 18)],
    ['heart', SHAPES.heart(-18, -16, 18, 16)],
    ['moon', SHAPES.moon(-14, -18, 14, 18)],
  ];
  it.each(shapes)('%s: within 0.05 mm everywhere', (_name, outline) => {
    const field = new OutlineField(outline, 0.75, 10);
    const { w, h } = corner(outline);
    const rand = rng(42);
    let worst = 0;
    for (let k = 0; k < 4000; k++) {
      // points inside the shape and in the 8 mm around it (the grid has a 10 mm margin)
      const x = rand() * (w + 16) - 8;
      const y = rand() * (h + 16) - 8;
      const err = Math.abs(field.sample(x, y) - field.exact(x, y));
      if (err > worst) worst = err;
    }
    expect(worst).toBeLessThan(0.05);
  });

  it('uses the exact answer only in a small part of the grid', () => {
    const field = new OutlineField(SHAPES.circle(-15, -15, 15, 15), 0.75, 10);
    expect(field.exactCellFraction).toBeLessThan(0.15);
  });

  it('knows the widest inscribed circle: 15 for a 30 mm circle', () => {
    expect(new OutlineField(SHAPES.circle(-15, -15, 15, 15), 0.75, 10).inscribedRadius).toBeCloseTo(14.986, 2);
  });

  it('is negative inside and positive outside', () => {
    const field = new OutlineField(SHAPES.box(-20, -10, 20, 10), 0.75, 10); // corner at (-20, -10)
    expect(field.sample(20, 10)).toBeLessThan(0);
    expect(field.sample(55, 10)).toBeGreaterThan(0);
    expect(field.exact(20, 10)).toBeCloseTo(-10, 6);
  });

  it('gives a sensible positive distance far outside its grid', () => {
    const field = new OutlineField(SHAPES.circle(-15, -15, 15, 15), 0.75, 10);
    expect(field.sample(500, 15)).toBeGreaterThan(400);
  });
});

describe('outline cache', () => {
  it('reuses the grid when a part only moves', () => {
    const cache: OutlineCache = new Map();
    buildPartField(slab(), { cache });
    const first = cache.get('p1')!.field;
    const moved = slab({ outline: rect(40, 40, 25, -8) });
    buildPartField(moved, { cache });
    expect(cache.get('p1')!.field).toBe(first);
  });

  it('rebuilds the grid when the shape changes', () => {
    const cache: OutlineCache = new Map();
    buildPartField(slab(), { cache });
    const first = cache.get('p1')!.field;
    buildPartField(slab({ outline: rect(30, 40) }), { cache });
    expect(cache.get('p1')!.field).not.toBe(first);
  });

  it('a moved part still has the right distances', () => {
    const cache: OutlineCache = new Map();
    buildPartField(slab(), { cache });
    const f = buildPartField(slab({ outline: rect(40, 40, 25, -8) }), { cache });
    expect(f.distance(25, -8, 0)).toBeLessThan(-5);
    expect(f.distance(0, 0, 0)).toBeGreaterThan(0);
  });
});
