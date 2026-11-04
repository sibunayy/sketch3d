// Test page for the mesher worker. Playwright calls window.sketch3dWorkerTest from tests/e2e/worker.spec.ts.
import { createDoc } from '../src/core/doc/schema';
import type { Doc } from '../src/core/doc/types';
import { SHAPES } from '../src/core/geom/shapes';
import { detectTier } from '../src/app/perfTier';
import { createMesherWorker, runBenchInWorker } from '../src/worker/createWorker';
import { MeshScheduler } from '../src/worker/scheduler';

/** A ball of the given diameter. */
function ballDoc(diameter: number): Doc {
  const doc = createDoc();
  const r = diameter / 2;
  doc.parts.push({
    id: 'a', name: 'Ball', kind: 'circle', outline: SHAPES.circle(-r, -r, r, r), color: '#e5484d',
    depthMm: diameter, round: 1, z: 0, blend: 0, melt: false, cut: false, rot: { x: 0, y: 0, z: 0 }, taper: 0, squash: 0,
  });
  return doc;
}

function widthOf(positions: Float32Array): number {
  let lo = Infinity, hi = -Infinity;
  for (let i = 0; i < positions.length; i += 3) {
    lo = Math.min(lo, positions[i]);
    hi = Math.max(hi, positions[i]);
  }
  return hi - lo;
}

interface Shown { quality: string; width: number; triangles: number }

const api = {
  /** One request: waits for the final mesh. */
  async single(diameter: number): Promise<Shown[]> {
    const scheduler = new MeshScheduler(createMesherWorker, 'mid');
    const shown: Shown[] = [];
    const done = new Promise<void>((resolve) => {
      scheduler.onMesh((mesh, quality) => {
        shown.push({ quality, width: widthOf(mesh.positions), triangles: mesh.indices.length / 3 });
        if (quality === 'final') resolve();
      });
    });
    scheduler.request(ballDoc(diameter), 'draft');
    await done;
    scheduler.dispose();
    return shown;
  },

  /** A burst of requests, one per animation frame, like dragging a slider. Returns everything that reached the screen. */
  async burst(count: number): Promise<{ shown: Shown[]; lastDiameter: number }> {
    const scheduler = new MeshScheduler(createMesherWorker, 'mid');
    const shown: Shown[] = [];
    const done = new Promise<void>((resolve) => {
      scheduler.onMesh((mesh, quality) => {
        shown.push({ quality, width: widthOf(mesh.positions), triangles: mesh.indices.length / 3 });
        if (quality === 'final') resolve();
      });
    });
    let diameter = 0;
    for (let i = 0; i < count; i++) {
      diameter = 20 + i * 2; // each request is a bigger ball
      scheduler.request(ballDoc(diameter), 'draft');
      await new Promise((r) => requestAnimationFrame(() => r(null)));
    }
    await done;
    scheduler.dispose();
    return { shown, lastDiameter: diameter };
  },

  async tier(): Promise<string> {
    const worker = createMesherWorker();
    const tier = await detectTier(() => runBenchInWorker(worker, 50));
    worker.terminate();
    return tier;
  },
};

(window as unknown as { sketch3dWorkerTest: typeof api }).sketch3dWorkerTest = api;
document.title = 'ready';
