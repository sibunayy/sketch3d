import { describe, expect, it } from 'vitest';
import { createStore } from '../../src/app/state';
import { SHAPES } from '../../src/core/geom/shapes';
import { createTool } from '../../src/views2d/tools';
import type { ToolPointer, View2D } from '../../src/views2d/tools';
import { makeDoc, makePart, rect } from './helpers/docs';

const ptr = (x: number, y: number, view: View2D = 'front', additive = false): ToolPointer => ({ at: [x, y], screen: [x * 4, 300 - y * 4], view, additive });
const noop = () => {};

function run(store: ReturnType<typeof createStore>, tool: string, path: [number, number][], view: View2D = 'front') {
  const t = createTool(tool, store, noop);
  t.down(ptr(path[0][0], path[0][1], view));
  for (const [x, y] of path.slice(1)) t.move(ptr(x, y, view));
  const last = path[path.length - 1];
  t.up(ptr(last[0], last[1], view));
}

const circlePath = (cx: number, cy: number, r: number, n = 40): [number, number][] =>
  Array.from({ length: n + 1 }, (_, i) => [cx + r * Math.cos((i / n) * 2 * Math.PI), cy + r * Math.sin((i / n) * 2 * Math.PI)]);

describe('Pick tool', () => {
  const body = () => makeDoc([makePart({ id: 'a', outline: rect(20, 20, 0, 50) })]);

  it('taps select the part under the finger and a tap on nothing clears the selection', () => {
    const s = createStore(body());
    run(s, 'select', [[0, 50]]);
    expect([...s.selection.value]).toEqual(['a']);
    run(s, 'select', [[90, 90]]);
    expect(s.selection.value.size).toBe(0);
  });

  it('a drag moves the part and makes one undo step', () => {
    const s = createStore(body());
    run(s, 'select', [[0, 50], [5, 50], [10, 52], [20, 55], [30, 60]]);
    const p = s.doc.value.parts[0];
    expect(p.outline[0][0]).toBeCloseTo(-10 + 30, 6);
    expect(p.outline[0][1]).toBeCloseTo(40 + 10, 6);
    expect(s.canUndo.value).toBe(true);
    s.undo();
    expect(s.doc.value.parts[0].outline[0]).toEqual([-10, 40]);
    expect(s.canUndo.value).toBe(false);
  });

  it('a tiny wobble is a tap, not a move', () => {
    const s = createStore(body());
    run(s, 'select', [[0, 50], [0.2, 50.1], [0.1, 50]]);
    expect(s.canUndo.value).toBe(false);
    expect(s.doc.value.parts[0].outline[0]).toEqual([-10, 40]);
  });

  it('in the Side view a sideways drag changes depth (z) and a vertical drag changes height', () => {
    const s = createStore(body());
    run(s, 'select', [[0, 50], [10, 50], [25, 60]], 'side');
    const p = s.doc.value.parts[0];
    expect(p.z).toBeCloseTo(25, 6);
    expect(p.outline[0][1]).toBeCloseTo(50, 6);
    expect(p.outline[0][0]).toBe(-10); // x did not change
  });

  it('cancel puts the part back', () => {
    const s = createStore(body());
    const t = createTool('select', s, noop);
    t.down(ptr(0, 50));
    t.move(ptr(40, 50));
    expect(s.doc.value.parts[0].outline[0][0]).toBeCloseTo(30, 6);
    t.cancel();
    expect(s.doc.value.parts[0].outline[0][0]).toBe(-10);
    expect(s.canUndo.value).toBe(false);
  });

  it('with symmetry on, dragging a mirrored twin moves the part it follows the opposite way', () => {
    const left = makePart({ id: 'l', outline: rect(10, 10, 20, 50) });
    const right = makePart({ id: 'r', outline: rect(10, 10, -20, 50), twinOf: 'l' });
    const s = createStore(makeDoc([left, right]));
    run(s, 'select', [[-20, 50], [-30, 50], [-40, 50]]); // the twin on the left drags further left
    const l = s.doc.value.parts.find((p) => p.id === 'l')!;
    expect(l.outline[0][0]).toBeCloseTo(15 + 20, 6); // the real part goes further right
  });

  it('Multi mode adds parts to the selection', () => {
    const s = createStore(makeDoc([makePart({ id: 'a', outline: rect(10, 10, -30, 50) }), makePart({ id: 'b', outline: rect(10, 10, 30, 50) })]));
    s.multi.value = true;
    run(s, 'select', [[-30, 50]]);
    run(s, 'select', [[30, 50]]);
    expect([...s.selection.value].sort()).toEqual(['a', 'b']);
  });
});

