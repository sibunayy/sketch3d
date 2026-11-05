import { describe, expect, it } from 'vitest';
import { parseStl, StlError } from '../../src/core/mesh/stlRead';
import { shapeFromTriangles } from '../../src/core/mesh/importStl';
import { writeBinaryStl } from '../../src/core/print/stl';
import { buildSceneField } from '../../src/core/geom/scene';
import { meshField } from '../../src/core/geom/surfaceNets';
import { buildPartField } from '../../src/core/geom/sdf';
import { newPart } from '../../src/core/doc/partOps';
import { validateDoc } from '../../src/core/doc/schema';
import { SHAPES } from '../../src/core/geom/shapes';
import { bbox } from '../../src/core/geom/bounds';
import { makeDoc, makePart, JARGON } from './helpers/docs';
import { edgeManifold } from './helpers/mesh';
import type { Doc } from '../../src/core/doc/types';

/** A box with corners (0,0,0) to (a,b,c), as 12 triangles facing outwards, in printer (z-up) coordinates. */
function boxTris(a: number, b: number, c: number): Float32Array {
  const v = [[0, 0, 0], [a, 0, 0], [a, b, 0], [0, b, 0], [0, 0, c], [a, 0, c], [a, b, c], [0, b, c]];
  const f = [[0, 3, 2], [0, 2, 1], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [2, 3, 7], [2, 7, 6], [1, 2, 6], [1, 6, 5], [3, 0, 4], [3, 4, 7]];
  return new Float32Array(f.flatMap((t) => t.flatMap((i) => v[i])));
}

function binaryStl(tris: Float32Array): ArrayBuffer {
  const n = tris.length / 9;
  const buf = new ArrayBuffer(84 + 50 * n);
  const dv = new DataView(buf);
  dv.setUint32(80, n, true);
  for (let t = 0; t < n; t++) for (let k = 0; k < 9; k++) dv.setFloat32(84 + t * 50 + 12 + k * 4, tris[t * 9 + k], true);
  return buf;
}

function asciiStl(tris: Float32Array): ArrayBuffer {
  let s = 'solid test\n';
  for (let t = 0; t < tris.length / 9; t++) {
    s += 'facet normal 0 0 0\n outer loop\n';
    for (let k = 0; k < 3; k++) s += `  vertex ${tris[t * 9 + k * 3]} ${tris[t * 9 + k * 3 + 1]} ${tris[t * 9 + k * 3 + 2]}\n`;
    s += ' endloop\nendfacet\n';
  }
  return new TextEncoder().encode(s + 'endsolid test\n').buffer as ArrayBuffer;
}

