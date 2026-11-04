import { describe, expect, it } from 'vitest';
import legacyV2 from '../fixtures/legacy-v2.json';
import { migrate } from '../../src/core/doc/migrate';
import { checkPrintable, meshSize } from '../../src/core/print/check';
import { PRINT_MESSAGES } from '../../src/core/print/messages';
import { buildSceneField } from '../../src/core/geom/scene';
import { meshField } from '../../src/core/geom/surfaceNets';
import type { MeshData } from '../../src/core/geom/surfaceNets';
import { SHAPES } from '../../src/core/geom/shapes';
import { JARGON, makeDoc, makePart, rect } from './helpers/docs';
import { edgeManifold } from './helpers/mesh';

const ball = (id: string, cx: number, d = 20, over = {}) =>
  makePart({ id, name: id, kind: 'circle', outline: SHAPES.circle(cx - d / 2, -d / 2, cx + d / 2, d / 2), depthMm: d, round: 1, ...over });

const meshOf = (doc: ReturnType<typeof makeDoc>, v = 0.8): MeshData => meshField(buildSceneField(doc, { voxelMm: v }), { voxelMm: v });
const empty: MeshData = { positions: new Float32Array(0), normals: new Float32Array(0), indices: new Uint32Array(0), partIds: new Uint16Array(0) };
const codes = (doc: ReturnType<typeof makeDoc>, mesh = meshOf(doc)) => checkPrintable(doc, mesh).issues.map((i) => i.code);

describe('review focus 2: models that cannot be printed', () => {
  it("an empty doc gives the issue 'empty'", () => {
    const r = checkPrintable(makeDoc([]), empty);
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.code)).toEqual(['empty']);
  });

  it("a doc with only a cut part gives 'only-cuts'", () => {
    const doc = makeDoc([makePart({ cut: true })]);
    const r = checkPrintable(doc, empty);
    expect(r.ok).toBe(false);
    expect(r.issues.map((i) => i.code)).toEqual(['only-cuts']);
  });

  it("a model larger than 100 mm gives 'too-big', says Make it smaller, and the report never scales it", () => {
    const doc = makeDoc([ball('a', 0, 120)]);
    const mesh = meshOf(doc, 1.5);
    const r = checkPrintable(doc, mesh);
    expect(r.ok).toBe(false);
    const issue = r.issues.find((i) => i.code === 'too-big')!;
    expect(issue.fix).toContain('Make it smaller');
    expect(meshSize(mesh).w).toBeGreaterThan(110); // untouched
  });

  it('a model of exactly the limit is fine, and just over it is too big', () => {
    expect(codes(makeDoc([ball('a', 0, 99)]), meshOf(makeDoc([ball('a', 0, 99)]), 1))).not.toContain('too-big');
    expect(codes(makeDoc([ball('a', 0, 104)]), meshOf(makeDoc([ball('a', 0, 104)]), 1))).toContain('too-big');
  });

  it('every direction counts: too tall is too big, too deep is too big', () => {
    const tall = makeDoc([makePart({ id: 't', outline: rect(10, 130, 0, 65), depthMm: 10, round: 0 })]);
    expect(codes(tall, meshOf(tall, 1.5))).toContain('too-big');
    const deep = makeDoc([makePart({ id: 'd', outline: rect(10, 10, 0, 5), depthMm: 120, round: 0 })]);
    expect(codes(deep, meshOf(deep, 1.5))).toContain('too-big');
  });

  it("a 1 mm-thick part gives 'too-thin' (the least is 2 mm), naming the part", () => {
    const doc = makeDoc([makePart({ id: 'fin', outline: rect(30, 30), depthMm: 1, round: 0 })]);
    const r = checkPrintable(doc, meshOf(doc, 0.5));
    const issue = r.issues.find((i) => i.code === 'too-thin');
    expect(issue).toBeDefined();
    expect(issue!.partIds).toEqual(['fin']);
    expect(r.ok).toBe(false);
  });

  it('a thin wall made by a hole is found too, not only a thin part', () => {
    const body = makePart({ id: 'b', outline: rect(40, 40), depthMm: 40, round: 0 });
    const hole = makePart({ id: 'h', cut: true, outline: rect(36.5, 36.5), depthMm: 80, round: 0 }); // leaves a 1.75 mm wall
    const doc = makeDoc([body, hole]);
    expect(codes(doc, meshOf(doc, 0.5))).toContain('too-thin');
  });

  it("two separate, non-touching parts give 'floating' with both part ids", () => {
    const doc = makeDoc([ball('a', -30), ball('b', 30)]);
    const r = checkPrintable(doc, meshOf(doc));
    const issue = r.issues.find((i) => i.code === 'floating')!;
    expect(issue).toBeDefined();
    expect([...issue.partIds!].sort()).toEqual(['a', 'b']);
  });

  it('parts that touch or overlap are not floating', () => {
    const doc = makeDoc([ball('a', -6), ball('b', 6)]);
    expect(codes(doc)).not.toContain('floating');
  });

  it('checkPrintable never returns ok:true for any of these', () => {
    const bad = [
      [makeDoc([]), empty],
      [makeDoc([makePart({ cut: true })]), empty],
      [makeDoc([ball('a', 0, 120)]), meshOf(makeDoc([ball('a', 0, 120)]), 1.5)],
      [makeDoc([makePart({ outline: rect(30, 30), depthMm: 1, round: 0 })]), meshOf(makeDoc([makePart({ outline: rect(30, 30), depthMm: 1, round: 0 })]), 0.5)],
      [makeDoc([ball('a', -30), ball('b', 30)]), meshOf(makeDoc([ball('a', -30), ball('b', 30)]))],
    ] as const;
    for (const [doc, mesh] of bad) expect(checkPrintable(doc, mesh).ok).toBe(false);
  });

  it('a mesh with a hole in it is reported as not watertight', () => {
    const doc = makeDoc([ball('a', 0, 20)]);
    const mesh = meshOf(doc);
    const holed: MeshData = { ...mesh, indices: mesh.indices.slice(0, mesh.indices.length - 30) }; // ten triangles missing
    expect(codes(doc, holed)).toContain('not-watertight');
  });
});

