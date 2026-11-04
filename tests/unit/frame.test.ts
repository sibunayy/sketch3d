import { describe, expect, it } from 'vitest';
import { dirToLocal, dirToWorld, localToWorld, partFrame, rotationMatrix, worldToLocal } from '../../src/core/doc/frame';
import { makePart, rect } from './helpers/docs';

describe('part frame (the space dabs are stored in)', () => {
  it('is centred on the outline box and the part height, sized by width, height and thickness', () => {
    const f = partFrame(makePart({ outline: rect(20, 10, 5, 7), z: 3, depthMm: 12 }));
    expect(f.origin).toEqual([5, 7, 3]);
    expect(f.size).toEqual([20, 10, 12]);
  });

  it('round-trips world and local, including a turn', () => {
    const f = partFrame(makePart({ outline: rect(20, 10, 5, 7), z: 3, depthMm: 12, rot: { x: 20, y: -35, z: 70 } }));
    const w: [number, number, number] = [12, -4, 9];
    const back = localToWorld(f, worldToLocal(f, w));
    back.forEach((v, i) => expect(v).toBeCloseTo(w[i], 9));
    const d = dirToWorld(f, dirToLocal(f, [1, 2, 3]));
    d.forEach((v, i) => expect(v).toBeCloseTo([1, 2, 3][i], 9));
  });

  it('keeps local coordinates fixed when the part moves', () => {
    const a = partFrame(makePart({ outline: rect(20, 10, 0, 0) }));
    const b = partFrame(makePart({ outline: rect(20, 10, 40, 5), z: 6 }));
    const local = worldToLocal(a, [3, 2, 1]);
    const moved = localToWorld(b, local);
    expect(moved[0]).toBeCloseTo(43, 9);
    expect(moved[1]).toBeCloseTo(7, 9);
    expect(moved[2]).toBeCloseTo(7, 9);
  });

  it('scales local coordinates with the part size', () => {
    const small = partFrame(makePart({ outline: rect(10, 10) }));
    const big = partFrame(makePart({ outline: rect(20, 20) }));
    const w = localToWorld(big, worldToLocal(small, [2, 0, 0]));
    expect(w[0]).toBeCloseTo(4, 9);
  });

  it('uses the prototype rotation order: Z, then Y, then X', () => {
    // 90 degrees about z turns +x into +y
    const R = rotationMatrix({ x: 0, y: 0, z: 90 });
    expect(R[3]).toBeCloseTo(1, 9); // row 1, column 0
    expect(R[0]).toBeCloseTo(0, 9);
    expect(rotationMatrix({ x: 0, y: 0, z: 0 })).toEqual([1, 0, 0, 0, 1, 0, 0, 0, 1]);
  });
});
