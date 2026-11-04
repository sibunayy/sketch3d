import data from './presetData.json';
import { createDoc } from './schema';
import { migrate } from './migrate';
import type { Doc } from './types';

export interface Preset {
  id: string;
  name: string;
  description: string;
  /** A fresh copy of the toy each time. */
  make(): Doc;
}

const ready = Object.entries(data as Record<string, { name: string; description: string; doc: unknown }>).map(
  ([id, p]): Preset => ({ id, name: p.name, description: p.description, make: () => migrate(structuredClone(p.doc)) }),
);

/** A blank plate, then the ready-made toys from the prototype. */
export const PRESETS: Preset[] = [
  { id: 'blank', name: 'Blank', description: 'An empty plate. Draw anything!', make: createDoc },
  ...ready,
];
