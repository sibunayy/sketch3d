import { describe, expect, it } from 'vitest';
import { partFrame, worldToLocal, dirToLocal } from '../../src/core/doc/frame';
import type { Dab, Part } from '../../src/core/doc/types';
import { boxIsEmpty } from '../../src/core/geom/bounds';
import { buildSceneField } from '../../src/core/geom/scene';
import { SHAPES } from '../../src/core/geom/shapes';
import type { Vec3 } from '../../src/core/geom/vec';
import { makeDoc, makePart, rect } from './helpers/docs';

const ball = (id: string, cx: number, over: Partial<Part> = {}): Part =>
  makePart({
    id,
    name: id,
    kind: 'circle',
    outline: SHAPES.circle(cx - 10, -10, cx + 10, 10),
    depthMm: 20,
    round: 1,
    ...over,
  });

const dabOn = (part: Part, world: Vec3, over: Partial<Dab> = {}): Dab => ({
  partId: part.id,
  type: 'pull',
  at: worldToLocal(partFrame(part), world),
  radius: 4,
  strength: 1,
  ...over,
});

const rand = (seed = 3) => () => ((seed = (seed * 16807) % 2147483647) / 2147483647);

describe('melting parts together', () => {
  const seam = (melt: boolean): number => {
    const a = ball('a', 0, { melt, blend: 6 });
    const b = ball('b', 14, { melt, blend: 6 });
    // the notch where the two balls meet: x = 7, and the hard-union surface is at y = sqrt(10² - 7²)
    return buildSceneField(makeDoc([a, b])).sample(7, Math.sqrt(100 - 49), 0);
  };

  it('two overlapping spheres with melt on produce a smaller field value at the seam than with melt off', () => {
    const hard = seam(false);
    const soft = seam(true);
    expect(Math.abs(hard)).toBeLessThan(0.3); // the notch is right on the surface when not melted
    expect(soft).toBeLessThan(hard - 0.3); // melting fills it in
  });

  it('a part far from the others is not changed by melting', () => {
    const a = ball('a', 0, { melt: true, blend: 6 });
    const far = ball('b', 80, { melt: true, blend: 6 });
    const together = buildSceneField(makeDoc([a, far]));
    const alone = buildSceneField(makeDoc([a]));
    expect(together.sample(5, 3, 2)).toBeCloseTo(alone.sample(5, 3, 2), 6);
  });
});

describe('cut-away parts', () => {
  const body = makePart({ id: 'body', outline: rect(40, 40), depthMm: 20, round: 0.04 });
  const hole = makePart({ id: 'hole', cut: true, outline: rect(10, 10), depthMm: 60 });

  it('a cut part removes material', () => {
    const solid = buildSceneField(makeDoc([body]));
    const holed = buildSceneField(makeDoc([body, hole]));
    expect(solid.sample(0, 0, 0)).toBeLessThan(0);
    expect(holed.sample(0, 0, 0)).toBeGreaterThan(0); // inside both the body and the hole: empty
  });

  it('a cut-away part removes only what it overlaps', () => {
    const solid = buildSceneField(makeDoc([body]));
    const holed = buildSceneField(makeDoc([body, hole]));
    for (const p of [[15, 0, 0], [-15, 10, 5], [0, 17, 0], [12, -12, 8]] as Vec3[]) {
      expect(holed.sample(...p)).toBeCloseTo(solid.sample(...p), 6);
    }
  });

  it('a cut sticking out of the body does not create material', () => {
    const f = buildSceneField(makeDoc([body, hole]));
    expect(f.sample(0, 0, 25)).toBeGreaterThan(0);
  });
});

