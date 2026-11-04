import type { MesherWorker, WorkerOut } from './protocol';

/** Starts the mesher in a background thread. Vite bundles it as its own file. */
export function createMesherWorker(): MesherWorker {
  return new Worker(new URL('./mesher.worker.ts', import.meta.url), { type: 'module' }) as unknown as MesherWorker;
}

/** Runs the short speed test in the worker. Resolves with milliseconds per standard mesh. */
export function runBenchInWorker(worker: MesherWorker, budgetMs = 50): Promise<number> {
  return new Promise((resolve, reject) => {
    const previous = worker.onmessage;
    const id = Math.floor(Math.random() * 1e9);
    const timeout = setTimeout(() => {
      worker.onmessage = previous;
      reject(new Error('The speed test took too long.'));
    }, 5000);
    worker.onmessage = (e: { data: WorkerOut }) => {
      if (e.data.type === 'bench' && e.data.id === id) {
        clearTimeout(timeout);
        worker.onmessage = previous;
        resolve(e.data.msPerMesh);
      } else {
        previous?.(e);
      }
    };
    worker.postMessage({ type: 'bench', id, budgetMs });
  });
}
