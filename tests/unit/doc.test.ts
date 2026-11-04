import { describe, expect, it } from 'vitest';
import { DocError, createDoc, validateDoc } from '../../src/core/doc/schema';
import type { Doc } from '../../src/core/doc/types';
import { JARGON, makeDoc, makePart } from './helpers/docs';

const flat = (n: number, v: number) => Array.from({ length: n }, () => v);

function errorFor(doc: unknown): DocError {
  try {
    validateDoc(doc);
  } catch (e) {
    expect(e).toBeInstanceOf(DocError);
    return e as DocError;
  }
  throw new Error('validateDoc accepted a bad document');
}

describe('createDoc', () => {
  it('makes an empty, valid document', () => {
    const d = createDoc();
    expect(d.version).toBe(3);
    expect(d.parts).toEqual([]);
    expect(d.settings.build).toEqual({ w: 100, h: 100, d: 100 });
    expect(() => validateDoc(d)).not.toThrow();
  });
});

describe('validateDoc: good documents', () => {
  it('accepts a document with every optional feature', () => {
    const doc: Doc = makeDoc([
      makePart({ id: 'p1', profile: { front: flat(64, 1), back: flat(64, -1) } }),
      makePart({ id: 'p2', name: 'Body copy', twinOf: 'p1' }),
    ]);
    doc.dabs.push({ partId: 'p1', type: 'grab', at: [0.1, 0.2, 0.5], radius: 4, strength: 1, drag: [0.1, 0, 0] });
    doc.grooves.push({ points: [[0, 0, 1], [1, 1, 1]], radius: 1.8, mirror: true });
    expect(() => validateDoc(doc)).not.toThrow();
  });

  it('returns a copy, so the caller cannot change the original', () => {
    const doc = makeDoc();
    const out = validateDoc(doc);
    expect(out).toEqual(doc);
    out.parts[0].name = 'Changed';
    expect(doc.parts[0].name).toBe('Body');
  });
});

describe('validateDoc: bad documents give a friendly DocError', () => {
  const cases: [string, (d: Doc) => void][] = [
    ['NaN thickness', (d) => (d.parts[0].depthMm = NaN)],
    ['infinite height', (d) => (d.parts[0].z = Infinity)],
    ['roundness above 1', (d) => (d.parts[0].round = 2)],
    ['thickness far too big', (d) => (d.parts[0].depthMm = 500)],
    ['negative thickness', (d) => (d.parts[0].depthMm = -3)],
    ['outline with 2 points', (d) => (d.parts[0].outline = [[0, 0], [1, 1]])],
    ['outline with a NaN point', (d) => (d.parts[0].outline[1] = [NaN, 0])],
    ['colour that is not a colour', (d) => (d.parts[0].color = 'red')],
    ['unknown shape kind', (d) => (d.parts[0].kind = 'cube' as never)],
    ['part that is a twin of itself', (d) => (d.parts[0].twinOf = 'p1')],
    ['twin of a missing part', (d) => (d.parts[0].twinOf = 'nope')],
    ['profile with the wrong length', (d) => (d.parts[0].profile = { front: [1, 1], back: [-1, -1] })],
    ['profile taller than 1.8', (d) => (d.parts[0].profile = { front: [5, ...flat(63, 1)], back: flat(64, -1) })],
    ['dab on a missing part', (d) => d.dabs.push({ partId: 'nope', type: 'push', at: [0, 0, 0], radius: 3, strength: 1 })],
    ['dab with NaN radius', (d) => d.dabs.push({ partId: 'p1', type: 'pull', at: [0, 0, 0], radius: NaN, strength: 1 })],
    ['dab of an unknown type', (d) => d.dabs.push({ partId: 'p1', type: 'poke' as never, at: [0, 0, 0], radius: 3, strength: 1 })],
    ['groove with one point', (d) => d.grooves.push({ points: [[0, 0, 0]], radius: 1.8, mirror: false })],
    ['a different build area', (d) => ((d.settings.build as { w: number }).w = 200)],
    ['an old version number', (d) => ((d as { version: number }).version = 2)],
  ];

  it.each(cases)('rejects: %s', (_name, mutate) => {
    const doc = makeDoc();
    mutate(doc);
    const err = errorFor(doc);
    expect(err.message.length).toBeGreaterThan(10);
    expect(err.message).not.toMatch(JARGON);
  });

  it('rejects two parts that share an id', () => {
    const err = errorFor(makeDoc([makePart({ id: 'a' }), makePart({ id: 'a' })]));
    expect(err.message).not.toMatch(JARGON);
  });

  it.each([null, undefined, 42, 'text', [], {}])('rejects %j that is not a toy at all', (input) => {
    expect(errorFor(input).message).not.toMatch(JARGON);
  });

  it('names the part with the problem, shortened if the name is long', () => {
    const doc = makeDoc([makePart({ name: 'Head' })]);
    doc.parts[0].round = 9;
    expect(errorFor(doc).message).toContain('Head');

    const long = makeDoc([makePart({ name: 'x'.repeat(200) })]);
    long.parts[0].round = 9;
    expect(errorFor(long).message.length).toBeLessThan(200);
  });

  it('keeps a technical detail for developers, separate from the message', () => {
    const doc = makeDoc();
    doc.parts[0].depthMm = NaN;
    expect(errorFor(doc).detail).toContain('depthMm');
  });
});
