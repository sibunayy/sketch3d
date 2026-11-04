import { describe, expect, it } from 'vitest';
import { centreOnPlate, printDoc, writeBinaryStl } from '../../src/core/print/stl';
import { buildSceneField } from '../../src/core/geom/scene';
import { meshField } from '../../src/core/geom/surfaceNets';
import type { MeshData } from '../../src/core/geom/surfaceNets';
import { SHAPES } from '../../src/core/geom/shapes';
import { makeDoc, makePart } from './helpers/docs';

const tri = (...p: number[]): MeshData => ({
  positions: new Float32Array(p),
  normals: new Float32Array(p.length),
  indices: new Uint32Array(Array.from({ length: p.length / 9 }, (_, t) => [t * 3, t * 3 + 1, t * 3 + 2]).flat()),
  partIds: new Uint16Array(p.length / 3),
});

const ball = (d = 30, over = {}) => makePart({ id: 'a', kind: 'circle', outline: SHAPES.circle(-d / 2, -d / 2, d / 2, d / 2), depthMm: d, round: 1, ...over });
const meshOf = (doc: ReturnType<typeof makeDoc>, v = 0.8) => meshField(buildSceneField(doc, { voxelMm: v }), { voxelMm: v });

describe('writeBinaryStl', () => {
  it('has an 80-byte header, a uint32 triangle count and 50 bytes per triangle', () => {
    const mesh = tri(0, 0, 0, 10, 0, 0, 0, 10, 0, 0, 0, 0, 0, 0, 10, 10, 0, 0);
    const buf = writeBinaryStl(mesh);
    expect(buf.byteLength).toBe(84 + 50 * 2);
    const dv = new DataView(buf);
    expect(dv.getUint32(80, true)).toBe(2);
    const header = new TextDecoder().decode(new Uint8Array(buf, 0, 80));
    expect(header.startsWith('solid')).toBe(false); // some programs take "solid" to mean a text STL
  });

  it('coordinates round-trip within 1e-5 (the toy stands up: its height becomes the printer z)', () => {
    const p = [1.25, 2.5, -3.75, 10.1, 0.3, 0.2, -4, 8, 6.5];
    const buf = writeBinaryStl(tri(...p));
    const dv = new DataView(buf);
    for (let v = 0; v < 3; v++) {
      const o = 84 + 12 + v * 12;
      const [sx, sy, sz] = [dv.getFloat32(o, true), dv.getFloat32(o + 4, true), dv.getFloat32(o + 8, true)];
      // printer (x, y, z) = toy (x, -z, y)
      expect(sx).toBeCloseTo(p[v * 3], 5);
      expect(sy).toBeCloseTo(-p[v * 3 + 2], 5);
      expect(sz).toBeCloseTo(p[v * 3 + 1], 5);
    }
  });

  it('writes a unit normal that matches the triangle, and keeps the turn direction', () => {
    // a triangle lying flat facing up in the toy (+y): counter-clockwise seen from above
    const buf = writeBinaryStl(tri(0, 0, 0, 10, 0, 0, 0, 0, -10));
    const dv = new DataView(buf);
    const n = [dv.getFloat32(84, true), dv.getFloat32(88, true), dv.getFloat32(92, true)];
    expect(Math.hypot(...n)).toBeCloseTo(1, 5);
    expect(n[2]).toBeGreaterThan(0.99); // facing up in printer space too
  });

  it('copes with an empty mesh', () => {
    const buf = writeBinaryStl(tri());
    expect(buf.byteLength).toBe(84);
    expect(new DataView(buf).getUint32(80, true)).toBe(0);
  });

  it('length is 84 + 50 x triangles for a real mesh', () => {
    const mesh = meshOf(makeDoc([ball()]));
    expect(writeBinaryStl(mesh).byteLength).toBe(84 + 50 * (mesh.indices.length / 3));
  });
});

describe('centreOnPlate', () => {
  it('puts the toy in the middle of the plate with its lowest point on the plate', () => {
    const moved = centreOnPlate(tri(10, 20, 30, 30, 20, 30, 10, 40, 50));
    const xs = [0, 3, 6].map((i) => moved.positions[i]);
    const ys = [1, 4, 7].map((i) => moved.positions[i]);
    const zs = [2, 5, 8].map((i) => moved.positions[i]);
    expect([Math.min(...xs), Math.max(...xs)]).toEqual([-10, 10]);
    expect(Math.min(...ys)).toBe(0);
    expect([Math.min(...zs), Math.max(...zs)]).toEqual([-10, 10]);
  });

  it('does not change the mesh it was given', () => {
    const m = tri(10, 20, 30, 30, 20, 30, 10, 40, 50);
    centreOnPlate(m);
    expect(m.positions[0]).toBe(10);
  });
});

describe('flat base', () => {
  const base = (doc: ReturnType<typeof makeDoc>) => meshOf(printDoc(doc, { flatBase: true }), 0.5);
  const lowest = (m: MeshData) => {
    let lo = Infinity;
    for (let i = 1; i < m.positions.length; i += 3) lo = Math.min(lo, m.positions[i]);
    return lo;
  };

  it('removes the lowest 1.5 mm and gives a flat bottom face', () => {
    const doc = makeDoc([ball(30)]);
    const flat = base(doc);
    const round = meshOf(doc, 0.5);
    expect(lowest(round)).toBeCloseTo(-15, 0);
    expect(lowest(flat)).toBeCloseTo(-13.5, 0); // 1.5 mm gone
    // many vertices sit exactly on the new floor: that is the flat face
    const floor = lowest(flat);
    let onFloor = 0;
    for (let i = 1; i < flat.positions.length; i += 3) if (Math.abs(flat.positions[i] - floor) < 0.05) onFloor++;
    expect(onFloor).toBeGreaterThan(40);
  });

  it('the sphere still fits the build area', () => {
    const m = centreOnPlate(base(makeDoc([ball(90)])));
    let max = 0;
    for (let i = 0; i < m.positions.length; i += 3) max = Math.max(max, Math.abs(m.positions[i]) * 2, m.positions[i + 1], Math.abs(m.positions[i + 2]) * 2);
    expect(max).toBeLessThanOrEqual(100);
  });

  it('does not change the toy the child is editing', () => {
    const doc = makeDoc([ball(30)]);
    printDoc(doc, { flatBase: true });
    expect(doc.parts).toHaveLength(1);
  });

  it('without the option nothing is cut', () => {
    const doc = makeDoc([ball(30)]);
    expect(printDoc(doc, { flatBase: false }).parts).toHaveLength(1);
  });

  it('an empty toy stays empty', () => {
    expect(printDoc(makeDoc([]), { flatBase: true }).parts).toHaveLength(0);
  });
});