describe('mirror twins', () => {
  const source = makePart({
    id: 'left',
    outline: SHAPES.egg(8, -5, 28, 15),
    depthMm: 14,
    round: 0.6,
    rot: { x: 15, y: 20, z: 30 },
    taper: 20,
    z: 2,
  });
  // the twin's own stored shape is deliberately wrong: with symmetry on it must be ignored
  const twin = makePart({ id: 'right', twinOf: 'left', outline: rect(5, 5, -3, -3), depthMm: 3 });

  it('sample(x,y,z) equals sample(-x,y,z) for a symmetric doc', () => {
    const doc = makeDoc([source, twin]);
    const f = buildSceneField(doc);
    const r = rand();
    let compared = 0;
    for (let i = 0; i < 4000; i++) {
      const x = (r() * 2 - 1) * 45;
      const y = (r() * 2 - 1) * 25;
      const z = (r() * 2 - 1) * 20;
      const a = f.sample(x, y, z);
      const b = f.sample(-x, y, z);
      expect(Math.sign(a)).toBe(Math.sign(b)); // inside and outside always agree
      if (Math.abs(a) < 2) {
        // near the surface the distances agree too (the field is only exact there)
        expect(Math.abs(a - b)).toBeLessThan(0.02);
        compared++;
      }
    }
    expect(compared).toBeGreaterThan(40); // the check is not vacuous
  });

  it('with symmetry off the twin is just its own part', () => {
    const doc = makeDoc([source, twin]);
    doc.settings.symmetry = false;
    const f = buildSceneField(doc);
    expect(f.sample(-18, 5, 2)).toBeGreaterThan(0.5); // nothing is on the left now
    expect(f.sample(18, 5, 2)).toBeLessThan(0);
  });
});

describe('sculpt dabs', () => {
  const part = ball('b', 0);

  it('a pull dab at a local point moves the surface outward', () => {
    const base = buildSceneField(makeDoc([part]));
    const doc = makeDoc([part]);
    doc.dabs.push(dabOn(part, [9.9, 0, 0]));
    const f = buildSceneField(doc);
    expect(base.sample(12, 0, 0)).toBeGreaterThan(1.5);
    expect(f.sample(12, 0, 0)).toBeLessThan(base.sample(12, 0, 0) - 1);
    expect(f.sample(0, 0, 0)).toBeCloseTo(base.sample(0, 0, 0), 5); // the middle is untouched
  });

  it('a push dab moves the surface inward', () => {
    const base = buildSceneField(makeDoc([part]));
    const doc = makeDoc([part]);
    doc.dabs.push(dabOn(part, [9.9, 0, 0], { type: 'push' }));
    const f = buildSceneField(doc);
    expect(base.sample(9, 0, 0)).toBeLessThan(-0.5);
    expect(f.sample(9, 0, 0)).toBeGreaterThan(base.sample(9, 0, 0) + 1);
  });

  it('moving the part moves the dab with it', () => {
    const doc = makeDoc([part]);
    doc.dabs.push(dabOn(part, [9.9, 0, 0]));
    const before = buildSceneField(doc).sample(12, 0, 0);

    const moved: Part = { ...part, outline: part.outline.map(([x, y]) => [x + 30, y + 5]), z: part.z + 4 };
    const doc2 = makeDoc([moved]);
    doc2.dabs = doc.dabs; // the same dab, stored part-local
    const after = buildSceneField(doc2).sample(12 + 30, 5, 4);
    expect(after).toBeCloseTo(before, 4);
  });

  it('turning the part turns the dab with it', () => {
    const doc = makeDoc([part]);
    doc.dabs.push(dabOn(part, [9.9, 0, 0]));
    const turned: Part = { ...part, rot: { x: 0, y: 0, z: 90 } };
    const doc2 = makeDoc([turned]);
    doc2.dabs = doc.dabs;
    const f = buildSceneField(doc2);
    const base = buildSceneField(makeDoc([turned]));
    expect(f.sample(0, 12, 0)).toBeLessThan(base.sample(0, 12, 0) - 1); // the bump is now on top
    expect(f.sample(12, 0, 0)).toBeCloseTo(base.sample(12, 0, 0), 4);
  });

  it('a grab dab drags the surface out along its drag', () => {
    const base = buildSceneField(makeDoc([part]));
    const doc = makeDoc([part]);
    const frame = partFrame(part);
    doc.dabs.push(dabOn(part, [10, 0, 0], { type: 'grab', radius: 8, drag: dirToLocal(frame, [6, 0, 0]) }));
    const f = buildSceneField(doc);
    expect(base.sample(14, 0, 0)).toBeGreaterThan(3);
    expect(f.sample(14, 0, 0)).toBeLessThan(0); // pulled out past here
    expect(f.sample(-10.5, 0, 0)).toBeCloseTo(base.sample(-10.5, 0, 0), 4); // far side unchanged
  });

  it('a smooth dab changes the field near a sharp edge and nowhere else', () => {
    const slab = makePart({ id: 's', outline: rect(30, 30), depthMm: 20, round: 0.04 });
    const base = buildSceneField(makeDoc([slab]), { voxelMm: 1 });
    const doc = makeDoc([slab]);
    doc.dabs.push(dabOn(slab, [14.5, 14.5, 9.5], { type: 'smooth', radius: 5, strength: 0.75 }));
    const f = buildSceneField(doc, { voxelMm: 1 });
    expect(Number.isFinite(f.sample(14.5, 14.5, 9.5))).toBe(true);
    expect(f.sample(14.5, 14.5, 9.5)).not.toBeCloseTo(base.sample(14.5, 14.5, 9.5), 3);
    expect(f.sample(-14, -14, 0)).toBeCloseTo(base.sample(-14, -14, 0), 6);
  });

  it('dabs apply in order: a push after a pull cuts into the bump', () => {
    const doc = makeDoc([part]);
    doc.dabs.push(dabOn(part, [10, 0, 0], { radius: 5 }), dabOn(part, [10, 0, 0], { radius: 5, type: 'push' }));
    const f = buildSceneField(doc);
    const pullOnly = makeDoc([part]);
    pullOnly.dabs.push(doc.dabs[0]);
    expect(f.sample(12, 0, 0)).toBeGreaterThan(buildSceneField(pullOnly).sample(12, 0, 0) + 1);
  });

  it('thousands of dabs still answer quickly', () => {
    const doc = makeDoc([part]);
    const r = rand(11);
    for (let i = 0; i < 3000; i++) {
      const a = r() * Math.PI * 2;
      const b = Math.acos(2 * r() - 1);
      doc.dabs.push(dabOn(part, [10 * Math.sin(b) * Math.cos(a), 10 * Math.sin(b) * Math.sin(a), 10 * Math.cos(b)], { radius: 1.5 }));
    }
    const f = buildSceneField(doc);
    const t0 = performance.now();
    let s = 0;
    for (let i = 0; i < 20000; i++) s += f.sample((r() * 2 - 1) * 16, (r() * 2 - 1) * 16, (r() * 2 - 1) * 16);
    const ms = performance.now() - t0;
    expect(Number.isFinite(s)).toBe(true);
    expect(ms).toBeLessThan(1500);
  });
});

