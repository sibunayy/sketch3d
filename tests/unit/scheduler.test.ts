import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { detectTier, tierFromBench, voxelFor } from '../../src/app/perfTier';
import type { MeshData } from '../../src/core/geom/surfaceNets';
import { MeshScheduler } from '../../src/worker/scheduler';
import type { MesherWorker, WorkerIn, WorkerOut } from '../../src/worker/protocol';
import { makeDoc, makePart } from './helpers/docs';

/** A stand-in for the real Worker: records what it is sent, and lets the test decide when replies arrive. */
class FakeWorker implements MesherWorker {
  posted: WorkerIn[] = [];
  terminated = false;
  onmessage: ((e: { data: WorkerOut }) => void) | null = null;
  onerror: ((e: unknown) => void) | null = null;
  postMessage(m: WorkerIn) {
    this.posted.push(m);
  }
  terminate() {
    this.terminated = true;
  }
  get meshJobs() {
    return this.posted.flatMap((m) => (m.type === 'mesh' ? [m.request] : []));
  }
  get supersedes() {
    return this.posted.flatMap((m) => (m.type === 'supersede' ? [m.jobId] : []));
  }
  reply(jobId: number, ms = 5) {
    this.onmessage?.({ data: { type: 'mesh', response: { jobId, mesh: meshFor(jobId), ms } } });
  }
  say(m: WorkerOut) {
    this.onmessage?.({ data: m });
  }
}

/** A tiny mesh whose first coordinate says which job made it. */
function meshFor(jobId: number): MeshData {
  return { positions: new Float32Array([jobId, 0, 0]), normals: new Float32Array([0, 0, 1]), indices: new Uint32Array(0), partIds: new Uint16Array(1) };
}

const doc = (n = 10) => makeDoc([makePart({ depthMm: n })]);

function setup(tier: 'low' | 'mid' | 'high' = 'mid') {
  const worker = new FakeWorker();
  const scheduler = new MeshScheduler(() => worker, tier);
  const got: { job: number; quality: string }[] = [];
  scheduler.onMesh((mesh, quality) => got.push({ job: mesh.positions[0], quality }));
  return { worker, scheduler, got };
}

beforeEach(() => vi.useFakeTimers());
afterEach(() => vi.useRealTimers());

describe('MeshScheduler: the latest edit wins (review focus 3)', () => {
  it('sends requests 1, 2, 3 and delivers results in the order 3, 1, 2: only job 3 reaches onMesh', () => {
    const { worker, scheduler, got } = setup();
    scheduler.request(doc(1), 'draft');
    scheduler.request(doc(2), 'draft');
    scheduler.request(doc(3), 'draft');

    // forged out-of-order replies, as a slow device could produce
    worker.reply(3);
    worker.reply(1);
    worker.reply(2);

    expect(got).toEqual([{ job: 3, quality: 'draft' }]);
  });

  it('runs one job at a time and keeps only the newest waiting', () => {
    const { worker, scheduler, got } = setup();
    scheduler.request(doc(1), 'draft');
    scheduler.request(doc(2), 'draft');
    scheduler.request(doc(3), 'draft');
    expect(worker.meshJobs.map((j) => j.jobId)).toEqual([1]); // 2 was dropped, 3 is waiting

    worker.reply(1); // old edit: not shown
    expect(got).toEqual([]);
    expect(worker.meshJobs.map((j) => j.jobId)).toEqual([1, 3]);

    worker.reply(3);
    expect(got).toEqual([{ job: 3, quality: 'draft' }]);
  });

  it('a result is shown at most once', () => {
    const { worker, scheduler, got } = setup();
    scheduler.request(doc(), 'draft');
    worker.reply(1);
    worker.reply(1);
    expect(got).toHaveLength(1);
  });

  it('a draft in flight is told it has been superseded by a newer request', () => {
    const { worker, scheduler } = setup();
    scheduler.request(doc(1), 'draft');
    scheduler.request(doc(2), 'draft');
    expect(worker.supersedes).toEqual([2]);
    scheduler.request(doc(3), 'draft');
    expect(worker.supersedes).toEqual([2, 3]);
    expect(worker.meshJobs).toHaveLength(1); // still only one running; the newest waits
  });

  it('moves straight on to the waiting job when the running one is cancelled', () => {
    const { worker, scheduler, got } = setup();
    scheduler.request(doc(1), 'draft');
    scheduler.request(doc(2), 'draft');
    worker.say({ type: 'cancelled', jobId: 1 });
    expect(worker.meshJobs.map((j) => j.jobId)).toEqual([1, 2]);
    worker.reply(2);
    expect(got).toEqual([{ job: 2, quality: 'draft' }]);
  });

  it('keeps going after the worker reports an error, and tells the listener', () => {
    const { worker, scheduler, got } = setup();
    const errors: string[] = [];
    scheduler.onError((m) => errors.push(m));
    scheduler.request(doc(1), 'draft');
    scheduler.request(doc(2), 'draft');
    worker.say({ type: 'error', jobId: 1, message: 'boom' });
    expect(errors).toEqual(['boom']);
    expect(worker.meshJobs.map((j) => j.jobId)).toEqual([1, 2]);
    worker.reply(2);
    expect(got).toHaveLength(1);
  });

  it('does not grow: after many requests nothing is left over', () => {
    const { worker, scheduler } = setup();
    for (let i = 0; i < 500; i++) {
      scheduler.request(doc(i + 1), 'draft');
      if (i % 3 === 0 && worker.meshJobs.length) worker.reply(worker.meshJobs[worker.meshJobs.length - 1].jobId);
    }
    vi.advanceTimersByTime(1000);
    for (let guard = 0; guard < 10 && scheduler.busy; guard++) worker.reply(worker.meshJobs[worker.meshJobs.length - 1].jobId);
    expect(scheduler.busy).toBe(false);
    expect(scheduler.trackedJobs).toBe(0);
  });
});

