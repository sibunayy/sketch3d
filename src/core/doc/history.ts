import type { Doc } from './types';

interface Entry {
  doc: Doc;
  label: string;
}

/**
 * Undo and redo. Each step is a full copy of the document (it is small), so nothing
 * stored here can be changed by code that holds on to a document it was given or returned.
 * `max` is the number of stored states, including the starting one.
 */
export class History {
  private entries: Entry[];
  private index = 0;
  private readonly max: number;

  constructor(initial: Doc, max = 100) {
    this.max = Math.max(2, Math.floor(max));
    this.entries = [{ doc: structuredClone(initial), label: 'Start' }];
  }

  /** Record a new state. Anything that could have been redone is dropped. */
  push(doc: Doc, label: string): void {
    this.entries.length = this.index + 1;
    this.entries.push({ doc: structuredClone(doc), label });
    if (this.entries.length > this.max) this.entries.shift();
    this.index = this.entries.length - 1;
  }

  undo(): Doc | null {
    if (!this.canUndo) return null;
    this.index--;
    return structuredClone(this.entries[this.index].doc);
  }

  redo(): Doc | null {
    if (!this.canRedo) return null;
    this.index++;
    return structuredClone(this.entries[this.index].doc);
  }

  get canUndo(): boolean {
    return this.index > 0;
  }

  get canRedo(): boolean {
    return this.index < this.entries.length - 1;
  }

  /** A copy of the state we are on now. */
  get current(): Doc {
    return structuredClone(this.entries[this.index].doc);
  }

  /** What Undo would take back, for a button label. */
  get undoLabel(): string | null {
    return this.canUndo ? this.entries[this.index].label : null;
  }

  /** What Redo would bring back. */
  get redoLabel(): string | null {
    return this.canRedo ? this.entries[this.index + 1].label : null;
  }
}
