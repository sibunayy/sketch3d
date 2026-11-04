import { describe, expect, it } from 'vitest';
import { findCrossing, signedArea } from '../../src/core/geom/outline';
import { SHAPES } from '../../src/core/geom/shapes';
import { bbox } from '../../src/core/geom/bounds';
import { createDoc, validateDoc } from '../../src/core/doc/schema';
import { PALETTE, hitTest, limbOutline, newPart, sideOutline, smileOutline } from '../../src/core/doc/partOps';
import { makeDoc, makePart, rect } from './helpers/docs';

describe('newPart', () => {
  it('a circle becomes a sphere as thick as it is wide', () => {
    const doc = createDoc();
    const p = newPart(doc, { kind: 'circle', outline: SHAPES.circle(0, 0, 30, 30) });
    expect(p.depthMm).toBe(30);
    expect(p.round).toBe(1);
    expect(p.kind).toBe('circle');
  });

  it('gives each part its own id and a readable name', () => {
    const doc = createDoc();
    const a = newPart(doc, { kind: 'box', outline: SHAPES.box(0, 0, 20, 20) });
    doc.parts.push(a);
    const b = newPart(doc, { kind: 'box', outline: SHAPES.box(0, 0, 20, 20) });
    expect(b.id).not.toBe(a.id);
    expect(b.name).not.toBe(a.name);
    expect(a.name).toMatch(/Box/);
  });

  it('never reuses an id, even after a part was deleted', () => {
    const doc = makeDoc([makePart({ id: 'p7' }), makePart({ id: 'p3' })]);
    const p = newPart(doc, { kind: 'box', outline: SHAPES.box(0, 0, 20, 20) });
    expect(['p7', 'p3']).not.toContain(p.id);
    expect(doc.parts.every((q) => q.id !== p.id)).toBe(true);
  });

  it('colours cycle through the palette', () => {
    const doc = createDoc();
    const colours = new Set<string>();
    for (let i = 0; i < PALETTE.length; i++) {
      const p = newPart(doc, { kind: 'box', outline: SHAPES.box(i * 50, 0, i * 50 + 20, 20) });
      doc.parts.push(p);
      colours.add(p.color);
    }
    expect(colours.size).toBe(PALETTE.length);
  });

  it('sits in front of whatever it overlaps so faces do not fight', () => {
    const doc = makeDoc([makePart({ id: 'p1', outline: rect(40, 40), depthMm: 20, z: 0 })]);
    const front = newPart(doc, { kind: 'circle', outline: SHAPES.circle(-5, -5, 5, 5) });
    expect(front.z - front.depthMm / 2).toBeGreaterThan(0); // starts inside the body's front half
    expect(front.z).toBeGreaterThan(0);
  });

  it('sits at z = 0 when it overlaps nothing', () => {
    const doc = makeDoc([makePart({ id: 'p1', outline: rect(10, 10), z: 0 })]);
    expect(newPart(doc, { kind: 'circle', outline: SHAPES.circle(60, 60, 80, 80) }).z).toBe(0);
  });

  it('a cut part goes right through everything and is sharp-edged', () => {
    const doc = makeDoc([makePart({ id: 'p1', outline: rect(40, 40), depthMm: 30 })]);
    const hole = newPart(doc, { kind: 'circle', outline: SHAPES.circle(-4, -4, 4, 4), cut: true });
    expect(hole.cut).toBe(true);
    expect(hole.round).toBe(0);
    expect(hole.depthMm).toBeGreaterThanOrEqual(60);
  });

  it('what it makes is always a valid toy part', () => {
    const doc = createDoc();
    for (const kind of ['circle', 'box', 'star', 'heart', 'egg', 'capsule', 'triangle', 'drop', 'moon'] as const) {
      doc.parts.push(newPart(doc, { kind, outline: SHAPES[kind](0, 0, 25, 25) }));
    }
    expect(() => validateDoc(doc)).not.toThrow();
  });
});

describe('hitTest', () => {
  const doc = makeDoc([
    makePart({ id: 'back', outline: rect(40, 40), z: 0, depthMm: 20 }),
    makePart({ id: 'front', outline: rect(20, 20), z: 12, depthMm: 10 }),
  ]);

  it('finds the part on top (last drawn) under a point in the Front view', () => {
    expect(hitTest(doc, 'front', [0, 0])).toBe('front');
    expect(hitTest(doc, 'front', [15, 15])).toBe('back');
    expect(hitTest(doc, 'front', [100, 100])).toBeNull();
  });

  it('works in the Side view, where the horizontal axis is depth (z)', () => {
    // 'back' spans z -10..10, 'front' spans z 7..17, both over y -20..20 and -10..10
    expect(hitTest(doc, 'side', [14, 0])).toBe('front');
    expect(hitTest(doc, 'side', [-8, 15])).toBe('back');
    expect(hitTest(doc, 'side', [30, 0])).toBeNull();
  });

  it('ignores parts with fewer than 3 points', () => {
    const odd = makeDoc([makePart({ id: 'x', outline: [[0, 0], [1, 1]] as never })]);
    expect(hitTest(odd, 'front', [0.5, 0.5])).toBeNull();
  });
});

describe('sideOutline', () => {
  it('is a box as deep as the part and as tall as its outline', () => {
    const p = makePart({ outline: rect(20, 30, 0, 15), depthMm: 10, z: 4 });
    const b = bbox(sideOutline(p));
    expect([b.x0, b.x1, b.y0, b.y1]).toEqual([-1, 9, 0, 30]);
  });

  it('follows the side profile when the part has one', () => {
    const front = Array.from({ length: 64 }, (_, i) => 1 + i / 63);
    const back = Array.from({ length: 64 }, () => -1);
    const p = makePart({ outline: rect(20, 30, 0, 15), depthMm: 10, z: 0, profile: { front, back } });
    const b = bbox(sideOutline(p));
    expect(b.x1).toBeCloseTo(10, 6); // top of the part reaches 2 × half depth
    expect(b.x0).toBeCloseTo(-5, 6);
  });
});

describe('limbOutline', () => {
  it('turns a line into a rounded tail or arm shape', () => {
    const line: [number, number][] = [[0, 0], [10, 2], [20, 8], [28, 18]];
    const out = limbOutline(line, 3);
    expect(out.length).toBeGreaterThanOrEqual(8);
    expect(signedArea(out)).toBeGreaterThan(80);
    expect(findCrossing(out)).toBeNull();
    const b = bbox(out);
    expect(b.x0).toBeLessThanOrEqual(-2.5);
    expect(b.x1).toBeGreaterThanOrEqual(30.5);
  });

  it('copes with a very short line', () => {
    expect(limbOutline([[0, 0], [0.2, 0.1]], 3).length).toBeGreaterThanOrEqual(3);
  });
});

describe('smileOutline', () => {
  it('is a curved band that does not cross itself', () => {
    const s = smileOutline(0, 0, 16);
    expect(signedArea(s)).toBeGreaterThan(5);
    expect(findCrossing(s)).toBeNull();
    const b = bbox(s);
    expect(b.w).toBeCloseTo(16, 0);
    expect(b.cx).toBeCloseTo(0, 6);
  });
});
