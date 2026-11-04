import { describe, expect, it, vi } from 'vitest';
import { createStore } from '../../src/app/state';
import { JARGON, makeDoc, makePart } from './helpers/docs';

const twoParts = () => makeDoc([makePart({ id: 'a', name: 'Head' }), makePart({ id: 'b', name: 'Body' })]);

describe('commit, undo and redo', () => {
  it('commit then undo restores the previous doc and selection', () => {
    const s = createStore(twoParts());
    s.select(['a']);
    s.commit('Rename', (d) => {
      d.parts[0].name = 'Big head';
    });
    s.select(['b']); // changes the selection, which is not an undo step
    expect(s.doc.value.parts[0].name).toBe('Big head');

    s.undo();
    expect(s.doc.value.parts[0].name).toBe('Head');
    expect([...s.selection.value]).toEqual(['a']);

    s.redo();
    expect(s.doc.value.parts[0].name).toBe('Big head');
    expect([...s.selection.value]).toEqual(['b']);
  });

  it('commit makes one undo step, however many things the change touches', () => {
    const s = createStore(twoParts());
    s.commit('Thicker', (d) => d.parts.forEach((p) => (p.depthMm = 30)));
    s.undo();
    expect(s.doc.value.parts.map((p) => p.depthMm)).toEqual([16, 16]);
    expect(s.canUndo.value).toBe(false);
  });

  it('canUndo and canRedo follow the history', () => {
    const s = createStore(twoParts());
    expect([s.canUndo.value, s.canRedo.value]).toEqual([false, false]);
    s.commit('x', (d) => (d.parts[0].z = 3));
    expect([s.canUndo.value, s.canRedo.value]).toEqual([true, false]);
    s.undo();
    expect([s.canUndo.value, s.canRedo.value]).toEqual([false, true]);
  });

  it('undo and redo with nothing to do change nothing and do not throw', () => {
    const s = createStore(twoParts());
    const before = s.doc.value;
    s.undo();
    s.redo();
    expect(s.doc.value).toBe(before);
  });

  it('undoing a delete brings the part back, and a deleted part leaves the selection', () => {
    const s = createStore(twoParts());
    s.select(['a']);
    s.commit('Delete', (d) => {
      d.parts = d.parts.filter((p) => p.id !== 'a');
    });
    expect([...s.selection.value]).toEqual([]);
    s.undo();
    expect(s.doc.value.parts.map((p) => p.id)).toEqual(['a', 'b']);
    expect([...s.selection.value]).toEqual(['a']);
  });

  it('tells listeners (the mesher) after every change, undo and redo', () => {
    const s = createStore(twoParts());
    const seen = vi.fn();
    s.onDocChange(seen);
    s.commit('x', (d) => (d.parts[0].z = 3));
    s.undo();
    s.redo();
    expect(seen).toHaveBeenCalledTimes(3);
  });
});

describe('a mutation that makes the toy invalid', () => {
  it('is rejected, shows a friendly toast and leaves the doc unchanged', () => {
    const s = createStore(twoParts());
    const before = s.doc.value;
    const ok = s.commit('Break it', (d) => {
      d.parts[0].depthMm = NaN;
    });
    expect(ok).toBe(false);
    expect(s.doc.value).toBe(before);
    expect(s.canUndo.value).toBe(false);
    expect(s.toasts.value).toHaveLength(1);
    expect(s.toasts.value[0].message).not.toMatch(JARGON);
  });

  it('is rejected when the change throws', () => {
    const s = createStore(twoParts());
    const ok = s.commit('Oops', () => {
      throw new Error('boom');
    });
    expect(ok).toBe(false);
    expect(s.toasts.value[0].message).not.toMatch(/boom/);
    expect(s.canUndo.value).toBe(false);
  });

  it('does not change the doc the caller edited, only a copy', () => {
    const s = createStore(twoParts());
    const original = s.doc.value;
    s.commit('Rename', (d) => (d.parts[0].name = 'New'));
    expect(original.parts[0].name).toBe('Head');
  });
});

describe('selection', () => {
  it('select replaces the selection', () => {
    const s = createStore(twoParts());
    s.select(['a']);
    s.select(['b']);
    expect([...s.selection.value]).toEqual(['b']);
  });

  it('select additive toggles membership', () => {
    const s = createStore(twoParts());
    s.select(['a'], true);
    s.select(['b'], true);
    expect([...s.selection.value].sort()).toEqual(['a', 'b']);
    s.select(['a'], true);
    expect([...s.selection.value]).toEqual(['b']);
  });

  it('ignores ids that are not parts', () => {
    const s = createStore(twoParts());
    s.select(['a', 'nope']);
    expect([...s.selection.value]).toEqual(['a']);
  });

  it('selecting nothing clears it', () => {
    const s = createStore(twoParts());
    s.select(['a']);
    s.select([]);
    expect(s.selection.value.size).toBe(0);
  });
});

describe('toasts', () => {
  it('can be added and dismissed, and the newest few are kept', () => {
    const s = createStore(twoParts());
    for (let i = 0; i < 8; i++) s.toast(`message ${i}`);
    expect(s.toasts.value.length).toBeLessThanOrEqual(3);
    const last = s.toasts.value[s.toasts.value.length - 1];
    expect(last.message).toBe('message 7');
    s.dismissToast(last.id);
    expect(s.toasts.value.find((t) => t.id === last.id)).toBeUndefined();
  });
});

describe('tool and view', () => {
  it('start on Select and the Front view, and can be changed', () => {
    const s = createStore(twoParts());
    expect(s.tool.value).toBe('select');
    expect(s.view.value).toBe('front');
    s.tool.value = 'draw';
    s.view.value = '3d';
    expect([s.tool.value, s.view.value]).toEqual(['draw', '3d']);
  });
});
