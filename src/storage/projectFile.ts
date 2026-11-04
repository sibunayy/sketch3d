import { DocError } from '../core/doc/schema';
import { migrate } from '../core/doc/migrate';
import type { Doc } from '../core/doc/types';

const NOT_A_TOY = "That file isn't a Sketch3D toy.";

/** A toy as a file a child can keep, share or move to another device. */
export function exportProjectFile(doc: Doc): Blob {
  return new Blob([JSON.stringify({ app: 'sketch3d', format: 1, doc })], { type: 'application/json' });
}

const isRecord = (v: unknown): v is Record<string, unknown> => typeof v === 'object' && v !== null && !Array.isArray(v);

/** Opens a toy from a file. Throws DocError with a message a child can read. */
export async function importProjectFile(file: File): Promise<Doc> {
  let parsed: unknown;
  try {
    parsed = JSON.parse(await file.text());
  } catch {
    throw new DocError(NOT_A_TOY, 'not JSON');
  }
  if (isRecord(parsed) && parsed.app === 'sketch3d' && isRecord(parsed.doc)) return migrate(parsed.doc);
  // a toy saved by the prototype is a plain object with parts that have outlines
  if (isRecord(parsed) && Array.isArray(parsed.parts) && parsed.parts.every((p) => isRecord(p) && Array.isArray(p.pts))) return migrate(parsed);
  throw new DocError(NOT_A_TOY, 'no sketch3d marker');
}

const LEGACY_KEY = 'sketch3d.v2';
const DONE_KEY = 'sketch3d.v2.imported';

/**
 * The prototype kept its toy in localStorage. Bring it in once, then remember that we did, so a toy
 * that is later deleted never comes back. Returns null if there is nothing to bring in.
 */
export function importLegacyOnce(storage: Storage = localStorage): Doc | null {
  try {
    if (storage.getItem(DONE_KEY)) return null;
    const raw = storage.getItem(LEGACY_KEY);
    if (!raw) return null;
    storage.setItem(DONE_KEY, '1'); // mark first, so a damaged save is not tried again and again
    const doc = migrate(JSON.parse(raw));
    return doc.parts.length > 0 ? doc : null;
  } catch {
    return null;
  }
}
