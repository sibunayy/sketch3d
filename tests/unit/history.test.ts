import { describe, expect, it } from 'vitest';
import { History } from '../../src/core/doc/history';
import type { Doc } from '../../src/core/doc/types';
import { makeDoc, makePart } from './helpers/docs';

const docWithDepth = (n: number) => makeDoc([makePart({ depthMm: n })]);
const depthOf = (d: Doc | null) => d?.parts[0].depthMm;

describe('History', () => {
  it('starts with nothing to undo or redo', () => {
    const h = new History(docWithDepth(10));
    expect(h.canUndo).toBe(false);
    expect(h.canRedo).toBe(false);
    expect(h.undo()).toBeNull();
    expect(h.redo()).toBeNull();
  });

  it('undoes and redoes in order', () => {
    const h = new History(docWithDepth(10));
    h.push(docWithDepth(20), 'Thicker');
    h.push(docWithDepth(30), 'Thicker again');
    expect(depthOf(h.undo())).toBe(20);
    expect(depthOf(h.undo())).toBe(10);
    expect(h.canUndo).toBe(false);
    expect(depthOf(h.redo())).toBe(20);
    expect(depthOf(h.redo())).toBe(30);
    expect(h.canRedo).toBe(false);
  });

  it('push after undo drops the redo branch', () => {
    const h = new History(docWithDepth(10));
    h.push(docWithDepth(20), 'a');
    h.push(docWithDepth(30), 'b');
    h.undo();
    h.undo();
    h.push(docWithDepth(40), 'c');
    expect(h.canRedo).toBe(false);
    expect(h.redo()).toBeNull();
    expect(depthOf(h.undo())).toBe(10);
  });

  it('caps at 100 entries, dropping the oldest', () => {
    const h = new History(docWithDepth(0), 100);
    for (let i = 1; i <= 150; i++) h.push(docWithDepth(i), `edit ${i}`);
    let steps = 0;
    let last: Doc | null = null;
    for (let d = h.undo(); d; d = h.undo()) {
      steps++;
      last = d;
    }
    expect(steps).toBe(99); // 100 stored entries means 99 steps back
    expect(depthOf(last)).toBe(51); // edits 1 to 50 were dropped
  });

  it('snapshots are not aliased', () => {
    const initial = docWithDepth(10);
    const h = new History(initial);
    initial.parts[0].depthMm = 999; // changing the caller's copy must not change history

    const next = docWithDepth(20);
    h.push(next, 'Thicker');
    next.parts[0].depthMm = 888;

    const back = h.undo()!;
    expect(depthOf(back)).toBe(10);
    back.parts[0].depthMm = 777; // changing a returned copy must not change history

    const fwd = h.redo()!;
    expect(depthOf(fwd)).toBe(20);
    expect(depthOf(h.undo())).toBe(10);
    expect(depthOf(h.current)).toBe(10);
  });

  it('remembers what each step was, for the Undo button', () => {
    const h = new History(docWithDepth(10));
    expect(h.undoLabel).toBeNull();
    h.push(docWithDepth(20), 'Make it thicker');
    expect(h.undoLabel).toBe('Make it thicker');
    h.undo();
    expect(h.undoLabel).toBeNull();
    expect(h.redoLabel).toBe('Make it thicker');
  });
});
