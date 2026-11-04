import { computed, signal } from '@preact/signals';
import type { ReadonlySignal } from '@preact/signals';
import { History } from '../core/doc/history';
import { DocError, createDoc, validateDoc } from '../core/doc/schema';
import type { Doc } from '../core/doc/types';
import { copy } from '../ui/copy';

export type ViewName = 'front' | 'side' | '3d';
export interface Toast {
  id: number;
  message: string;
  /** Optional button, such as "Undo". */
  action?: { label: string; run: () => void };
}

const MAX_TOASTS = 3;
const MAX_STEPS = 100;

/**
 * Everything the screens show, in one place. Screens read the signals; changes go through
 * `commit`, which checks them, keeps undo history, and tells the mesher.
 */
export function createStore(initial: Doc = createDoc()) {
  const doc = signal<Doc>(initial);
  const selection = signal<ReadonlySet<string>>(new Set());
  const tool = signal<string>('select');
  const view = signal<ViewName>('front');
  const toasts = signal<Toast[]>([]);

  let history = new History(initial, MAX_STEPS);
  // The selection to go back to for each history step, kept in step with History.
  let selections: string[][] = [[]];
  let index = 0;
  const version = signal(0); // bumps on every history move so canUndo / canRedo update
  const canUndo = computed(() => (version.value, history.canUndo));
  const canRedo = computed(() => (version.value, history.canRedo));

  const listeners: ((d: Doc) => void)[] = [];
  const changed = () => {
    version.value++;
    for (const cb of listeners.slice()) cb(doc.value);
  };

  let toastId = 1;
  const toast = (message: string, action?: Toast['action']): number => {
    const id = toastId++;
    toasts.value = [...toasts.value, { id, message, action }].slice(-MAX_TOASTS);
    return id;
  };
  const dismissToast = (id: number) => {
    toasts.value = toasts.value.filter((t) => t.id !== id);
  };

  const prune = (ids: Iterable<string>, d: Doc): Set<string> => {
    const have = new Set(d.parts.map((p) => p.id));
    return new Set([...ids].filter((id) => have.has(id)));
  };

  const select = (ids: string[], additive = false) => {
    const next = additive ? new Set(selection.value) : new Set<string>();
    const have = new Set(doc.value.parts.map((p) => p.id));
    for (const id of ids) {
      if (!have.has(id)) continue;
      if (additive && next.has(id)) next.delete(id);
      else next.add(id);
    }
    selection.value = next;
  };

  /**
   * Makes a change as one undo step. `mutate` edits a copy. If the result is not a good toy, or `mutate`
   * throws, nothing changes and the child sees a friendly message. Returns whether the change was made.
   */
  const commit = (label: string, mutate: (draft: Doc) => void): boolean => {
    let next: Doc;
    try {
      const draft = structuredClone(doc.value);
      mutate(draft);
      next = validateDoc(draft);
    } catch (e) {
      toast(e instanceof DocError ? e.message : copy.changeFailed);
      return false;
    }
    selections[index] = [...selection.value]; // remember what was selected before this change
    history.push(next, label);
    selections = selections.slice(0, index + 1);
    selections.push([...prune(selection.value, next)]);
    if (selections.length > MAX_STEPS) selections.shift();
    index = selections.length - 1;
    doc.value = next;
    selection.value = prune(selection.value, next);
    changed();
    return true;
  };

  const undo = () => {
    const prev = history.undo();
    if (!prev) return;
    selections[index] = [...selection.value];
    index--;
    doc.value = prev;
    selection.value = prune(selections[index], prev);
    changed();
  };

  const redo = () => {
    const next = history.redo();
    if (!next) return;
    selections[index] = [...selection.value];
    index++;
    doc.value = next;
    selection.value = prune(selections[index], next);
    changed();
  };

  /** Starts again from a loaded toy. Clears history. */
  const load = (d: Doc) => {
    const clean = validateDoc(d);
    doc.value = clean;
    selection.value = new Set();
    history = new History(clean, MAX_STEPS);
    selections = [[]];
    index = 0;
    changed();
  };

  return {
    doc,
    selection,
    tool,
    view,
    toasts,
    canUndo: canUndo as ReadonlySignal<boolean>,
    canRedo: canRedo as ReadonlySignal<boolean>,
    get history() {
      return history;
    },
    commit,
    undo,
    redo,
    select,
    load,
    toast,
    dismissToast,
    /** Called with the new document after every change, undo, redo and load. */
    onDocChange(cb: (d: Doc) => void) {
      listeners.push(cb);
    },
  };
}

export type Store = ReturnType<typeof createStore>;

/** The one store the running app uses. */
export const app: Store = createStore();
