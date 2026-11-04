import { describe, expect, it } from 'vitest';
import { partFrame, localToWorld } from '../../src/core/doc/frame';
import { applyMove, applyResize, applyTurn, snapshotPart } from '../../src/core/doc/edit';
import { makeDab, SCULPT_RADIUS } from '../../src/core/doc/sculpt';
import { bbox } from '../../src/core/geom/bounds';
import { SHAPES } from '../../src/core/geom/shapes';
import { OrbitCamera } from '../../src/render/camera';
import { arrowDelta, hitHandle, ringAngleDeg, scaleFactor } from '../../src/render/gizmoMath';
import type { Ray } from '../../src/render/picking';
import { screenRay } from '../../src/render/picking';
import { makeDoc, makePart, rect } from './helpers/docs';

const down = (x: number, y: number, z: number): Ray => ({ origin: [x, y + 100, z], dir: [0, -1, 0] });

describe('ring drag (turn)', () => {
  it('gizmo ring drag of 90° on the y ring sets rot.y to 90 ± 0.5', () => {
    const doc = makeDoc([makePart({ id: 'a', outline: rect(20, 20, 0, 0) })]);
    const snap = snapshotPart(doc, 'a')!;
    // look straight down on the ring that turns about y: a point on +x is dragged round to -z
    const deg = ringAngleDeg([0, 0, 0], 'y', down(10, 0, 0), down(0, 0, -10));
    expect(deg).toBeCloseTo(90, 6);
    applyTurn(doc, 'a', 'y', deg, snap.rot);
    expect(Math.abs(doc.parts[0].rot.y - 90)).toBeLessThanOrEqual(0.5);
    expect(doc.parts[0].rot.x).toBe(0);
    expect(doc.parts[0].rot.z).toBe(0);
  });

  it('turning the other way is negative, and the same drag twice from the new angle adds up', () => {
    expect(ringAngleDeg([0, 0, 0], 'y', down(10, 0, 0), down(0, 0, 10))).toBeCloseTo(-90, 6);
    const doc = makeDoc([makePart({ id: 'a', rot: { x: 0, y: 30, z: 0 } })]);
    const snap = snapshotPart(doc, 'a')!;
    applyTurn(doc, 'a', 'y', 15, snap.rot);
    expect(doc.parts[0].rot.y).toBe(45);
  });

  it('a ring seen edge-on gives no turn instead of blowing up', () => {
    const edgeOn = (x: number): Ray => ({ origin: [x, 0, 100], dir: [0, 0, -1] }); // parallel to the ring's plane
    expect(ringAngleDeg([0, 0, 0], 'y', edgeOn(10), edgeOn(5))).toBe(0);
  });
});

describe('cube drag (resize)', () => {
  it('scales depth, width and height by the same factor', () => {
    const doc = makeDoc([makePart({ id: 'a', outline: rect(20, 10, 0, 0), depthMm: 8 })]);
    const snap = snapshotPart(doc, 'a')!;
    const k = scaleFactor([100, 100], [150, 100], [250, 100]); // twice as far from the middle
    expect(k).toBeCloseTo(3, 9);
    applyResize(doc, 'a', 2, snap);
    const b = bbox(doc.parts[0].outline);
    expect([b.w, b.h, doc.parts[0].depthMm]).toEqual([40, 20, 16]);
    expect([b.cx, b.cy]).toEqual([0, 0]); // it grows about its middle
  });

  it('is limited so a part cannot vanish or fill the world', () => {
    expect(scaleFactor([0, 0], [100, 0], [0.001, 0])).toBe(0.2);
    expect(scaleFactor([0, 0], [100, 0], [100000, 0])).toBe(5);
    expect(scaleFactor([0, 0], [0, 0], [10, 0])).toBe(1); // the start was on the middle: no change
  });

  it('respects the thickness limits', () => {
    const doc = makeDoc([makePart({ id: 'a', depthMm: 100 })]);
    applyResize(doc, 'a', 5, snapshotPart(doc, 'a')!);
    expect(doc.parts[0].depthMm).toBe(200);
  });
});

describe('arrow drag (move)', () => {
  const cam = () => {
    const c = new OrbitCamera();
    c.azimuth = 0;
    c.elevation = 0;
    c.distance = 150;
    c.target = [0, 0, 0];
    return c;
  };

  it('moves by how far the finger went along the arrow', () => {
    const c = cam();
    const ray = (x: number): Ray => screenRay(c, 40, 1, [x, 0]);
    // the x arrow lies across the screen: a finger further right moves it further along +x
    const small = arrowDelta([0, 0, 0], 'x', ray(0.1), ray(0.2));
    const big = arrowDelta([0, 0, 0], 'x', ray(0.1), ray(0.4));
    expect(small).toBeGreaterThan(0);
    expect(big).toBeGreaterThan(small * 2);
  });

  it('applyMove shifts x and y through the outline and z through depth', () => {
    const doc = makeDoc([makePart({ id: 'a', outline: rect(10, 10, 0, 0), z: 2 })]);
    // each drag takes hold of one arrow, so each starts from a fresh snapshot
    applyMove(doc, 'a', 'x', 7, snapshotPart(doc, 'a')!);
    expect(doc.parts[0].outline[0]).toEqual([2, -5]);
    applyMove(doc, 'a', 'z', 5, snapshotPart(doc, 'a')!);
    expect(doc.parts[0].z).toBe(7);
    applyMove(doc, 'a', 'y', -3, snapshotPart(doc, 'a')!);
    expect(doc.parts[0].outline[0][1]).toBe(-8);
    expect(doc.parts[0].outline[0][0]).toBe(2); // earlier moves are kept
  });

  it('a mirrored twin moves the part it follows the opposite way sideways', () => {
    const doc = makeDoc([makePart({ id: 'l', outline: rect(10, 10, 20, 0) }), makePart({ id: 'r', outline: rect(10, 10, -20, 0), twinOf: 'l' })]);
    const snap = snapshotPart(doc, 'r')!;
    expect(snap.id).toBe('l');
    applyMove(doc, 'r', 'x', -6, snap); // drag the left-hand twin further left
    expect(doc.parts[0].outline[0][0]).toBeCloseTo(15 + 6, 9);
  });
});