describe('a normal toy', () => {
  it('is ok:true, edge-manifold, with no issues', () => {
    const doc = makeDoc([ball('a', -6), ball('b', 6)]);
    const mesh = meshOf(doc);
    expect(edgeManifold(mesh).ok).toBe(true);
    const r = checkPrintable(doc, mesh);
    expect(r).toEqual({ ok: true, issues: [] });
  });

  it('a melted pair is fine too', () => {
    const doc = makeDoc([ball('a', -6, 20, { melt: true, blend: 6 }), ball('b', 6, 20, { melt: true, blend: 6 })]);
    expect(checkPrintable(doc, meshOf(doc)).ok).toBe(true);
  });

  it('the size is reported in millimetres, width, height and depth', () => {
    const s = meshSize(meshOf(makeDoc([ball('a', 0, 30)])));
    expect(s.w).toBeCloseTo(30, 0);
    expect(s.h).toBeCloseTo(30, 0);
    expect(s.d).toBeCloseTo(30, 0);
    expect(meshSize(empty)).toEqual({ w: 0, h: 0, d: 0 });
  });
});

describe('the words', () => {
  it('every issue has a message and a fix, in plain words with no jargon', () => {
    for (const [code, text] of Object.entries(PRINT_MESSAGES)) {
      expect(text.message.length, code).toBeGreaterThan(10);
      expect(text.fix.length, code).toBeGreaterThan(5);
      expect(text.message, code).not.toMatch(JARGON);
      expect(text.fix, code).not.toMatch(JARGON);
    }
  });

  it('the check fills them in', () => {
    const r = checkPrintable(makeDoc([]), empty);
    expect(r.issues[0].message).toBe(PRINT_MESSAGES.empty.message);
    expect(r.issues[0].fix).toBe(PRINT_MESSAGES.empty.fix);
  });
});

describe('the prototype character', () => {
  it('can be checked without trouble (it may have issues, but must not crash)', () => {
    const doc = migrate(structuredClone(legacyV2));
    const r = checkPrintable(doc, meshOf(doc, 1));
    expect(typeof r.ok).toBe('boolean');
  });
});