describe('grooves', () => {
  it('carve a line into the surface', () => {
    const slab = makePart({ id: 's', outline: rect(40, 40), depthMm: 20, round: 0.04 });
    const doc = makeDoc([slab]);
    doc.grooves.push({ points: [[-10, 0, 10], [10, 0, 10]], radius: 2, mirror: false });
    const f = buildSceneField(doc);
    const plain = buildSceneField(makeDoc([slab]));
    expect(plain.sample(0, 0, 9)).toBeLessThan(0);
    expect(f.sample(0, 0, 9)).toBeGreaterThan(0); // just under the top face, on the groove
    expect(f.sample(0, 10, 9)).toBeLessThan(0); // away from the groove
  });

  it('can mirror across the middle', () => {
    const slab = makePart({ id: 's', outline: rect(60, 40), depthMm: 20, round: 0.04 });
    const doc = makeDoc([slab]);
    doc.grooves.push({ points: [[10, 0, 10], [20, 0, 10]], radius: 2, mirror: true });
    const f = buildSceneField(doc);
    expect(f.sample(15, 0, 9)).toBeGreaterThan(0);
    expect(f.sample(-15, 0, 9)).toBeGreaterThan(0);
    doc.grooves[0].mirror = false;
    expect(buildSceneField(doc).sample(-15, 0, 9)).toBeLessThan(0);
  });
});