describe('MeshScheduler: draft now, final after a pause', () => {
  it('a final request is issued only after 150 ms with no new edits', () => {
    const { worker, scheduler } = setup();
    scheduler.request(doc(1), 'draft');
    worker.reply(1);
    vi.advanceTimersByTime(100);
    scheduler.request(doc(2), 'draft'); // another edit: the clock starts again
    worker.reply(2);
    vi.advanceTimersByTime(149);
    expect(worker.meshJobs.filter((j) => j.quality === 'final')).toHaveLength(0);
    vi.advanceTimersByTime(1);
    const finals = worker.meshJobs.filter((j) => j.quality === 'final');
    expect(finals).toHaveLength(1);
    expect(finals[0].doc.parts[0].depthMm).toBe(2); // for the latest edit
  });

  it('a final request goes out with the finer grid, and its result is delivered as final', () => {
    const { worker, scheduler, got } = setup('mid');
    scheduler.request(doc(), 'draft');
    worker.reply(1);
    vi.advanceTimersByTime(150);
    const [draft, final] = worker.meshJobs;
    expect(final.voxelMm).toBe(voxelFor('mid', 'final'));
    expect(draft.voxelMm).toBe(voxelFor('mid', 'draft'));
    expect(final.voxelMm).toBeLessThan(draft.voxelMm);
    worker.reply(final.jobId);
    expect(got.map((g) => g.quality)).toEqual(['draft', 'final']);
  });

  it("asking for 'final' directly waits for the pause and skips the draft", () => {
    const { worker, scheduler } = setup();
    scheduler.request(doc(), 'final');
    expect(worker.meshJobs).toHaveLength(0);
    vi.advanceTimersByTime(150);
    expect(worker.meshJobs.map((j) => j.quality)).toEqual(['final']);
  });

  it('a new edit while a final is being made supersedes it', () => {
    const { worker, scheduler, got } = setup();
    scheduler.request(doc(1), 'draft');
    worker.reply(1);
    vi.advanceTimersByTime(150); // final job 2 is running
    scheduler.request(doc(5), 'draft'); // job 3 waits
    expect(worker.supersedes).toContain(3);
    worker.say({ type: 'cancelled', jobId: 2 });
    expect(worker.meshJobs.map((j) => j.jobId)).toEqual([1, 2, 3]);
    worker.reply(3);
    expect(got.map((g) => g.job)).toEqual([1, 3]);
  });

  it('a draft that finishes after its final was requested is still shown (it is the latest edit)', () => {
    const { worker, scheduler, got } = setup();
    scheduler.request(doc(), 'draft'); // job 1 running
    vi.advanceTimersByTime(150); // final (job 2) queued behind it
    worker.reply(1);
    expect(got).toEqual([{ job: 1, quality: 'draft' }]);
    worker.reply(2);
    expect(got.map((g) => g.quality)).toEqual(['draft', 'final']);
  });

  it('a stale final is never shown over a newer edit', () => {
    const { worker, scheduler, got } = setup();
    scheduler.request(doc(1), 'final');
    vi.advanceTimersByTime(150); // final job 1 running
    scheduler.request(doc(2), 'draft'); // new edit
    worker.reply(1); // the old final limps in
    expect(got).toEqual([]);
  });
});

