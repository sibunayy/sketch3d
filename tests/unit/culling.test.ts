import { describe, expect, it } from 'vitest';
import legacyV2 from '../fixtures/legacy-v2.json';
import { migrate } from '../../src/core/doc/migrate';
import { partFrame, worldToLocal } from '../../src/core/doc/frame';
import type { Dab, Doc, Part } from '../../src/core/doc/types';
import { buildSceneField } from '../../src/core/geom/scene';
import type { SceneField } from '../../src/core/geom/scene';
import { SHAPES } from '../../src/core/geom/shapes';
import { chunkGrid, mergeMeshes, meshChunk, meshField } from '../../src/core/geom/surfaceNets';
import type { MeshData } from '../../src/core/geom/surfaceNets';
import { edgeManifold } from './helpers/mesh';
import { makeDoc, makePart, rect } from './helpers/docs';

/** Counts how many times the mesher asks the field for a value. */
function counting(field: SceneField): { field: SceneField; calls: () => number } {
  let n = 0;
  return { field: { ...field, sample: (x, y, z) => (n++, field.sample(x, y, z)) }, calls: () => n };
}

function same(a: MeshData, b: MeshData) {
  expect(a.positions.length).toBe(b.positions.length);
  expect(a.indices.length).toBe(b.indices.length);
  expect(Array.from(a.positions)).toEqual(Array.from(b.positions));
  expect(Array.from(a.indices)).toEqual(Array.from(b.indices));
  expect(Array.from(a.partIds)).toEqual(Array.from(b.partIds));
}

const ball = (id: string, cx: number, r = 10, over: Partial<Part> = {}) =>
  makePart({ id, name: id, kind: 'circle', outline: SHAPES.circle(cx - r, -r, cx + r, r), depthMm: 2 * r, round: 1, ...over });