describe('parseStl', () => {
  it('reads a binary file', () => {
    const t = boxTris(10, 20, 30);
    const out = parseStl(binaryStl(t));
    expect(out.length).toBe(108);
    expect(Array.from(out)).toEqual(Array.from(t));
  });

  it('reads a text file, including ones written with E notation and extra spaces', () => {
    const text = 'solid x\nfacet normal 0 0 1\nouter loop\nvertex  1.5e1 0 0\nvertex 0 2E+1   0\nvertex 0 0 -3\nendloop\nendfacet\nendsolid x\n';
    const out = parseStl(new TextEncoder().encode(text).buffer as ArrayBuffer);
    expect(Array.from(out)).toEqual([15, 0, 0, 0, 20, 0, 0, 0, -3]);
  });

  it('reads a text file the same as the binary one', () => {
    const t = boxTris(5, 6, 7);
    expect(Array.from(parseStl(asciiStl(t)))).toEqual(Array.from(t));
  });

  it('a binary file that starts with "solid" is still read as binary', () => {
    const buf = binaryStl(boxTris(5, 5, 5));
    new Uint8Array(buf).set(new TextEncoder().encode('solid made by a slicer'));
    expect(parseStl(buf).length).toBe(108);
  });

  it('refuses files that are not 3D shapes, with a message a child can read', () => {
    const cases: [string, ArrayBuffer][] = [
      ['empty', new ArrayBuffer(0)],
      ['too short', new ArrayBuffer(40)],
      ['text that is not a shape', new TextEncoder().encode('hello there, I am a picture of a cat').buffer as ArrayBuffer],
      ['count bigger than the data', (() => { const b = binaryStl(boxTris(1, 1, 1)); new DataView(b).setUint32(80, 9999, true); return b; })()],
      ['no triangles', binaryStl(new Float32Array(0))],
      ['NaN corner', (() => { const t = boxTris(1, 1, 1); t[4] = NaN; return binaryStl(t); })()],
      ['infinite corner', (() => { const t = boxTris(1, 1, 1); t[4] = Infinity; return binaryStl(t); })()],
    ];
    for (const [name, buf] of cases) {
      let err: unknown;
      try { parseStl(buf); } catch (e) { err = e; }
      expect(err, name).toBeInstanceOf(StlError);
      expect((err as StlError).message, name).not.toMatch(JARGON);
      expect((err as StlError).message.length, name).toBeGreaterThan(10);
    }
  });

  it('refuses a file with more triangles than we can open, before reading them', () => {
    const b = new ArrayBuffer(84);
    new DataView(b).setUint32(80, 5_000_000, true);
    expect(() => parseStl(b)).toThrow(StlError);
  });

  it('skips triangles with no area', () => {
    const t = new Float32Array([...boxTris(10, 10, 10), 1, 1, 1, 1, 1, 1, 1, 1, 1]);
    expect(parseStl(binaryStl(t)).length).toBe(108);
  });
});

describe('shapeFromTriangles', () => {
  it('turns the printer up (z) into the toy up (y), and puts the shape on the floor in the middle', () => {
    const s = shapeFromTriangles(boxTris(20, 10, 40), 'Tower');
    const b = bbox(s.outline);
    expect(b.w).toBeCloseTo(20, 1); // x stays x
    expect(b.h).toBeCloseTo(40, 1); // printer z is the toy's height
    expect(s.depthMm).toBeCloseTo(10, 1); // printer y is front to back
    expect(b.cx).toBeCloseTo(0, 1);
    expect(b.y0).toBeCloseTo(0, 1);
    expect(s.name).toBe('Tower');
    expect(s.scale).toBe(1);
  });

  it('shrinks a shape that is bigger than the toy limit, and says so', () => {
    const s = shapeFromTriangles(boxTris(300, 100, 100), 'Big');
    const b = bbox(s.outline);
    expect(Math.max(b.w, b.h, s.depthMm)).toBeLessThanOrEqual(80.01);
    expect(b.w / b.h).toBeCloseTo(3, 1); // same shape
    expect(s.scale).toBeLessThan(1);
  });

  it('keeps the outline simple but covering the same box', () => {
    const ball = shapeFromTriangles(sphereTris(20), 'Ball');
    expect(ball.outline.length).toBeLessThanOrEqual(48);
    expect(ball.outline.length).toBeGreaterThanOrEqual(8);
    const b = bbox(ball.outline);
    expect(b.w).toBeCloseTo(40, 0);
    expect(b.h).toBeCloseTo(40, 0);
  });

  it('says whether the shape has gaps', () => {
    expect(shapeFromTriangles(boxTris(20, 20, 20), 'x').hasGaps).toBe(false);
    const open = boxTris(20, 20, 20).slice(0, 108 - 18); // two faces missing
    expect(shapeFromTriangles(open, 'x').hasGaps).toBe(true);
  });

  it('stores a grid small enough to keep in a toy', () => {
    const s = shapeFromTriangles(boxTris(40, 40, 40), 'x');
    expect(s.mesh.data.length).toBeLessThan(260_000);
    expect(s.mesh.n.every((n) => n >= 8 && n <= 60)).toBe(true);
  });
});

