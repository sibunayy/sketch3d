import { buildPartField } from '../geom/sdf';
import { effectiveParts } from '../geom/scene';
import type { MeshData } from '../geom/surfaceNets';
import type { Doc, Part } from '../doc/types';

const HEADER = 'Sketch3D binary STL, millimetres'; // must not start with "solid": some programs read that as a text file

/**
 * Binary STL, in millimetres. A toy is drawn with y up and z towards the viewer; printers have z up,
 * so each point goes from (x, y, z) to (x, -z, y). That turns the toy upright without flipping it
 * (the order of each triangle's corners, and so which way it faces, is kept).
 */
export function writeBinaryStl(mesh: MeshData): ArrayBuffer {
  const P = mesh.positions;
  const I = mesh.indices;
  const n = Math.floor(I.length / 3);
  const buf = new ArrayBuffer(84 + n * 50);
  const dv = new DataView(buf);
  for (let i = 0; i < Math.min(HEADER.length, 80); i++) dv.setUint8(i, HEADER.charCodeAt(i));
  dv.setUint32(80, n, true);

  const a = [0, 0, 0];
  const b = [0, 0, 0];
  const c = [0, 0, 0];
  let off = 84;
  for (let t = 0; t < n; t++) {
    const ia = I[t * 3] * 3, ib = I[t * 3 + 1] * 3, ic = I[t * 3 + 2] * 3;
    a[0] = P[ia]; a[1] = -P[ia + 2]; a[2] = P[ia + 1];
    b[0] = P[ib]; b[1] = -P[ib + 2]; b[2] = P[ib + 1];
    c[0] = P[ic]; c[1] = -P[ic + 2]; c[2] = P[ic + 1];
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2];
    const vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy;
    let ny = uz * vx - ux * vz;
    let nz = ux * vy - uy * vx;
    const len = Math.hypot(nx, ny, nz) || 1;
    nx /= len; ny /= len; nz /= len;
    dv.setFloat32(off, nx, true); dv.setFloat32(off + 4, ny, true); dv.setFloat32(off + 8, nz, true);
    off += 12;
    for (const q of [a, b, c]) {
      dv.setFloat32(off, q[0], true); dv.setFloat32(off + 4, q[1], true); dv.setFloat32(off + 8, q[2], true);
      off += 12;
    }
    off += 2; // attribute bytes, unused
  }
  return buf;
}

/** Moves the toy to the middle of the plate (x and z) with its lowest point on the plate (y = 0). Returns a new mesh. */
export function centreOnPlate(mesh: MeshData): MeshData {
  const p = mesh.positions;
  if (p.length === 0) return { ...mesh, positions: new Float32Array(0) };
  let x0 = Infinity, x1 = -Infinity, y0 = Infinity, z0 = Infinity, z1 = -Infinity;
  for (let i = 0; i < p.length; i += 3) {
    if (p[i] < x0) x0 = p[i];
    if (p[i] > x1) x1 = p[i];
    if (p[i + 1] < y0) y0 = p[i + 1];
    if (p[i + 2] < z0) z0 = p[i + 2];
    if (p[i + 2] > z1) z1 = p[i + 2];
  }
  const cx = (x0 + x1) / 2;
  const cz = (z0 + z1) / 2;
  const out = new Float32Array(p.length);
  for (let i = 0; i < p.length; i += 3) {
    out[i] = p[i] - cx;
    out[i + 1] = p[i + 1] - y0;
    out[i + 2] = p[i + 2] - cz;
  }
  return { positions: out, normals: mesh.normals.slice(), indices: mesh.indices.slice(), partIds: mesh.partIds.slice() };
}

/** How much is cut off the bottom so a round toy sits still on the plate. */
export const FLAT_BASE_MM = 1.5;

/**
 * The toy as it will be printed. With `flatBase`, the lowest 1.5 mm is cut away by adding a
 * cut-away slab under the toy, so the mesher makes a real flat bottom. The toy being edited is not changed.
 */
export function printDoc(doc: Doc, opts: { flatBase: boolean }): Doc {
  const copy = structuredClone(doc);
  if (!opts.flatBase) return copy;
  const solid = effectiveParts(copy).filter((p) => !p.cut && p.outline.length >= 3);
  if (solid.length === 0) return copy;
  let lowest = Infinity;
  let zMid = 0;
  for (const p of solid) {
    const b = buildPartField(p).bounds;
    lowest = Math.min(lowest, b.min[1]);
    zMid += (b.min[2] + b.max[2]) / 2;
  }
  zMid /= solid.length;
  const top = lowest + FLAT_BASE_MM;
  const slab: Part = {
    id: 'flat-base',
    name: 'Flat base',
    kind: 'box',
    outline: [[-200, lowest - 100], [200, lowest - 100], [200, top], [-200, top]],
    color: '#889096',
    depthMm: 200,
    round: 0,
    z: zMid,
    blend: 0,
    melt: false,
    cut: true,
    rot: { x: 0, y: 0, z: 0 },
    taper: 0,
    squash: 0,
  };
  copy.parts.push(slab);
  return copy;
}
