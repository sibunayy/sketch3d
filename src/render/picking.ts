import type { MeshData } from '../core/geom/surfaceNets';
import type { Vec3 } from '../core/geom/vec';
import type { OrbitCamera } from './camera';

export interface Ray {
  origin: Vec3;
  dir: Vec3;
}

export interface Hit {
  /** Index of the part in the document. */
  partIndex: number;
  point: Vec3;
  /** Unit normal of the surface, turned to face the viewer. */
  normal: Vec3;
  /** Distance along the ray. */
  t: number;
}

const sub = (a: Vec3, b: Vec3): Vec3 => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
const cross = (a: Vec3, b: Vec3): Vec3 => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
const dot = (a: Vec3, b: Vec3): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: Vec3): Vec3 => {
  const l = Math.hypot(a[0], a[1], a[2]) || 1;
  return [a[0] / l, a[1] / l, a[2] / l];
};

/** The camera's right, up and forward directions. */
export function cameraBasis(cam: OrbitCamera): { right: Vec3; up: Vec3; forward: Vec3 } {
  const pos = cam.position();
  const forward = norm(sub(cam.target, pos));
  const right = norm(cross(forward, [0, 1, 0]));
  const up = cross(right, forward);
  return { right, up, forward };
}

/** The ray from the camera through a point on screen. `ndc` runs from -1 to 1, with y up. */
export function screenRay(cam: OrbitCamera, fovDeg: number, aspect: number, ndc: [number, number]): Ray {
  const { right, up, forward } = cameraBasis(cam);
  const k = Math.tan((fovDeg * Math.PI) / 360);
  const dir = norm([
    forward[0] + right[0] * ndc[0] * k * aspect + up[0] * ndc[1] * k,
    forward[1] + right[1] * ndc[0] * k * aspect + up[1] * ndc[1] * k,
    forward[2] + right[2] * ndc[0] * k * aspect + up[2] * ndc[1] * k,
  ]);
  return { origin: cam.position(), dir };
}

/** Where a point in the world lands on a screen of width x height pixels, or null if it is behind the camera. */
export function projectToScreen(cam: OrbitCamera, fovDeg: number, aspect: number, width: number, height: number, p: Vec3): [number, number] | null {
  const { right, up, forward } = cameraBasis(cam);
  const v = sub(p, cam.position());
  const depth = dot(v, forward);
  if (depth <= 1e-6) return null;
  const k = Math.tan((fovDeg * Math.PI) / 360);
  const x = dot(v, right) / (depth * k * aspect);
  const y = dot(v, up) / (depth * k);
  return [((x + 1) / 2) * width, ((1 - y) / 2) * height];
}

/** The first triangle of the mesh that a ray hits (either side), and which part it belongs to. */
export function pickPart(mesh: MeshData, ray: Ray): Hit | null {
  const P = mesh.positions;
  const I = mesh.indices;
  let bestT = Infinity;
  let bestTri = -1;
  const o = ray.origin;
  const d = ray.dir;
  for (let t = 0; t < I.length; t += 3) {
    const a = I[t] * 3, b = I[t + 1] * 3, c = I[t + 2] * 3;
    const e1: Vec3 = [P[b] - P[a], P[b + 1] - P[a + 1], P[b + 2] - P[a + 2]];
    const e2: Vec3 = [P[c] - P[a], P[c + 1] - P[a + 1], P[c + 2] - P[a + 2]];
    const h = cross(d, e2);
    const det = dot(e1, h);
    if (Math.abs(det) < 1e-12) continue;
    const inv = 1 / det;
    const s: Vec3 = [o[0] - P[a], o[1] - P[a + 1], o[2] - P[a + 2]];
    const u = dot(s, h) * inv;
    if (u < 0 || u > 1) continue;
    const q = cross(s, e1);
    const v = dot(d, q) * inv;
    if (v < 0 || u + v > 1) continue;
    const dist = dot(e2, q) * inv;
    if (dist > 1e-6 && dist < bestT) {
      bestT = dist;
      bestTri = t;
    }
  }
  if (bestTri < 0) return null;

  const a = I[bestTri], b = I[bestTri + 1], c = I[bestTri + 2];
  const A: Vec3 = [P[a * 3], P[a * 3 + 1], P[a * 3 + 2]];
  const B: Vec3 = [P[b * 3], P[b * 3 + 1], P[b * 3 + 2]];
  const C: Vec3 = [P[c * 3], P[c * 3 + 1], P[c * 3 + 2]];
  let normal = norm(cross(sub(B, A), sub(C, A)));
  if (dot(normal, d) > 0) normal = [-normal[0], -normal[1], -normal[2]]; // face the viewer
  return {
    partIndex: mesh.partIds[a],
    point: [o[0] + d[0] * bestT, o[1] + d[1] * bestT, o[2] + d[2] * bestT],
    normal,
    t: bestT,
  };
}