/** A sphere of radius r around the origin, as triangles (printer coordinates). */
function sphereTris(r: number, rings = 24, segs = 32): Float32Array {
  const out: number[] = [];
  const p = (i: number, j: number) => {
    const th = (Math.PI * i) / rings;
    const ph = (2 * Math.PI * j) / segs;
    return [r * Math.sin(th) * Math.cos(ph), r * Math.sin(th) * Math.sin(ph), r * Math.cos(th)];
  };
  for (let i = 0; i < rings; i++) {
    for (let j = 0; j < segs; j++) {
      const a = p(i, j), b = p(i + 1, j), c = p(i + 1, j + 1), d = p(i, j + 1);
      if (i > 0) out.push(...a, ...d, ...b); // outward winding
      if (i < rings - 1) out.push(...b, ...d, ...c);
    }
  }
  return new Float32Array(out);
}

function importedDoc(tris: Float32Array, over: Partial<Doc['parts'][0]> = {}): Doc {
  const s = shapeFromTriangles(tris, 'Thing');
  const part = newPart(makeDoc([]), { kind: 'import', outline: s.outline, depthMm: s.depthMm, round: 1, name: s.name, mesh: s.mesh, z: 0 });
  return makeDoc([{ ...part, id: 'i1', ...over }]);
}