describe('hitHandle', () => {
  const cam = new OrbitCamera();
  const FOV = 40;
  const W = 800;
  const H = 600;
  const centre: [number, number, number] = [0, 28, 0];

  it('picks the cube, an arrow or a ring, and nothing in empty space', () => {
    // a point just beside the end of the x arrow
    const arrowTip = centre.map((v, i) => v + [1, 0, 0][i] * 30) as [number, number, number];
    const screenTip = project(cam, arrowTip);
    expect(hitHandle(cam, FOV, W / H, W, H, centre, 30, [screenTip[0] + 8, screenTip[1] + 4])).toMatchObject({ kind: 'move', axis: 'x' });
    expect(hitHandle(cam, FOV, W / H, W, H, centre, 30, [5, 5])).toBeNull();
  });

  it('handles can be hit from at least 24 px away (so a finger can grab them)', () => {
    const tip = project(cam, [30, 28, 0]);
    expect(hitHandle(cam, FOV, W / H, W, H, centre, 30, [tip[0] + 22, tip[1]])).not.toBeNull();
    expect(hitHandle(cam, FOV, W / H, W, H, centre, 30, [tip[0] + 300, tip[1]])).toBeNull();
  });

  function project(c: OrbitCamera, p: [number, number, number]): [number, number] {
    // reuse the same projection the gizmo uses
    return projectForTest(c, p);
  }
});

describe('sculpt dabs', () => {
  it('a dab placed after moving a part still lands on the same spot of the part', () => {
    const part = makePart({ id: 'a', outline: SHAPES.circle(-10, -10, 10, 10), depthMm: 20, round: 1 });
    const dab = makeDab(part, 'pull', [10, 0, 0], [1, 0, 0], SCULPT_RADIUS.m, 'gentle');
    const before = localToWorld(partFrame(part), dab.at);

    // the part is picked up and put down 30 mm to the right and 5 up
    const moved = { ...part, outline: part.outline.map(([x, y]): [number, number] => [x + 30, y + 5]), z: part.z + 4 };
    const after = localToWorld(partFrame(moved), dab.at);
    expect(after[0]).toBeCloseTo(before[0] + 30, 6);
    expect(after[1]).toBeCloseTo(before[1] + 5, 6);
    expect(after[2]).toBeCloseTo(before[2] + 4, 6);
  });

  it('pull sits just inside the surface, push just outside, so they raise and dent', () => {
    const part = makePart({ id: 'a', outline: SHAPES.circle(-10, -10, 10, 10), depthMm: 20, round: 1 });
    const hit: [number, number, number] = [10, 0, 0];
    const pull = localToWorld(partFrame(part), makeDab(part, 'pull', hit, [1, 0, 0], 4.5, 'gentle').at);
    const push = localToWorld(partFrame(part), makeDab(part, 'push', hit, [1, 0, 0], 4.5, 'gentle').at);
    expect(pull[0]).toBeLessThan(10);
    expect(push[0]).toBeGreaterThan(10);
  });

  it('smooth and grab sit on the surface; a firm pull makes a bigger bump than a gentle one; sizes grow', () => {
    const part = makePart({ id: 'a', outline: SHAPES.circle(-10, -10, 10, 10), depthMm: 20, round: 1 });
    const hit: [number, number, number] = [10, 0, 0];
    const f = partFrame(part);
    expect(localToWorld(f, makeDab(part, 'smooth', hit, [1, 0, 0], 4.5, 'gentle').at)[0]).toBeCloseTo(10, 6);
    expect(localToWorld(f, makeDab(part, 'grab', hit, [1, 0, 0], 12, 'gentle').at)[0]).toBeCloseTo(10, 6);
    const gentle = localToWorld(f, makeDab(part, 'pull', hit, [1, 0, 0], 4.5, 'gentle').at)[0];
    const firm = localToWorld(f, makeDab(part, 'pull', hit, [1, 0, 0], 4.5, 'firm').at)[0];
    expect(firm).toBeGreaterThan(gentle); // its centre is closer to the surface, so more of the ball shows
    expect(SCULPT_RADIUS.s).toBeLessThan(SCULPT_RADIUS.m);
    expect(SCULPT_RADIUS.m).toBeLessThan(SCULPT_RADIUS.l);
  });

  it('smooth strength follows gentle and firm; a grab starts with no drag', () => {
    const part = makePart({ id: 'a' });
    expect(makeDab(part, 'smooth', [0, 0, 0], [0, 0, 1], 4.5, 'gentle').strength).toBeCloseTo(0.35, 6);
    expect(makeDab(part, 'smooth', [0, 0, 0], [0, 0, 1], 4.5, 'firm').strength).toBeCloseTo(0.75, 6);
    expect(makeDab(part, 'grab', [0, 0, 0], [0, 0, 1], 12, 'gentle').drag).toEqual([0, 0, 0]);
  });
});

// A copy of the gizmo's projection so the test can aim at handles. It must match src/render/picking.ts.
import { projectToScreen } from '../../src/render/picking';
function projectForTest(cam: OrbitCamera, p: [number, number, number]): [number, number] {
  return projectToScreen(cam, 40, 800 / 600, 800, 600, p)!;
}
