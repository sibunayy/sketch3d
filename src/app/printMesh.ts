import type { Doc } from '../core/doc/types';
import type { MeshData } from '../core/geom/surfaceNets';
import { createMesherWorker } from '../worker/createWorker';

/** Fine enough for a good print, in millimetres. */
export const PRINT_VOXEL_MM = 0.5;

/**
 * Builds the print-quality mesh in a background worker of its own, so the screen stays alive.
 * Rejects if the worker fails or takes longer than `timeoutMs`.
 */
export function meshForPrint(doc: Doc, voxelMm = PRINT_VOXEL_MM, timeoutMs = 120_000): Promise<MeshData> {
  return new Promise((resolve, reject) => {
    const worker = createMesherWorker();
    const done = (fn: () => void) => {
      clearTimeout(timer);
      worker.terminate();
      fn();
    };
    const timer = setTimeout(() => done(() => reject(new Error('Building the toy took too long.'))), timeoutMs);
    worker.onmessage = (e) => {
      const m = e.data;
      if (m.type === 'mesh') done(() => resolve(m.response.mesh));
      else if (m.type === 'cancelled') done(() => reject(new Error('The job was dropped.')));
      else if (m.type === 'error') done(() => reject(new Error(m.message)));
    };
    worker.onerror = () => done(() => reject(new Error('The 3D worker stopped.')));
    worker.postMessage({ type: 'mesh', request: { jobId: 1, doc, voxelMm, quality: 'final' } });
  });
}
