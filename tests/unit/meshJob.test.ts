import { describe, expect, it } from 'vitest';
import legacyV2 from '../fixtures/legacy-v2.json';
import { migrate } from '../../src/core/doc/migrate';
import { buildSceneField } from '../../src/core/geom/scene';
import { SHAPES } from '../../src/core/geom/shapes';
import { meshField } from '../../src/core/geom/surfaceNets';
import { meshDocument } from '../../src/worker/meshJob';
import { runMicroBenchmark } from '../../src/worker/microBench';
import { edgeManifold } from './helpers/mesh';
import { makeDoc, makePart } from './helpers/docs';

const ballDoc = () =>
  makeDoc([makePart({ id: 'a', kind: 'circle', outline: SHAPES.circle(-30, -30, 30, 30), depthMm: 60, round: 1 })]);

describe('meshDocument', () => {
  it('draft: meshes the whole document in one go', async () => {
    const mesh = (await meshDocument(ballDoc(), 1.5, 'draft', {}))!;
    expect(mesh.indices.length).toBeGreaterThan(0);
    expect(edgeManifold(mesh).ok).toBe(true);
    expect(mesh.cellKeys).toBeUndefined(); // an internal detail, not sent to the page
  });

  it('final: builds in chunks that join into the same surface as one go', async () => {
    const doc = ballDoc();
    const chunked = (await meshDocument(doc, 1, 'final', { yieldNow: async () => {} }))!;
    const whole = meshField(buildSceneField(doc, { voxelMm: 1 }), { voxelMm: 1 });
    expect(chunked.indices.length).toBe(whole.indices.length);
    expect(chunked.positions.length).toBe(whole.positions.length);
    expect(edgeManifold(chunked).ok).toBe(true);
  });

  it('final: lets the event loop breathe between chunks', async () => {
    let yields = 0;
    await meshDocument(ballDoc(), 1, 'final', { yieldNow: async () => void yields++ });
    expect(yields).toBeGreaterThan(5);
  });

  it('final: stops early when it is no longer the latest job, and returns null', async () => {
    let yields = 0;
    let current = true;
    const result = await meshDocument(ballDoc(), 1, 'final', {
      isCurrent: () => current,
      yieldNow: async () => {
        yields++;
        if (yields === 2) current = false;
      },
    });
    expect(result).toBeNull();
    expect(yields).toBe(2);
  });

  it('does nothing if it is already out of date', async () => {
    expect(await meshDocument(ballDoc(), 1, 'draft', { isCurrent: () => false })).toBeNull();
  });

  it('an empty document gives an empty mesh, not null', async () => {
    const mesh = await meshDocument(makeDoc([]), 1, 'final', {});
    expect(mesh).not.toBeNull();
    expect(mesh!.indices).toHaveLength(0);
  });

  it('meshes the migrated prototype character', async () => {
    const doc = migrate(structuredClone(legacyV2));
    const mesh = (await meshDocument(doc, 1.2, 'draft', {}))!;
    expect(mesh.indices.length).toBeGreaterThan(1000);
    expect(new Set(mesh.partIds).size).toBeGreaterThanOrEqual(4); // head, body, arms, legs all show up
  });

  it('reuses outline grids between jobs through the cache', async () => {
    const cache = new Map();
    await meshDocument(ballDoc(), 2, 'draft', { cache });
    expect(cache.size).toBe(1);
    const first = cache.get('a').field;
    await meshDocument(ballDoc(), 2, 'draft', { cache });
    expect(cache.get('a').field).toBe(first);
  });
});

describe('runMicroBenchmark', () => {
  it('measures milliseconds per mesh and stops after about its time budget', () => {
    const t0 = performance.now();
    const r = runMicroBenchmark(40);
    const took = performance.now() - t0;
    expect(r.runs).toBeGreaterThanOrEqual(1);
    expect(r.msPerMesh).toBeGreaterThan(0);
    expect(Number.isFinite(r.msPerMesh)).toBe(true);
    expect(took).toBeLessThan(2000);
  });
});
