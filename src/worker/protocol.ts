import type { Doc } from '../core/doc/types';
import type { MeshData } from '../core/geom/surfaceNets';

/** draft = coarse and quick, used while the user is dragging. final = finer, used once they stop. */
export type Quality = 'draft' | 'final';

export interface MesherRequest {
  jobId: number;
  doc: Doc;
  voxelMm: number;
  quality: Quality;
}

export interface MesherResponse {
  jobId: number;
  /** Its buffers are transferred from the worker, not copied. */
  mesh: MeshData;
  /** How long the worker took, milliseconds. */
  ms: number;
}

/** Messages the page sends to the worker. */
export type WorkerIn =
  | { type: 'mesh'; request: MesherRequest }
  /** Tells the worker a newer job exists, so a running chunked job can stop early. */
  | { type: 'supersede'; jobId: number }
  /** Asks for a short speed test. */
  | { type: 'bench'; id: number; budgetMs: number };

/** Messages the worker sends back. */
export type WorkerOut =
  | { type: 'mesh'; response: MesherResponse }
  | { type: 'cancelled'; jobId: number }
  | { type: 'error'; jobId: number; message: string }
  | { type: 'bench'; id: number; msPerMesh: number; runs: number };

/** The parts of a Worker that the scheduler uses. A test double can stand in for it. */
export interface MesherWorker {
  postMessage(message: WorkerIn, transfer?: Transferable[]): void;
  terminate(): void;
  onmessage: ((event: { data: WorkerOut }) => void) | null;
  onerror: ((event: unknown) => void) | null;
}
