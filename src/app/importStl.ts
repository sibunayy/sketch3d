import type { Store } from './state';
import { importStl } from '../core/mesh/importStl';
import type { ImportedShape } from '../core/mesh/importStl';
import { STL_MESSAGES } from '../core/mesh/messages';
import { StlError } from '../core/mesh/stlRead';
import { newPart } from '../core/doc/partOps';
import type { ImportReply } from '../worker/importStl.worker';
import { copy } from '../ui/copy';

export type StlRunner = (buf: ArrayBuffer, name: string) => Promise<ImportedShape>;

/** Opens the file in a background worker (or right here where workers do not exist, as in tests). */
export const runInWorker: StlRunner = (buf, name) => {
  if (typeof Worker === 'undefined') return Promise.resolve().then(() => importStl(buf, name));
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('../worker/importStl.worker.ts', import.meta.url), { type: 'module' });
    const done = () => worker.terminate();
    worker.onmessage = (e: MessageEvent<ImportReply>) => {
      done();
      if (e.data.ok) resolve(e.data.shape);
      else reject(new StlError(e.data.message));
    };
    worker.onerror = () => {
      done();
      reject(new StlError(STL_MESSAGES.broken));
    };
    worker.postMessage({ buf, name }, [buf]);
  });
};

/** A file name made into a part name: no ".stl", not too long. */
export function nameFromFile(fileName: string): string {
  const base = fileName.replace(/\.[^./\\]*$/, '').replace(/[_-]+/g, ' ').trim();
  const name = base.length > 40 ? base.slice(0, 40).trim() : base;
  return name || 'Shape';
}

/**
 * Opens an STL file and adds it to the toy as a solid part, picked and ready to move.
 * Shows what is happening and what went wrong in plain words. Returns whether a part was added.
 */
export async function addStlFile(store: Store, file: File, run: StlRunner = runInWorker): Promise<boolean> {
  const opening = store.toast(copy.stlOpening);
  try {
    const shape = await run(await file.arrayBuffer(), nameFromFile(file.name));
    let id = '';
    const ok = store.commit('Add a shape', (d) => {
      const p = newPart(d, { kind: 'import', outline: shape.outline, depthMm: shape.depthMm, round: 1, name: shape.name, mesh: shape.mesh });
      d.parts.push(p);
      id = p.id;
    });
    store.dismissToast(opening);
    if (!ok || !id) return false;
    store.select([id]);
    store.toast(shape.scale < 1 ? copy.stlMadeSmaller : shape.scale > 1 ? copy.stlMadeBigger : copy.stlAdded);
    if (shape.hasGaps) store.toast(copy.stlHasGaps);
    return true;
  } catch (e) {
    store.dismissToast(opening);
    store.toast(e instanceof StlError ? e.message : copy.stlBroken);
    return false;
  }
}