describe('Draw tool', () => {
  it('a loop makes one selected part', () => {
    const s = createStore(makeDoc([]));
    run(s, 'draw', circlePath(0, 50, 20));
    expect(s.doc.value.parts).toHaveLength(1);
    expect([...s.selection.value]).toEqual([s.doc.value.parts[0].id]);
    expect(s.doc.value.parts[0].kind).toBe('draw');
  });

  it('a scribble makes nothing and says what to do', () => {
    const s = createStore(makeDoc([]));
    run(s, 'draw', [[0, 50], [30, 51], [5, 50], [35, 51]]);
    expect(s.doc.value.parts).toHaveLength(0);
    expect(s.toasts.value[0].message).toBe('Draw a bigger, closed loop and try again.');
  });

  it('a figure-eight is untwisted and the child is told', () => {
    const s = createStore(makeDoc([]));
    const eight: [number, number][] = Array.from({ length: 80 }, (_, i) => {
      const t = (i / 80) * Math.PI * 2;
      return [30 * Math.cos(t), 50 + 22 * Math.sin(2 * t)];
    });
    run(s, 'draw', [...eight, eight[0]]);
    expect(s.doc.value.parts).toHaveLength(1);
    expect(s.toasts.value.some((t) => t.message.includes('untwisted'))).toBe(true);
  });

  it('in the Side view a loop reshapes the picked part, and asks for a pick if there is none', () => {
    const s = createStore(makeDoc([makePart({ id: 'a', outline: rect(20, 30, 0, 15), depthMm: 10 })]));
    run(s, 'draw', circlePath(0, 15, 12), 'side');
    expect(s.toasts.value[0].message).toBe('Tap a part first.');
    s.select(['a']);
    run(s, 'draw', circlePath(0, 15, 12), 'side');
    expect(s.doc.value.parts[0].profile).toBeDefined();
  });
});

describe('Shape and hole tools', () => {
  it('a tap places a ready-made size, a drag makes the size drawn', () => {
    const s = createStore(makeDoc([]));
    run(s, 'shape:star', [[0, 50]]);
    run(s, 'shape:box', [[30, 20], [50, 40], [70, 50]]);
    const [star, box] = s.doc.value.parts;
    expect(star.kind).toBe('star');
    expect(star.outline.length).toBeGreaterThan(10);
    expect(box.kind).toBe('box');
  });

  it('a hole is a cut part', () => {
    const s = createStore(makeDoc([makePart({ id: 'a' })]));
    run(s, 'hole:circle', [[0, 0]]);
    const hole = s.doc.value.parts[1];
    expect(hole.cut).toBe(true);
    expect(hole.round).toBe(0);
  });

  it('too small to be a shape makes nothing', () => {
    const s = createStore(makeDoc([]));
    const t = createTool('shape:circle', s, noop);
    t.down({ at: [0, 0], screen: [0, 0], view: 'front', additive: false });
    t.move({ at: [1, 1], screen: [40, 40], view: 'front', additive: false });
    t.up({ at: [1, 1], screen: [40, 40], view: 'front', additive: false });
    expect(s.doc.value.parts).toHaveLength(0);
  });
});

describe('Tail or arm', () => {
  it('a long line makes a limb; a short one asks for a longer line', () => {
    const s = createStore(makeDoc([]));
    run(s, 'limb', [[0, 20], [10, 25], [20, 35], [30, 50]]);
    expect(s.doc.value.parts).toHaveLength(1);
    expect(s.doc.value.parts[0].kind).toBe('limb');
    run(s, 'limb', [[0, 0], [1, 0]]);
    expect(s.toasts.value.some((t) => t.message.includes('longer line'))).toBe(true);
  });

  it('works in the Side view too and makes a part', () => {
    const s = createStore(makeDoc([]));
    run(s, 'limb', [[0, 20], [10, 25], [20, 35], [30, 50]], 'side');
    expect(s.doc.value.parts).toHaveLength(1);
    expect(s.doc.value.parts[0].depthMm).toBeGreaterThanOrEqual(8);
  });
});