describe('outline grid cache', () => {
  it('is reused when only the mesh resolution changes (draft, final, adaptive sizes)', () => {
    const cache = new Map();
    const doc = makeDoc([ball('a', 0), ball('b', 14, { melt: true, blend: 5 })]);
    buildSceneField(doc, { voxelMm: 2.1, cache });
    const first = [...cache.values()].map((e) => e.field);
    expect(first).toHaveLength(2);
    for (const v of [0.8, 3.4, 1.3]) {
      buildSceneField(doc, { voxelMm: v, cache });
      expect([...cache.values()].map((e) => e.field)).toEqual(first);
      first.forEach((f, i) => expect([...cache.values()][i].field).toBe(f));
    }
  });
});

describe('empty and awkward documents', () => {
  it('an empty doc returns +Infinity everywhere, and bounds are empty', () => {
    const f = buildSceneField(makeDoc([]));
    expect(f.sample(0, 0, 0)).toBe(Infinity);
    expect(f.sample(50, -3, 8)).toBe(Infinity);
    expect(boxIsEmpty(f.bounds)).toBe(true);
    expect(f.partAt(0, 0, 0)).toBe(-1);
  });

  it('a doc with only cut parts is empty too', () => {
    const f = buildSceneField(makeDoc([makePart({ cut: true })]));
    expect(f.sample(0, 0, 0)).toBe(Infinity);
    expect(boxIsEmpty(f.bounds)).toBe(true);
  });

  it('a point far from everything is simply outside, not an error', () => {
    const f = buildSceneField(makeDoc([ball('a', 0)]));
    const d = f.sample(500, 0, 0);
    expect(Number.isFinite(d)).toBe(true);
    expect(d).toBeGreaterThan(100);
  });

  it('onlyParts leaves the others out', () => {
    const doc = makeDoc([ball('a', -30), ball('b', 30)]);
    const f = buildSceneField(doc, { onlyParts: new Set(['b']) });
    expect(f.sample(-30, 0, 0)).toBeGreaterThan(0);
    expect(f.sample(30, 0, 0)).toBeLessThan(0);
  });

  it('survives a part with a broken outline', () => {
    const f = buildSceneField(makeDoc([makePart({ outline: [[0, 0], [1, 1]] }), ball('a', 0)]));
    expect(f.sample(0, 0, 0)).toBeLessThan(0);
  });
});

describe('bounds and partAt', () => {
  it('bounds cover every solid part and every pulled-out dab', () => {
    const a = ball('a', -30);
    const b = ball('b', 30);
    const doc = makeDoc([a, b]);
    let f = buildSceneField(doc);
    expect(f.bounds.min[0]).toBeLessThanOrEqual(-40);
    expect(f.bounds.max[0]).toBeGreaterThanOrEqual(40);
    doc.dabs.push(dabOn(b, [38, 0, 0], { radius: 6 }));
    f = buildSceneField(doc);
    expect(f.bounds.max[0]).toBeGreaterThanOrEqual(44);
  });

  it('cut parts do not widen the bounds', () => {
    const f = buildSceneField(makeDoc([ball('a', 0), makePart({ id: 'c', cut: true, outline: rect(200, 200), depthMm: 200 })]));
    expect(f.bounds.max[0]).toBeLessThan(20);
  });

  it('partAt returns the index of the nearest solid part, never a cut part', () => {
    const doc = makeDoc([ball('a', -30), makePart({ id: 'c', cut: true, outline: rect(10, 10, 30, 0), depthMm: 60 }), ball('b', 30)]);
    const f = buildSceneField(doc);
    expect(f.partAt(-28, 0, 0)).toBe(0);
    expect(f.partAt(28, 0, 0)).toBe(2); // index in doc.parts
    expect(f.partAt(30, 0, 0)).toBe(2);
  });

  it('partAt works for points a long way from any part', () => {
    const f = buildSceneField(makeDoc([ball('a', -30), ball('b', 30)]));
    expect(f.partAt(100, 0, 0)).toBe(1);
    expect(f.partAt(-100, 0, 0)).toBe(0);
  });
});

