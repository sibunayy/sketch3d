import { describe, expect, it } from 'vitest';
import { OrbitCamera } from '../../src/render/camera';
import { pickPart, projectToScreen, screenRay } from '../../src/render/picking';
import type { Ray } from '../../src/render/picking';
import { buildSceneField } from '../../src/core/geom/scene';
import { meshField } from '../../src/core/geom/surfaceNets';
import { SHAPES } from '../../src/core/geom/shapes';
import { makeDoc, makePart } from './helpers/docs';

const FOV = 40;

describe('screenRay and projectToScreen', () => {
  it('the middle of the screen looks straight at the target', () => {
    const cam = new OrbitCamera();
    const ray = screenRay(cam, FOV, 1.5, [0, 0]);
    const toTarget = cam.target.map((v, i) => v - ray.origin[i]);
    const len = Math.hypot(...toTarget);
    ray.dir.forEach((d, i) => expect(d).toBeCloseTo(toTarget[i] / len, 6));
  });

  it('projecting a point and casting a ray back through it agree', () => {
    const cam = new OrbitCamera();
    cam.orbit(80, -30);
    cam.zoom(1.3);
    const p: [number, number, number] = [10, 30, -5];
    const s = projectToScreen(cam, FOV, 1.5, 800, 600, p)!;
    expect(s).not.toBeNull();
    const ray = screenRay(cam, FOV, 1.5, [(s[0] / 800) * 2 - 1, 1 - (s[1] / 600) * 2]);
    // the ray should pass through p
    const t = ray.dir[0] * (p[0] - ray.origin[0]) + ray.dir[1] * (p[1] - ray.origin[1]) + ray.dir[2] * (p[2] - ray.origin[2]);
    const closest = ray.origin.map((o, i) => o + ray.dir[i] * t);
    expect(Math.hypot(closest[0] - p[0], closest[1] - p[1], closest[2] - p[2])).toBeLessThan(1e-6);
  });

  it('a point behind the camera does not project', () => {
    const cam = new OrbitCamera();
    const behind = cam.position().map((v, i) => v + (cam.position()[i] - cam.target[i])) as [number, number, number];
    expect(projectToScreen(cam, FOV, 1.5, 800, 600, behind)).toBeNull();
  });
});

describe('pickPart', () => {
  // two balls on top of each other along z: part 0 behind (z 0), part 1 in front (z 20)
  const ball = (id: string, z: number) => makePart({ id, kind: 'circle', outline: SHAPES.circle(-10, -10, 10, 10), depthMm: 20, round: 1, z });
  const doc = makeDoc([ball('back', 0), ball('front', 20)]);
  const mesh = meshField(buildSceneField(doc, { voxelMm: 0.8 }), { voxelMm: 0.8 });
  const rayAt = (x: number, y: number): Ray => ({ origin: [x, y, 200], dir: [0, 0, -1] });

  it('returns the front-most part for a ray through two overlapping parts', () => {
    const hit = pickPart(mesh, rayAt(0, 0))!;
    expect(hit).not.toBeNull();
    expect(hit.partIndex).toBe(1);
    expect(hit.point[2]).toBeGreaterThan(25); // the front ball's near surface, not the one behind
    expect(hit.normal[2]).toBeGreaterThan(0.8); // facing the viewer
  });

  it('finds the back part where the front one does not cover it', () => {
    // at y = -9 the back ball is hit before the front one is reached, because the front ball is 20 mm away in z
    const hit = pickPart(mesh, { origin: [0, -8, -200], dir: [0, 0, 1] })!;
    expect(hit.partIndex).toBe(0);
  });

  it('returns null when the ray misses everything', () => {
    expect(pickPart(mesh, rayAt(80, 80))).toBeNull();
  });

  it('works on an empty mesh', () => {
    expect(pickPart({ positions: new Float32Array(0), normals: new Float32Array(0), indices: new Uint32Array(0), partIds: new Uint16Array(0) }, rayAt(0, 0))).toBeNull();
  });

  it('the hit point lies on the surface', () => {
    const hit = pickPart(mesh, rayAt(3, 4))!;
    const r = Math.hypot(hit.point[0], hit.point[1], hit.point[2] - 20);
    expect(r).toBeGreaterThan(9);
    expect(r).toBeLessThan(10.5);
  });
});