describe('Eyes, smile, crease, erase', () => {
  it('eyes come as a matching pair when symmetry is on, and a single eye in the middle', () => {
    const s = createStore(makeDoc([]));
    run(s, 'eyes', [[12, 60]]);
    expect(s.doc.value.parts).toHaveLength(2);
    expect(s.doc.value.parts[1].twinOf).toBe(s.doc.value.parts[0].id);
    const s2 = createStore(makeDoc([]));
    run(s2, 'eyes', [[0, 60]]);
    expect(s2.doc.value.parts).toHaveLength(1);
  });

  it('eyes alone, when symmetry is off', () => {
    const doc = makeDoc([]);
    doc.settings.symmetry = false;
    const s = createStore(doc);
    run(s, 'eyes', [[12, 60]]);
    expect(s.doc.value.parts).toHaveLength(1);
  });

  it('a smile is a curved dark part', () => {
    const s = createStore(makeDoc([]));
    run(s, 'smile', [[0, 40]]);
    expect(s.doc.value.parts[0].kind).toBe('smile');
  });

  it('eyes and smile need the Front view', () => {
    const s = createStore(makeDoc([]));
    run(s, 'eyes', [[0, 40]], 'side');
    expect(s.doc.value.parts).toHaveLength(0);
    expect(s.toasts.value[0].message).toContain('Front view');
  });

  it('a crease is carved into the front of the part under it', () => {
    const s = createStore(makeDoc([makePart({ id: 'a', outline: rect(40, 40, 0, 50), depthMm: 20, z: 0 })]));
    run(s, 'crease', [[-10, 50], [0, 52], [10, 50]]);
    expect(s.doc.value.grooves).toHaveLength(1);
    expect(s.doc.value.grooves[0].points[0][2]).toBeCloseTo(10, 6);
    expect(s.doc.value.grooves[0].mirror).toBe(true);
  });

  it('erase removes a part with its mirrored twin and its sculpting, and offers Undo', () => {
    const doc = makeDoc([makePart({ id: 'a', outline: rect(10, 10, 20, 50) }), makePart({ id: 'b', outline: rect(10, 10, -20, 50), twinOf: 'a' })]);
    doc.dabs.push({ partId: 'a', type: 'pull', at: [0, 0, 0.5], radius: 3, strength: 1 });
    const s = createStore(doc);
    run(s, 'erase', [[20, 50]]);
    expect(s.doc.value.parts).toHaveLength(0);
    expect(s.doc.value.dabs).toHaveLength(0);
    const toast = s.toasts.value[0];
    expect(toast.action?.label).toBe('Undo');
    toast.action?.run();
    expect(s.doc.value.parts).toHaveLength(2);
  });

  it('erase on empty space does nothing', () => {
    const s = createStore(makeDoc([makePart({ id: 'a', outline: rect(10, 10, 20, 50) })]));
    run(s, 'erase', [[-50, 90]]);
    expect(s.doc.value.parts).toHaveLength(1);
    expect(s.canUndo.value).toBe(false);
  });
});

describe('Size, Turn, Reshape', () => {
  const doc = () => makeDoc([makePart({ id: 'a', outline: SHAPES.circle(-10, 40, 10, 60), depthMm: 20 })]);

  it('Size scales the part and its thickness together, and needs a picked part', () => {
    const s = createStore(doc());
    run(s, 'size', [[10, 50], [20, 50]]);
    expect(s.toasts.value[0].message).toBe('Tap a part first.');
    s.select(['a']);
    run(s, 'size', [[10, 50], [15, 50], [20, 50]]); // twice as far from the middle
    const p = s.doc.value.parts[0];
    expect(p.depthMm).toBeCloseTo(40, 1);
    expect(p.outline[0][0]).toBeCloseTo(20, 1);
  });

  it('Turn rotates around the middle: a quarter turn drag gives 90 degrees', () => {
    const s = createStore(doc());
    s.select(['a']);
    run(s, 'turn', [[20, 50], [14, 64], [0, 70]]);
    expect(s.doc.value.parts[0].rot.z).toBeCloseTo(90, 0);
  });

  it('Turn in the Side view turns about the sideways axis', () => {
    const s = createStore(doc());
    s.select(['a']);
    run(s, 'turn', [[20, 50], [0, 70]], 'side');
    expect(s.doc.value.parts[0].rot.x).toBeCloseTo(-90, 0);
    expect(s.doc.value.parts[0].rot.z).toBe(0);
  });

  it('Reshape pulls the edge near the finger and smoothly drags its neighbours', () => {
    const s = createStore(doc());
    s.select(['a']);
    run(s, 'reshape', [[10, 50], [14, 50], [18, 50]]);
    const p = s.doc.value.parts[0];
    expect(p.outline[0][0]).toBeCloseTo(18, 1);
    expect(p.outline[3][0]).toBeGreaterThan(SHAPES.circle(-10, 40, 10, 60)[3][0]);
    expect(p.outline[36][0]).toBeCloseTo(SHAPES.circle(-10, 40, 10, 60)[36][0], 6); // the far side did not move
    expect(s.canUndo.value).toBe(true);
  });
});

describe('every tool id', () => {
  it('has a hint a child can read', () => {
    const s = createStore(makeDoc([]));
    for (const id of ['select', 'draw', 'shape:circle', 'hole:box', 'limb', 'eyes', 'smile', 'crease', 'erase', 'size', 'turn', 'reshape']) {
      expect(createTool(id, s, noop).hint.length).toBeGreaterThan(10);
    }
  });
});