describe('an imported shape as a part', () => {
  it('is a valid part, and keeps its grid through validation and copying', () => {
    const doc = importedDoc(boxTris(20, 20, 20));
    const back = validateDoc(structuredClone(doc));
    expect(back.parts[0].mesh?.data).toBe(doc.parts[0].mesh?.data);
  });

  it('is rejected if the grid is missing, damaged or on a normal part', () => {
    const doc = importedDoc(boxTris(20, 20, 20));
    const noMesh = structuredClone(doc);
    delete noMesh.parts[0].mesh;
    expect(() => validateDoc(noMesh)).toThrow();
    const short = structuredClone(doc);
    short.parts[0].mesh!.data = short.parts[0].mesh!.data.slice(0, 100);
    expect(() => validateDoc(short)).toThrow();
    const normal = makeDoc([makePart({ mesh: doc.parts[0].mesh })]);
    expect(() => validateDoc(normal)).toThrow();
  });

  it('measures like the shape it came from', () => {
    const doc = importedDoc(sphereTris(20));
    const f = buildPartField(doc.parts[0]);
    expect(f.distance(0, 20, 0)).toBeCloseTo(-20, 0); // the middle (the shape sits on the floor, so its middle is at y = 20)
    expect(f.distance(20, 20, 0)).toBeCloseTo(0, 0); // on the skin
    expect(f.distance(0, 20, 20)).toBeCloseTo(0, 0);
    expect(f.distance(30, 20, 0)).toBeCloseTo(10, 0); // outside
    expect(f.distance(0, 20 + 35, 0)).toBeGreaterThan(14);
    expect(f.distance(200, 200, 200)).toBeGreaterThan(50);
  });

  it('a box is inside where it should be', () => {
    const doc = importedDoc(boxTris(20, 10, 40)); // 20 wide, 40 high, 10 deep: x -10..10, y 0..40, z -5..5
    const f = buildPartField(doc.parts[0]);
    expect(f.distance(0, 20, 0)).toBeLessThan(-4);
    expect(f.distance(9, 39, 4)).toBeLessThan(0);
    expect(f.distance(11.5, 20, 0)).toBeGreaterThan(0.5);
    expect(f.distance(0, 20, 7)).toBeGreaterThan(1);
    expect(f.distance(0, -2, 0)).toBeGreaterThan(1);
  });

  it('moves, turns and resizes with the part', () => {
    const doc = importedDoc(boxTris(20, 10, 40));
    const moved = structuredClone(doc);
    moved.parts[0].outline = moved.parts[0].outline.map(([x, y]) => [x + 30, y]);
    expect(buildPartField(moved.parts[0]).distance(30, 20, 0)).toBeLessThan(-4);

    const turned = structuredClone(doc);
    turned.parts[0].rot = { x: 0, y: 0, z: 90 }; // lying on its side about its middle
    const ft = buildPartField(turned.parts[0]);
    expect(ft.distance(18, 20, 0)).toBeLessThan(0); // now 40 wide around x = 0 (centre of the box is y = 20)
    expect(ft.distance(0, 20 + 15, 0)).toBeGreaterThan(0);

    const bigger = structuredClone(doc);
    bigger.parts[0].outline = bigger.parts[0].outline.map(([x, y]) => [x * 2, y * 2]);
    bigger.parts[0].depthMm = 20;
    const fb = buildPartField(bigger.parts[0]);
    expect(fb.bounds.max[0] - fb.bounds.min[0]).toBeCloseTo(40, 1);
    expect(fb.distance(19, 40, 9)).toBeLessThan(0);
    expect(fb.distance(21.5, 40, 0)).toBeGreaterThan(0.5);
  });

  it('the mirrored copy of an imported part is its mirror image', () => {
    const doc = importedDoc(boxTris(20, 10, 40));
    const a = doc.parts[0];
    a.outline = a.outline.map(([x, y]) => [x + 25, y]);
    const twin = { ...a, id: 'i2', twinOf: 'i1' };
    const both: Doc = { ...doc, parts: [a, twin] };
    const field = buildSceneField(both, { voxelMm: 1 });
    for (const [x, y, z] of [[24, 20, 1], [30, 5, -2], [18, 39, 3], [36, 20, 0]]) {
      expect(field.sample(-x, y, z)).toBeCloseTo(field.sample(x, y, z), 0);
    }
  });

  it('builds a solid, watertight toy that blends with other parts', () => {
    const doc = importedDoc(sphereTris(20));
    const ball = makePart({ id: 'b', outline: SHAPES.circle(-10, 30, 10, 50), kind: 'circle', depthMm: 20, round: 1, melt: true, blend: 6, z: 0 });
    const both: Doc = { ...doc, parts: [{ ...doc.parts[0], melt: true, blend: 6 }, ball] };
    const mesh = meshField(buildSceneField(both, { voxelMm: 1 }), { voxelMm: 1 });
    expect(mesh.indices.length).toBeGreaterThan(300);
    expect(edgeManifold(mesh).ok).toBe(true);
  });

  it('can be used as a cut-away', () => {
    const body = makePart({ id: 'b', outline: SHAPES.box(-30, 0, 30, 40), kind: 'box', depthMm: 40, round: 0.1, z: 0 });
    const hole = importedDoc(sphereTris(10)).parts[0];
    hole.cut = true;
    hole.outline = hole.outline.map(([x, y]) => [x, y + 10]);
    const field = buildSceneField({ ...makeDoc([body, hole]) }, { voxelMm: 1 });
    expect(field.sample(0, 20, 0)).toBeGreaterThan(0); // inside the hole, so empty
    expect(field.sample(20, 20, 0)).toBeLessThan(0); // still solid away from it
  });

  it('keeps working when the shape has gaps (it does not crash, and it makes a shape)', () => {
    const open = boxTris(20, 20, 20).slice(0, 108 - 18);
    const doc = importedDoc(open);
    expect(() => buildPartField(doc.parts[0]).distance(0, 10, 0)).not.toThrow();
  });
});

describe('a toy goes out and comes back', () => {
  it('opens a Sketch3D file again, close to the same size', () => {
    const ball: Doc = makeDoc([makePart({ id: 'a', kind: 'circle', outline: SHAPES.circle(-15, 0, 15, 30), depthMm: 30, round: 1, z: 0 })]);
    const field = buildSceneField(ball, { voxelMm: 0.8 });
    const mesh = meshField(field, { voxelMm: 0.8 });
    const stl = writeBinaryStl(mesh);
    const back = shapeFromTriangles(parseStl(stl), 'Ball');
    const b = bbox(back.outline);
    expect(b.w).toBeGreaterThan(28);
    expect(b.w).toBeLessThan(31);
    expect(b.h).toBeGreaterThan(28);
    expect(b.h).toBeLessThan(31);
    expect(back.depthMm).toBeGreaterThan(28);
    expect(back.depthMm).toBeLessThan(31);
  });
});