describe('MeshScheduler: adapts the grid to how long meshing takes', () => {
  const lastVoxel = (w: FakeWorker, q: 'draft' | 'final') => w.meshJobs.filter((j) => j.quality === q).pop()!.voxelMm;

  it('uses the tier grid at first', () => {
    const { worker, scheduler } = setup('mid');
    scheduler.request(doc(1), 'draft');
    expect(worker.meshJobs[0].voxelMm).toBe(voxelFor('mid', 'draft'));
    expect(scheduler.qualityScale.draft).toBe(1);
  });

  it('a slow draft makes the next draft coarser', () => {
    const { worker, scheduler } = setup('mid');
    scheduler.request(doc(1), 'draft');
    worker.reply(1, 140); // four times the 35 ms aim
    scheduler.request(doc(2), 'draft');
    expect(lastVoxel(worker, 'draft')).toBeGreaterThan(voxelFor('mid', 'draft') * 1.2);
  });

  it('keeps getting coarser while drafts stay slow, but never more than 3 times coarser', () => {
    const { worker, scheduler } = setup('mid');
    for (let i = 0; i < 40; i++) {
      scheduler.request(doc(i + 1), 'draft');
      const id = worker.meshJobs[worker.meshJobs.length - 1].jobId;
      worker.reply(id, 5000);
    }
    expect(scheduler.qualityScale.draft).toBe(3);
    expect(lastVoxel(worker, 'draft')).toBeCloseTo(voxelFor('mid', 'draft') * 3, 6);
  });

  it('goes back towards the tier grid when drafts are quick, but never finer than it', () => {
    const { worker, scheduler } = setup('mid');
    scheduler.request(doc(1), 'draft');
    worker.reply(1, 400);
    const coarse = scheduler.qualityScale.draft;
    expect(coarse).toBeGreaterThan(1.3);
    for (let i = 0; i < 30; i++) {
      scheduler.request(doc(i + 2), 'draft');
      worker.reply(worker.meshJobs[worker.meshJobs.length - 1].jobId, 3);
    }
    expect(scheduler.qualityScale.draft).toBe(1);
    expect(lastVoxel(worker, 'draft')).toBe(voxelFor('mid', 'draft'));
  });

  it('leaves a draft that is a little over alone (no flip-flopping)', () => {
    const { worker, scheduler } = setup('mid');
    scheduler.request(doc(1), 'draft');
    worker.reply(1, 38);
    expect(scheduler.qualityScale.draft).toBe(1);
  });

  it('final meshes adapt on their own scale', () => {
    const { worker, scheduler } = setup('mid');
    scheduler.request(doc(1), 'final');
    vi.advanceTimersByTime(150);
    const finalJob = worker.meshJobs[0];
    worker.reply(finalJob.jobId, 1400); // four times the 350 ms aim
    expect(scheduler.qualityScale.final).toBeGreaterThan(1.3);
    expect(scheduler.qualityScale.draft).toBe(1);
  });

  it('still learns from a result that is too old to show', () => {
    const { worker, scheduler, got } = setup('mid');
    scheduler.request(doc(1), 'draft');
    scheduler.request(doc(2), 'draft'); // job 1 is now stale
    worker.reply(1, 300);
    expect(got).toEqual([]);
    expect(scheduler.qualityScale.draft).toBeGreaterThan(1.3);
  });

  it('ignores nonsense timings', () => {
    const { worker, scheduler } = setup('mid');
    scheduler.request(doc(1), 'draft');
    worker.reply(1, NaN);
    expect(scheduler.qualityScale.draft).toBe(1);
  });
});

describe('MeshScheduler: dispose', () => {
  it('terminates the worker and ignores late results', () => {
    const { worker, scheduler, got } = setup();
    scheduler.request(doc(), 'draft');
    scheduler.dispose();
    expect(worker.terminated).toBe(true);
    worker.reply(1);
    expect(got).toEqual([]);
  });

  it('stops the pause timer and refuses new work', () => {
    const { worker, scheduler } = setup();
    scheduler.request(doc(), 'draft');
    worker.reply(1);
    scheduler.dispose();
    vi.advanceTimersByTime(1000);
    scheduler.request(doc(), 'draft');
    expect(worker.meshJobs).toHaveLength(1);
  });

  it('can be disposed twice', () => {
    const { scheduler } = setup();
    scheduler.dispose();
    expect(() => scheduler.dispose()).not.toThrow();
  });
});

describe('performance tiers', () => {
  it('voxelFor returns coarser values for the low tier and for draft', () => {
    for (const q of ['draft', 'final'] as const) {
      expect(voxelFor('low', q)).toBeGreaterThan(voxelFor('mid', q));
      expect(voxelFor('mid', q)).toBeGreaterThan(voxelFor('high', q));
    }
    for (const t of ['low', 'mid', 'high'] as const) expect(voxelFor(t, 'draft')).toBeGreaterThan(voxelFor(t, 'final'));
  });

  it('sorts a fast, a middling and a slow benchmark into high, mid and low', () => {
    expect(tierFromBench(10)).toBe('high'); // about this development machine
    expect(tierFromBench(40)).toBe('mid'); // a few times slower
    expect(tierFromBench(200)).toBe('low');
  });

  it('hints can lower a tier but never raise it', () => {
    expect(tierFromBench(10, { cores: 2 })).toBe('mid');
    expect(tierFromBench(10, { memoryGb: 2 })).toBe('mid');
    expect(tierFromBench(10, { cores: 2, memoryGb: 2 })).toBe('low');
    expect(tierFromBench(40, { cores: 2 })).toBe('low');
    expect(tierFromBench(200, { cores: 16, memoryGb: 16 })).toBe('low');
    expect(tierFromBench(10, { cores: 8, memoryGb: 8 })).toBe('high');
  });

  it('detectTier uses the benchmark and falls back to low if it fails', async () => {
    vi.useRealTimers();
    expect(await detectTier(async () => 10, {})).toBe('high');
    expect(await detectTier(async () => 10, { cores: 1 })).toBe('mid');
    expect(await detectTier(async () => Promise.reject(new Error('no worker')), {})).toBe('low');
    expect(await detectTier(async () => NaN, {})).toBe('low');
  });
});
