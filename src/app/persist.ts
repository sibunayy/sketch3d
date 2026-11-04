import { signal } from '@preact/signals';
import { DocError, createDoc } from '../core/doc/schema';
import type { Doc } from '../core/doc/types';
import { Autosave } from '../storage/autosave';
import { IdbBackend, ProjectStore, requestPersistence } from '../storage/db';
import type { ProjectMeta } from '../storage/db';
import { exportProjectFile, importLegacyOnce, importProjectFile } from '../storage/projectFile';
import { copy } from '../ui/copy';
import type { Store } from './state';
import { viewportRef } from './viewportRef';

const newId = () => `t${Date.now().toString(36)}${Math.random().toString(36).slice(2, 6)}`;

/** Which toy is open, and how it is being saved. */
export const currentToyId = signal<string>(newId());

function download(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}

/**
 * Brings the last toy back, then keeps saving it as it changes. If the browser will not let us store
 * anything, the app carries on and says so.
 */
export async function startPersistence(store: Store) {
  // If storage is blocked the app still works; saving just reports "not saved" instead of pretending.
  const projects = new ProjectStore(new IdbBackend());
  let askedForPersistence = false;

  const autosave = new Autosave(async (doc) => {
    const thumb = (await viewportRef.current?.snapshotBlob(160)) ?? null;
    const result = await projects.save(currentToyId.value, doc, thumb);
    if (result.ok) {
      void projects.setCurrent(currentToyId.value);
      if (!askedForPersistence) {
        askedForPersistence = true;
        void requestPersistence();
      }
    }
    return result;
  });
  autosave.onProblem(() => store.toast(copy.toastCantSave));

  // ---- bring back the last toy (or the prototype's, once) ----
  let started = false;
  try {
    const id = await projects.currentId();
    const saved = id ? await projects.load(id) : null;
    if (id && saved) {
      currentToyId.value = id;
      store.load(saved);
      started = true;
    }
  } catch {
    // start fresh
  }
  if (!started) {
    const old = importLegacyOnce();
    if (old) {
      store.load(old);
      autosave.notify(old); // keep the old toy in the new place
    }
  }

  // ---- keep saving ----
  store.onDocChange((doc) => autosave.notify(doc));
  const flush = () => void autosave.flush();
  document.addEventListener('visibilitychange', () => {
    if (document.visibilityState === 'hidden') flush();
  });
  window.addEventListener('pagehide', flush);

  const api = {
    status: autosave.status,
    list: (): Promise<ProjectMeta[]> => projects.list(),
    thumb: (id: string) => projects.thumb(id),

    async open(id: string): Promise<void> {
      await autosave.flush();
      const doc = await projects.load(id);
      if (!doc) {
        store.toast(copy.changeFailed);
        return;
      }
      currentToyId.value = id;
      store.load(doc);
      void projects.setCurrent(id);
      store.toast(copy.toastOpened);
    },

    async newToy(): Promise<void> {
      await autosave.flush();
      currentToyId.value = newId();
      store.load(createDoc());
      store.toast(copy.toastNewToy);
    },

    async remove(id: string): Promise<void> {
      await projects.delete(id);
      if (id === currentToyId.value) {
        currentToyId.value = newId();
        store.load(createDoc());
      }
    },

    saveFile(): void {
      download(exportProjectFile(store.doc.value), 'my-toy.sketch3d.json');
      store.toast(copy.toastFileSaved);
    },

    async openFile(file: File): Promise<void> {
      try {
        const doc: Doc = await importProjectFile(file);
        await autosave.flush();
        currentToyId.value = newId();
        store.load(doc);
        autosave.notify(doc);
        store.toast(copy.toastOpened);
      } catch (e) {
        store.toast(e instanceof DocError ? e.message : copy.changeFailed);
      }
    },

    flush: () => autosave.flush(),
  };
  return api;
}

export type Persistence = Awaited<ReturnType<typeof startPersistence>>;