function randomDoc(seed: number): Doc {
  let s = seed;
  const rnd = () => ((s = (s * 16807) % 2147483647) / 2147483647);
  const names = ['circle', 'box', 'capsule', 'star', 'egg', 'heart', 'drop', 'moon'] as const;
  const parts: Part[] = [];
  const n = 2 + Math.floor(rnd() * 6);
  for (let i = 0; i < n; i++) {
    const w = 6 + rnd() * 22;
    const h = 6 + rnd() * 22;
    const cx = (rnd() - 0.5) * 50;
    const cy = (rnd() - 0.5) * 50;
    parts.push(
      makePart({
        id: `r${i}`,
        name: `r${i}`,
        outline: SHAPES[names[Math.floor(rnd() * names.length)]](cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2),
        depthMm: 3 + rnd() * 25,
        round: rnd(),
        z: (rnd() - 0.5) * 14,
        melt: rnd() < 0.5,
        blend: 3 + rnd() * 6,
        cut: i > 1 && rnd() < 0.2,
        rot: rnd() < 0.5 ? { x: rnd() * 60 - 30, y: rnd() * 60 - 30, z: rnd() * 90 - 45 } : { x: 0, y: 0, z: 0 },
        taper: rnd() < 0.3 ? rnd() * 60 - 30 : 0,
        squash: rnd() < 0.3 ? rnd() * 60 - 30 : 0,
      }),
    );
  }
  const doc = makeDoc(parts);
  const solids = parts.filter((p) => !p.cut);
  for (let d = 0; d < 12 && solids.length; d++) {
    const p = solids[Math.floor(rnd() * solids.length)];
    const types: Dab['type'][] = ['pull', 'push', 'smooth', 'grab'];
    const type = types[Math.floor(rnd() * 4)];
    const world: [number, number, number] = [(rnd() - 0.5) * 40, (rnd() - 0.5) * 40, (rnd() - 0.5) * 20];
    const at = worldToLocal(partFrame(p), world);
    const dab: Dab = { partId: p.id, type, at, radius: 2 + rnd() * 5, strength: 0.5 };
    if (type === 'grab') dab.drag = [(rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.4, (rnd() - 0.5) * 0.4];
    doc.dabs.push(dab);
  }
  if (rnd() < 0.5) doc.grooves.push({ points: [[-10, 0, 8], [10, 4, 8], [14, -6, 6]], radius: 1.8, mirror: rnd() < 0.5 });
  return doc;
}

describe('skipping far-away blocks gives exactly the same mesh', () => {
  it('for a ball', () => {
    const f = buildSceneField(makeDoc([ball('a', 0, 12)]), { voxelMm: 0.8 });
    same(meshField(f, { voxelMm: 0.8, cull: false }), meshField(f, { voxelMm: 0.8 }));
  });

  it('for the prototype character, at three grid sizes', () => {
    const doc = migrate(structuredClone(legacyV2));
    for (const v of [2.4, 1.2, 0.8]) {
      const f = buildSceneField(doc, { voxelMm: v });
      same(meshField(f, { voxelMm: v, cull: false }), meshField(f, { voxelMm: v }));
    }
  });

  it('for thin parts that a coarse check could step over (a 1 mm fin and a 1.5 mm sheet)', () => {
    const fin = makePart({ id: 'fin', outline: rect(30, 30), depthMm: 1, round: 0, z: 0 });
    const sheet = makePart({ id: 'sheet', outline: rect(1.5, 30, 40, 0), depthMm: 30, round: 0 });
    for (const v of [1.2, 0.6]) {
      const f = buildSceneField(makeDoc([fin, sheet]), { voxelMm: v });
      const full = meshField(f, { voxelMm: v, cull: false });
      expect(full.indices.length).toBeGreaterThan(0);
      same(full, meshField(f, { voxelMm: v }));
    }
  });

  it('for parts far apart (separate islands)', () => {
    const doc = makeDoc([ball('a', -50, 5), ball('b', 0, 3), ball('c', 50, 4)]);
    const f = buildSceneField(doc, { voxelMm: 1 });
    const full = meshField(f, { voxelMm: 1, cull: false });
    same(full, meshField(f, { voxelMm: 1 }));
    expect(edgeManifold(full).ok).toBe(true);
  });

  it('for a hole cut through a body', () => {
    const body = makePart({ id: 'b', outline: rect(30, 30), depthMm: 16, round: 0.4 });
    const hole = makePart({ id: 'h', cut: true, outline: SHAPES.circle(-5, -5, 5, 5), depthMm: 60 });
    const f = buildSceneField(makeDoc([body, hole]), { voxelMm: 0.7 });
    same(meshField(f, { voxelMm: 0.7, cull: false }), meshField(f, { voxelMm: 0.7 }));
  });

  it.each(Array.from({ length: 80 }, (_, i) => i + 1))(
    'for random toy number %i (turned, tapered, melted, cut, sculpted, grooved)',
    (seed) => {
      const doc = randomDoc(seed * 7919);
      const v = 0.7 + (seed % 7) * 0.25; // 0.7 to 2.2 mm
      const f = buildSceneField(doc, { voxelMm: v });
      same(meshField(f, { voxelMm: v, cull: false }), meshField(f, { voxelMm: v }));
    },
  );

  it('chunks made with skipping still join into the same mesh', () => {
    const f = buildSceneField(migrate(structuredClone(legacyV2)), { voxelMm: 1 });
    const keys = chunkGrid(f.bounds, 24, 1);
    const merged = mergeMeshes(keys.map((k) => meshChunk(f, k, 1)));
    const whole = meshField(f, { voxelMm: 1, cull: false });
    expect(merged.indices.length).toBe(whole.indices.length);
    expect(merged.positions.length).toBe(whole.positions.length);
    expect(edgeManifold(merged).ok).toBe(true);
  });
});

describe('skipping saves work', () => {
  it('asks the field for far fewer values on the character at a fine grid', () => {
    const doc = migrate(structuredClone(legacyV2));
    const f = buildSceneField(doc, { voxelMm: 0.6 });
    const full = counting(f);
    meshField(full.field, { voxelMm: 0.6, cull: false });
    const culled = counting(f);
    meshField(culled.field, { voxelMm: 0.6 });
    expect(culled.calls()).toBeLessThan(full.calls() * 0.6);
  });

  it('asks for almost nothing when the toy is tiny inside a big region', () => {
    const f = buildSceneField(makeDoc([ball('a', 0, 3)]), { voxelMm: 0.5 });
    const region = { min: [-60, -60, -60] as [number, number, number], max: [60, 60, 60] as [number, number, number] };
    const full = counting(f);
    const a = meshField(full.field, { voxelMm: 0.5, region, cull: false });
    const culled = counting(f);
    const b = meshField(culled.field, { voxelMm: 0.5, region });
    same(a, b);
    expect(culled.calls()).toBeLessThan(full.calls() / 20);
  });
});
