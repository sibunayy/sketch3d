import { rotationMatrix } from '../doc/frame';
import { MESH_PAD } from '../doc/types';
import type { Part, PartMesh } from '../doc/types';
import { decodeBase64 } from '../mesh/base64';
import { dequantise } from '../mesh/quant';
import { bbox } from './bounds';
import type { Box3 } from './bounds';
import type { PartField } from './sdf';

const cache = new Map<string, Float32Array>();
const CACHE_MAX = 6;

/** The grid's distances in millimetres, decoded once and remembered (a toy repeats the same text for every mesh). */
function decoded(mesh: PartMesh): Float32Array {
  const hit = cache.get(mesh.data);
  if (hit) return hit;
  const bytes = decodeBase64(mesh.data);
  const total = mesh.n[0] * mesh.n[1] * mesh.n[2];
  const out = new Float32Array(total);
  if (bytes) {
    const signed = new Int8Array(bytes.buffer, bytes.byteOffset, Math.min(total, bytes.length));
    for (let i = 0; i < signed.length; i++) out[i] = dequantise(signed[i], mesh.step);
  }
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value as string);
  cache.set(mesh.data, out);
  return out;
}

/**
 * The distance function for a part that was opened from an STL file. The grid is looked up with a smooth blend
 * between grid points. The part's outline box and thickness stretch the shape, and its turn is applied about the
 * middle of the box. `distance` does no allocation (it is the hot loop of the mesher).
 */
export function buildMeshPartField(part: Part): PartField {
  const mesh = part.mesh as PartMesh;
  const grid = decoded(mesh);
  const [nx, ny, nz] = mesh.n;
  const cell = mesh.cell;
  const bb = bbox(part.outline);
  const cx = bb.cx, cy = bb.cy, zc = part.z;
  const W = Math.max(bb.w, 1), H = Math.max(bb.h, 1), D = Math.max(part.depthMm, 1);
  const sx = W / mesh.size[0], sy = H / mesh.size[1], sz = D / mesh.size[2];
  const shrink = Math.min(sx, sy, sz); // distances are measured in the original size, so they scale by (at least) this much
  const flip = mesh.flipX ? -1 : 1;
  const g0x = -mesh.size[0] / 2 - MESH_PAD * cell;
  const g0y = -mesh.size[1] / 2 - MESH_PAD * cell;
  const g0z = -mesh.size[2] / 2 - MESH_PAD * cell;
  const inv = 1 / cell;
  const R = part.rot.x || part.rot.y || part.rot.z ? rotationMatrix(part.rot) : null;
  const slab = nx * ny;

  // box around the stretched, turned shape
  const hx = W / 2, hy = H / 2, hz = D / 2;
  let bounds: Box3;
  if (!R) {
    bounds = { min: [cx - hx, cy - hy, zc - hz], max: [cx + hx, cy + hy, zc + hz] };
  } else {
    const lo: [number, number, number] = [Infinity, Infinity, Infinity];
    const hi: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    for (const ax of [-hx, hx]) {
      for (const ay of [-hy, hy]) {
        for (const az of [-hz, hz]) {
          const X = R[0] * ax + R[1] * ay + R[2] * az + cx;
          const Y = R[3] * ax + R[4] * ay + R[5] * az + cy;
          const Z = R[6] * ax + R[7] * ay + R[8] * az + zc;
          if (X < lo[0]) lo[0] = X; if (X > hi[0]) hi[0] = X;
          if (Y < lo[1]) lo[1] = Y; if (Y > hi[1]) hi[1] = Y;
          if (Z < lo[2]) lo[2] = Z; if (Z > hi[2]) hi[2] = Z;
        }
      }
    }
    bounds = { min: lo, max: hi };
  }

  return {
    bounds,
    distance: (x, y, z) => {
      let dx = x - cx;
      let dy = y - cy;
      let dz = z - zc;
      if (R) {
        const lx = R[0] * dx + R[3] * dy + R[6] * dz;
        const ly = R[1] * dx + R[4] * dy + R[7] * dz;
        const lz = R[2] * dx + R[5] * dy + R[8] * dz;
        dx = lx;
        dy = ly;
        dz = lz;
      }
      // grid position (in grid points) of the point, back in the shape's original size
      let gx = (flip * (dx / sx) - g0x) * inv;
      let gy = (dy / sy - g0y) * inv;
      let gz = (dz / sz - g0z) * inv;
      // outside the grid: take the nearest grid point and add the distance still to go
      let ex = 0, ey = 0, ez = 0;
      if (gx < 0) { ex = -gx; gx = 0; } else if (gx > nx - 1) { ex = gx - (nx - 1); gx = nx - 1; }
      if (gy < 0) { ey = -gy; gy = 0; } else if (gy > ny - 1) { ey = gy - (ny - 1); gy = ny - 1; }
      if (gz < 0) { ez = -gz; gz = 0; } else if (gz > nz - 1) { ez = gz - (nz - 1); gz = nz - 1; }
      let i = gx | 0;
      let j = gy | 0;
      let k = gz | 0;
      if (i > nx - 2) i = nx - 2;
      if (j > ny - 2) j = ny - 2;
      if (k > nz - 2) k = nz - 2;
      const fx = gx - i, fy = gy - j, fz = gz - k;
      const b = k * slab + j * nx + i;
      const c000 = grid[b], c100 = grid[b + 1];
      const c010 = grid[b + nx], c110 = grid[b + nx + 1];
      const c001 = grid[b + slab], c101 = grid[b + slab + 1];
      const c011 = grid[b + slab + nx], c111 = grid[b + slab + nx + 1];
      const c00 = c000 + (c100 - c000) * fx;
      const c10 = c010 + (c110 - c010) * fx;
      const c01 = c001 + (c101 - c001) * fx;
      const c11 = c011 + (c111 - c011) * fx;
      const c0 = c00 + (c10 - c00) * fy;
      const c1 = c01 + (c11 - c01) * fy;
      let d = c0 + (c1 - c0) * fz;
      if (ex !== 0 || ey !== 0 || ez !== 0) d += Math.sqrt(ex * ex + ey * ey + ez * ez) * cell;
      return d * shrink;
    },
  };
}
