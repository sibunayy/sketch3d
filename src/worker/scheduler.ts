import { voxelFor } from '../app/perfTier';
import type { PerfTier } from '../app/perfTier';
import type { Doc } from '../core/doc/types';
import type { MeshData } from '../core/geom/surfaceNets';
import type { MesherRequest, MesherWorker, Quality, WorkerOut } from './protocol';

/** After this long without a new edit, the finer "final" mesh is made. */
export const FINAL_DELAY_MS = 150;

/** How long the worker should take for each kind of mesh (a little under the 40 ms and 400 ms budgets). */
export const TARGET_MS: Record<Quality, number> = { draft: 35, final: 350 };
/** The grid is never made more than this many times coarser than the tier's grid. */
export const MAX_SCALE = 3;

interface Job {
  quality: Quality;
  /** Which edit this job is for. A draft and its final share one edit. */
  edit: number;
}

type MeshListener = (mesh: MeshData, quality: Quality) => void;

/**
 * Sends documents to the mesher worker and decides which results the page may show.
 *
 * - One job runs at a time; only the newest request waits behind it.
 * - Edits get a quick coarse "draft" at once, and a finer "final" after a short pause.
 * - A result is shown only if it is for the latest edit and newer than what is already on screen,
 *   so a slow old result can never replace a newer one.
 * - It watches how long each mesh took. If meshing is slow on this device or for this toy, the next mesh
 *   uses a coarser grid, and it goes back to the tier's grid when things are quick again.
 */
export class MeshScheduler {
  private worker: MesherWorker | null;
  private tier: PerfTier;
  private readonly finalDelayMs: number;
  private readonly listeners: MeshListener[] = [];
  private readonly errorListeners: ((message: string) => void)[] = [];

  private nextJobId = 1;
  private edit = 0;
  private lastShownJobId = 0;
  private runningId = 0;
  private queued: MesherRequest | null = null;
  private readonly jobs = new Map<number, Job>(); // running and waiting jobs only
  private timer: ReturnType<typeof setTimeout> | null = null;
  private latestDoc: Doc | null = null;
  /** How many times coarser than the tier's grid each kind of mesh currently is. 1 means the tier grid. */
  private readonly scale: Record<Quality, number> = { draft: 1, final: 1 };

  constructor(workerFactory: () => MesherWorker, tier: PerfTier, opts: { finalDelayMs?: number } = {}) {
    this.tier = tier;
    this.finalDelayMs = opts.finalDelayMs ?? FINAL_DELAY_MS;
    const worker = workerFactory();
    this.worker = worker;
    worker.onmessage = (e) => this.handle(e.data);
    worker.onerror = () => this.handle({ type: 'error', jobId: this.runningId, message: 'The 3D worker stopped.' });
  }

  /** Mesh this document: a draft now (unless `final` is asked for), and a final after a pause. */
  request(doc: Doc, quality: Quality): void {
    if (!this.worker) return;
    this.edit++;
    this.latestDoc = structuredClone(doc); // the caller may change its copy before the final is made
    if (this.timer !== null) clearTimeout(this.timer);
    if (quality === 'draft') this.submit(doc, 'draft');
    this.timer = setTimeout(() => {
      this.timer = null;
      if (this.latestDoc) this.submit(this.latestDoc, 'final');
    }, this.finalDelayMs);
  }

  /** Called with each mesh that is fine to show. */
  onMesh(cb: MeshListener): () => void {
    this.listeners.push(cb);
    return () => {
      const i = this.listeners.indexOf(cb);
      if (i >= 0) this.listeners.splice(i, 1);
    };
  }

  /** Called when the worker reports a problem. The scheduler carries on with the next job. */
  onError(cb: (message: string) => void): void {
    this.errorListeners.push(cb);
  }

  setTier(tier: PerfTier): void {
    this.tier = tier;
    this.scale.draft = 1;
    this.scale.final = 1;
  }

  /** How much coarser than the tier's grid meshes are now (1 = not coarser). For tests and diagnostics. */
  get qualityScale(): { draft: number; final: number } {
    return { ...this.scale };
  }

  /** True while a mesh is being made, waiting, or about to be made. Used to show progress. */
  get busy(): boolean {
    return this.runningId !== 0 || this.queued !== null || this.timer !== null;
  }

  /** How many jobs the scheduler is still tracking. At most 2 (running and waiting). */
  get trackedJobs(): number {
    return this.jobs.size;
  }

  dispose(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    this.queued = null;
    this.jobs.clear();
    this.latestDoc = null;
    this.listeners.length = 0;
    if (this.worker) {
      this.worker.onmessage = null;
      this.worker.onerror = null;
      this.worker.terminate();
    }
    this.worker = null;
  }

  private submit(doc: Doc, quality: Quality): void {
    const worker = this.worker;
    if (!worker) return;
    const jobId = this.nextJobId++;
    const request: MesherRequest = { jobId, doc, voxelMm: voxelFor(this.tier, quality) * this.scale[quality], quality };
    if (this.queued) this.jobs.delete(this.queued.jobId); // the waiting job is replaced
    this.jobs.set(jobId, { quality, edit: this.edit });
    if (this.runningId === 0) {
      this.send(request);
    } else {
      this.queued = request;
      worker.postMessage({ type: 'supersede', jobId }); // lets a long chunked job stop early
    }
  }

  private send(request: MesherRequest): void {
    this.runningId = request.jobId;
    this.worker?.postMessage({ type: 'mesh', request });
  }

  /** Nudges the grid size so meshes take about TARGET_MS. Slow: coarser at once. Quick: finer again, slowly. */
  private adapt(quality: Quality, ms: number): void {
    if (!Number.isFinite(ms) || ms <= 0) return;
    const ratio = ms / TARGET_MS[quality];
    let s = this.scale[quality];
    // meshing time grows with the cube of how fine the grid is, hence the cube root
    if (ratio > 1.25) s *= Math.min(1.6, Math.cbrt(ratio));
    else if (ratio < 0.7 && s > 1) s /= Math.min(1.25, Math.cbrt(1 / ratio));
    this.scale[quality] = Math.min(MAX_SCALE, Math.max(1, s));
  }

  private finish(jobId: number): void {
    if (jobId === this.runningId) {
      this.runningId = 0;
      const next = this.queued;
      this.queued = null;
      if (next) this.send(next);
    }
  }

  private handle(msg: WorkerOut): void {
    if (!this.worker) return;
    switch (msg.type) {
      case 'mesh': {
        const { jobId, mesh } = msg.response;
        const job = this.jobs.get(jobId);
        if (job) this.adapt(job.quality, msg.response.ms); // even an old result tells us how long meshing takes
        if (job && job.edit === this.edit && jobId > this.lastShownJobId) {
          this.lastShownJobId = jobId;
          for (const cb of this.listeners.slice()) cb(mesh, job.quality);
        }
        this.jobs.delete(jobId);
        this.finish(jobId);
        break;
      }
      case 'cancelled':
        this.jobs.delete(msg.jobId);
        this.finish(msg.jobId);
        break;
      case 'error': {
        const jobId = msg.jobId || this.runningId;
        this.jobs.delete(jobId);
        for (const cb of this.errorListeners.slice()) cb(msg.message);
        this.finish(jobId);
        break;
      }
      default:
        break; // speed-test replies are handled by whoever asked for them
    }
  }
}
