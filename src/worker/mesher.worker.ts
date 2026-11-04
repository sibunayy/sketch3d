import type { OutlineCache } from '../core/geom/sdf';
import { meshDocument } from './meshJob';
import { runMicroBenchmark } from './microBench';
import type { MesherRequest, WorkerIn, WorkerOut } from './protocol';

/**
 * The mesher worker. All the heavy maths happens here so the page never freezes.
 * It only keeps the newest job: older ones are dropped, and a long job stops when a newer one arrives.
 */
const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<WorkerIn>) => void) | null;
  postMessage(message: WorkerOut, transfer?: Transferable[]): void;
};

const cache: OutlineCache = new Map();
let newest = 0; // highest job number seen so far
let pending: MesherRequest | null = null;
let busy = false;

// A message-channel round trip gives the worker a chance to hear about newer jobs
// (unlike setTimeout, it is not slowed down to 4 ms).
const channel = new MessageChannel();
const yieldNow = (): Promise<void> =>
  new Promise((resolve) => {
    channel.port1.onmessage = () => resolve();
    channel.port2.postMessage(0);
  });

async function drain(): Promise<void> {
  busy = true;
  try {
    while (pending) {
      const request = pending;
      pending = null;
      if (request.jobId < newest) {
        ctx.postMessage({ type: 'cancelled', jobId: request.jobId });
        continue;
      }
      try {
        const t0 = performance.now();
        const mesh = await meshDocument(request.doc, request.voxelMm, request.quality, {
          cache,
          isCurrent: () => request.jobId >= newest,
          yieldNow,
        });
        if (!mesh) {
          ctx.postMessage({ type: 'cancelled', jobId: request.jobId });
        } else {
          const ms = performance.now() - t0;
          // hand the buffers over instead of copying them
          ctx.postMessage({ type: 'mesh', response: { jobId: request.jobId, mesh, ms } }, [
            mesh.positions.buffer,
            mesh.normals.buffer,
            mesh.indices.buffer,
            mesh.partIds.buffer,
          ]);
        }
      } catch (e) {
        ctx.postMessage({ type: 'error', jobId: request.jobId, message: e instanceof Error ? e.message : String(e) });
      }
    }
  } finally {
    busy = false;
  }
}

ctx.onmessage = (e) => {
  const m = e.data;
  if (m.type === 'supersede') {
    newest = Math.max(newest, m.jobId);
  } else if (m.type === 'mesh') {
    newest = Math.max(newest, m.request.jobId);
    if (pending) ctx.postMessage({ type: 'cancelled', jobId: pending.jobId }); // replaced before it started
    pending = m.request;
    if (!busy) void drain();
  } else if (m.type === 'bench') {
    const { msPerMesh, runs } = runMicroBenchmark(m.budgetMs);
    ctx.postMessage({ type: 'bench', id: m.id, msPerMesh, runs });
  }
};
