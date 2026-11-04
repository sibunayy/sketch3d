import { signal } from '@preact/signals';
import type { MeshData } from '../core/geom/surfaceNets';
import { createMesherWorker, runBenchInWorker } from '../worker/createWorker';
import { MeshScheduler } from '../worker/scheduler';
import { detectTier } from './perfTier';
import type { Store } from './state';

/** The newest mesh to show, and what it was made from. */
export const latestMesh = signal<{ mesh: MeshData; colors: string[] } | null>(null);
/** True while a mesh is being made, for a "working" hint. */
export const meshBusy = signal(false);

/**
 * Starts the mesher worker, picks a speed tier, and keeps the 3D mesh up to date with the toy.
 * Returns a function that stops it.
 */
export function startMesher(store: Store): () => void {
  const scheduler = new MeshScheduler(createMesherWorker, 'mid');
  let colorsAtRequest: string[] = [];

  scheduler.onMesh((mesh) => {
    latestMesh.value = { mesh, colors: colorsAtRequest };
    meshBusy.value = scheduler.busy;
  });
  scheduler.onError(() => {
    meshBusy.value = false;
  });

  const request = () => {
    colorsAtRequest = store.doc.value.parts.map((p) => p.color);
    scheduler.request(store.doc.value, 'draft');
    meshBusy.value = true;
  };
  store.onDocChange(request);
  request();

  // find out how fast this device is (in the worker, so the page is never held up), then use it
  const benchWorker = createMesherWorker();
  void detectTier(() => runBenchInWorker(benchWorker, 50)).then((tier) => {
    scheduler.setTier(tier);
    benchWorker.terminate();
    request();
  });

  return () => scheduler.dispose();
}
