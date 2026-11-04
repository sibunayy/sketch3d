import { describe, expect, it } from 'vitest';
import { chunkGrid, mergeMeshes, meshChunk, meshField } from '../../src/core/geom/surfaceNets';
import type { MeshData } from '../../src/core/geom/surfaceNets';
import { buildSceneField } from '../../src/core/geom/scene';
import { SHAPES } from '../../src/core/geom/shapes';
import { edgeManifold, meshVolume } from './helpers/mesh';
import { makeDoc, makePart, rect } from './helpers/docs';

/** A ball of diameter 20 at x = cx. The true radius is a little under 10 (the outline is a 72-sided polygon). */
const ball = (id: string, cx = 0) =>
  makePart({ id, name: id, kind: 'circle', outline: SHAPES.circle(cx - 10, -10, cx + 10, 10), depthMm: 20, round: 1 });

const R = 10 * Math.cos(Math.PI / 72); // distance from the middle to the flat sides of the polygon
const sphereField = () => buildSceneField(makeDoc([ball('a')]), { voxelMm: 0.8 });

const radiusError = (m: MeshData, cx = 0): number => {
  let worst = 0;
  for (let i = 0; i < m.positions.length; i += 3) {
    const r = Math.hypot(m.positions[i] - cx, m.positions[i + 1], m.positions[i + 2]);
    worst = Math.max(worst, Math.abs(r - 10));
  }
  return worst;
};

describe('meshField: a sphere', () => {
  const mesh = meshField(sphereField(), { voxelMm: 0.8 });

  it('is watertight: every edge is shared by exactly two triangles', () => {
    const report = edgeManifold(mesh);
    expect(report.triangles).toBeGreaterThan(1000);
    expect(report).toMatchObject({ ok: true, open: 0, tangled: 0 });
  });

  it('has vertices within one voxel of the true surface', () => {
    let worst = 0;
    for (let i = 0; i < mesh.positions.length; i += 3) {
      const r = Math.hypot(mesh.positions[i], mesh.positions[i + 1], mesh.positions[i + 2]);
      worst = Math.max(worst, Math.abs(r - R));
    }
    expect(worst).toBeLessThan(0.8);
    expect(worst).toBeLessThan(0.25); // in practice much closer
  });

  it('encloses about the right volume', () => {
    const v = meshVolume(mesh);
    expect(v).toBeGreaterThan(0);
    expect(Math.abs(v - (4 / 3) * Math.PI * R ** 3) / ((4 / 3) * Math.PI * R ** 3)).toBeLessThan(0.03);
  });

  it('has normals that point outward and are unit length', () => {
    const { positions: p, normals: n } = mesh;
    for (let i = 0; i < p.length; i += 3) {
      expect(Math.hypot(n[i], n[i + 1], n[i + 2])).toBeCloseTo(1, 3);
      const r = Math.hypot(p[i], p[i + 1], p[i + 2]);
      expect((n[i] * p[i] + n[i + 1] * p[i + 1] + n[i + 2] * p[i + 2]) / r).toBeGreaterThan(0.9);
    }
  });

  it('has consistent array sizes, and every index points at a real vertex', () => {
    const nv = mesh.positions.length / 3;
    expect(Number.isInteger(nv)).toBe(true);
    expect(mesh.normals.length).toBe(mesh.positions.length);
    expect(mesh.partIds.length).toBe(nv);
    expect(mesh.indices.length % 3).toBe(0);
    expect(mesh.positions).toBeInstanceOf(Float32Array);
    expect(mesh.indices).toBeInstanceOf(Uint32Array);
    expect(mesh.partIds).toBeInstanceOf(Uint16Array);
    let max = 0;
    for (const i of mesh.indices) max = Math.max(max, i);
    expect(max).toBeLessThan(nv);
  });

  it('a finer voxelMm gives more triangles and a smaller maximum error', () => {
    const coarse = meshField(buildSceneField(makeDoc([ball('a')]), { voxelMm: 2 }), { voxelMm: 2 });
    const fine = meshField(buildSceneField(makeDoc([ball('a')]), { voxelMm: 0.5 }), { voxelMm: 0.5 });
    expect(fine.indices.length).toBeGreaterThan(coarse.indices.length * 4);
    const err = (m: MeshData) => {
      let worst = 0;
      for (let i = 0; i < m.positions.length; i += 3) worst = Math.max(worst, Math.abs(Math.hypot(m.positions[i], m.positions[i + 1], m.positions[i + 2]) - R));
      return worst;
    };
    expect(err(fine)).toBeLessThan(err(coarse));
  });

  it('gives the same answer twice, and a result is not changed by the next call', () => {
    const f = sphereField();
    const first = meshField(f, { voxelMm: 0.8 });
    const copy = first.positions.slice();
    meshField(buildSceneField(makeDoc([ball('a', 30)]), { voxelMm: 2 }), { voxelMm: 2 }); // some other job in between
    expect(first.positions).toEqual(copy);
    const again = meshField(f, { voxelMm: 0.8 });
    expect(again.positions).toEqual(first.positions);
    expect(again.indices).toEqual(first.indices);
  });
});

