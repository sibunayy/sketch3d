import { describe, expect, it } from 'vitest';
import { createStore } from '../../src/app/state';
import { applyPatch, commonValue, copyParts, deleteParts, nearestRound } from '../../src/core/doc/edit';
import { makeDoc, makePart, rect } from './helpers/docs';

const three = () =>
  makeDoc([
    makePart({ id: 'a', name: 'Head', depthMm: 20, round: 0.4 }),
    makePart({ id: 'b', name: 'Body', depthMm: 30, round: 0.4 }),
    makePart({ id: 'c', name: 'Leg', depthMm: 10, round: 1 }),
  ]);

describe('applyPatch', () => {
  it('changes every selected part and leaves the others alone', () => {
    const d = three();
    applyPatch(d, ['a', 'b'], { depthMm: 44 });
    expect(d.parts.map((p) => p.depthMm)).toEqual([44, 44, 10]);
  });

  it('applyToSelection changes every selected part in one history step (one undo reverts all)', () => {
    const s = createStore(three());
    s.select(['a', 'b']);
    s.commit('Thicker', (d) => applyPatch(d, ['a', 'b'], { depthMm: 44 }));
    expect(s.doc.value.parts.map((p) => p.depthMm)).toEqual([44, 44, 10]);
    s.undo();
    expect(s.doc.value.parts.map((p) => p.depthMm)).toEqual([20, 30, 10]);
    expect(s.canUndo.value).toBe(false);
  });

  it('turns can change one angle and keep the others', () => {
    const d = makeDoc([makePart({ id: 'a', rot: { x: 10, y: 20, z: 30 } })]);
    applyPatch(d, ['a'], { rot: { z: 90 } });
    expect(d.parts[0].rot).toEqual({ x: 10, y: 20, z: 90 });
  });

  it('ignores ids that are not parts', () => {
    const d = three();
    applyPatch(d, ['nope'], { depthMm: 44 });
    expect(d.parts.map((p) => p.depthMm)).toEqual([20, 30, 10]);
  });

  it('with symmetry on, changing a twin changes the part it follows, and its turn is mirrored', () => {
    const d = makeDoc([
      makePart({ id: 'l', outline: rect(10, 10, 20, 0) }),
      makePart({ id: 'r', outline: rect(10, 10, -20, 0), twinOf: 'l' }),
    ]);
    applyPatch(d, ['r'], { depthMm: 40, rot: { z: 30, y: 10 } });
    expect(d.parts[0].depthMm).toBe(40);
    expect(d.parts[0].rot).toEqual({ x: 0, y: -10, z: -30 }); // a mirror image turns the other way
    expect(d.parts[1].depthMm).toBe(16); // the twin itself is just a reflection
  });

  it('colour and name belong to each part, even a twin', () => {
    const d = makeDoc([makePart({ id: 'l' }), makePart({ id: 'r', twinOf: 'l' })]);
    applyPatch(d, ['r'], { color: '#112233' });
    expect(d.parts[1].color).toBe('#112233');
    expect(d.parts[0].color).not.toBe('#112233');
  });

  it('with symmetry off a twin is edited as itself', () => {
    const d = makeDoc([makePart({ id: 'l' }), makePart({ id: 'r', twinOf: 'l' })]);
    d.settings.symmetry = false;
    applyPatch(d, ['r'], { depthMm: 33 });
    expect(d.parts.map((p) => p.depthMm)).toEqual([16, 33]);
  });

  it('picking both a part and its twin edits the part once', () => {
    const d = makeDoc([makePart({ id: 'l', rot: { x: 0, y: 0, z: 0 } }), makePart({ id: 'r', twinOf: 'l' })]);
    applyPatch(d, ['l', 'r'], { rot: { z: 30 } });
    expect(d.parts[0].rot.z).toBe(30);
  });

  it('a result that is too big or small is squeezed into the allowed range, not rejected', () => {
    const d = three();
    applyPatch(d, ['a'], { depthMm: 9999, round: 7, taper: -500 });
    expect(d.parts[0].depthMm).toBe(200);
    expect(d.parts[0].round).toBe(1);
    expect(d.parts[0].taper).toBe(-100);
  });
});

describe('commonValue', () => {
  it('is the shared value, or "mixed"', () => {
    const d = three();
    expect(commonValue([d.parts[0], d.parts[1]], (p) => p.round)).toBe(0.4);
    expect(commonValue([d.parts[0], d.parts[2]], (p) => p.round)).toBe('mixed');
    expect(commonValue([], (p) => p.round)).toBe('mixed');
  });

  it('treats tiny differences as the same', () => {
    const a = makePart({ id: 'a', depthMm: 10 });
    const b = makePart({ id: 'b', depthMm: 10.0004 });
    expect(commonValue([a, b], (p) => p.depthMm)).toBeCloseTo(10, 2);
  });
});

describe('nearestRound', () => {
  it('snaps to Square, Soft, Round or Pill', () => {
    expect(nearestRound(0.04)).toBe(0.04);
    expect(nearestRound(0.3)).toBe(0.4);
    expect(nearestRound(0.7)).toBe(0.8);
    expect(nearestRound(0.95)).toBe(1);
  });
});

describe('copyParts and deleteParts', () => {
  it('a copy is new, offset a little, and the copies are what ends up selected', () => {
    const d = three();
    const ids = copyParts(d, ['a', 'b']);
    expect(d.parts).toHaveLength(5);
    expect(ids).toHaveLength(2);
    expect(new Set(d.parts.map((p) => p.id)).size).toBe(5);
    const copy = d.parts.find((p) => p.id === ids[0])!;
    expect(copy.outline[0][0]).toBeCloseTo(d.parts[0].outline[0][0] + 8, 6);
    expect(copy.name).not.toBe('Head');
    expect(copy.twinOf).toBeUndefined();
  });

  it('copying keeps the sculpting that was on the part', () => {
    const d = three();
    d.dabs.push({ partId: 'a', type: 'pull', at: [0, 0, 0.5], radius: 3, strength: 1 });
    const [id] = copyParts(d, ['a']);
    expect(d.dabs.filter((x) => x.partId === id)).toHaveLength(1);
  });

  it('copies of a part and its twin stay twins of each other', () => {
    const d = makeDoc([makePart({ id: 'l' }), makePart({ id: 'r', twinOf: 'l' })]);
    const ids = copyParts(d, ['l', 'r']);
    const second = d.parts.find((p) => p.id === ids[1])!;
    expect(second.twinOf).toBe(ids[0]);
  });

  it('delete removes parts, their twins and their sculpting', () => {
    const d = makeDoc([makePart({ id: 'l' }), makePart({ id: 'r', twinOf: 'l' }), makePart({ id: 'k' })]);
    d.dabs.push({ partId: 'l', type: 'push', at: [0, 0, 0.5], radius: 3, strength: 1 });
    deleteParts(d, ['l']);
    expect(d.parts.map((p) => p.id)).toEqual(['k']);
    expect(d.dabs).toHaveLength(0);
  });
});