describe('meshField: other shapes', () => {
  it('a body with a hole cut through it is watertight', () => {
    const body = makePart({ id: 'b', outline: rect(30, 30), depthMm: 16, round: 0.4 });
    const hole = makePart({ id: 'h', cut: true, outline: SHAPES.circle(-5, -5, 5, 5), depthMm: 60 });
    const f = buildSceneField(makeDoc([body, hole]), { voxelMm: 0.7 });
    const m = meshField(f, { voxelMm: 0.7 });
    expect(edgeManifold(m)).toMatchObject({ ok: true });
  });

  it('colours each vertex by the part it belongs to', () => {
    const doc = makeDoc([ball('a', -20), ball('b', 20)]);
    const m = meshField(buildSceneField(doc, { voxelMm: 1 }), { voxelMm: 1 });
    const seen = new Set<number>();
    for (let v = 0; v < m.partIds.length; v++) {
      seen.add(m.partIds[v]);
      expect(m.partIds[v]).toBe(m.positions[v * 3] < 0 ? 0 : 1);
    }
    expect([...seen].sort()).toEqual([0, 1]);
  });

  it('a melted pair of balls is one closed surface', () => {
    const doc = makeDoc([
      { ...ball('a', -6), melt: true, blend: 6 },
      { ...ball('b', 6), melt: true, blend: 6 },
    ]);
    const m = meshField(buildSceneField(doc, { voxelMm: 0.8 }), { voxelMm: 0.8 });
    expect(edgeManifold(m)).toMatchObject({ ok: true });
  });

  it('meshes only the region it is given', () => {
    const f = buildSceneField(makeDoc([ball('a', -20), ball('b', 20)]), { voxelMm: 1 });
    const m = meshField(f, { voxelMm: 1, region: { min: [5, -15, -15], max: [35, 15, 15] } });
    expect(m.positions.length).toBeGreaterThan(0);
    for (let i = 0; i < m.positions.length; i += 3) expect(m.positions[i]).toBeGreaterThan(5);
  });
});

describe('empty fields', () => {
  it('an empty field returns an empty mesh and does not throw', () => {
    const f = buildSceneField(makeDoc([]));
    const m = meshField(f, { voxelMm: 1 });
    expect(m.positions).toHaveLength(0);
    expect(m.normals).toHaveLength(0);
    expect(m.indices).toHaveLength(0);
    expect(m.partIds).toHaveLength(0);
    expect(chunkGrid(f.bounds, 16, 1)).toEqual([]);
  });

  it('a region with nothing in it gives an empty mesh', () => {
    const f = buildSceneField(makeDoc([ball('a')]), { voxelMm: 1 });
    const m = meshField(f, { voxelMm: 1, region: { min: [100, 100, 100], max: [120, 120, 120] } });
    expect(m.indices).toHaveLength(0);
  });
});

describe('chunks', () => {
  const field = sphereField();
  const whole = meshField(field, { voxelMm: 0.8 });
  const keys = chunkGrid(field.bounds, 8, 0.8);
  const chunks = keys.map((k) => meshChunk(field, k, 0.8));

  it('chunkGrid covers the bounds with whole-number chunks', () => {
    expect(keys.length).toBeGreaterThan(8);
    const unique = new Set(keys.map((k) => `${k.cx},${k.cy},${k.cz}`));
    expect(unique.size).toBe(keys.length);
  });

  it('every triangle belongs to exactly one chunk, so the counts add up', () => {
    const total = chunks.reduce((s, c) => s + c.indices.length / 3, 0);
    expect(total).toBe(whole.indices.length / 3);
  });

  it('merging chunk meshes gives the same triangle count as meshing the whole field (seams match, no cracks)', () => {
    const merged = mergeMeshes(chunks);
    expect(merged.indices.length).toBe(whole.indices.length);
    expect(merged.positions.length).toBe(whole.positions.length); // seam vertices were joined
    expect(edgeManifold(merged)).toMatchObject({ ok: true, open: 0, tangled: 0 });
    expect(meshVolume(merged)).toBeCloseTo(meshVolume(whole), 3);
  });

  it('a single chunk on its own is not closed, which is why seams are joined on merge', () => {
    const biggest = chunks.reduce((a, b) => (b.indices.length > a.indices.length ? b : a));
    expect(edgeManifold(biggest).ok).toBe(false);
  });

  it('merging nothing gives an empty mesh', () => {
    expect(mergeMeshes([]).indices).toHaveLength(0);
  });

  it('chunk vertices stay close to the surface', () => {
    for (const c of chunks) if (c.positions.length) expect(radiusError(c)).toBeLessThan(0.5);
  });
});
