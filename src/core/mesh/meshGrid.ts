import { MESH_PAD } from '../doc/types';
import type { PartMesh } from '../doc/types';
import { encodeBase64 } from './base64';
import { quantise } from './quant';

/** Grid points along the longest side of a shape (not counting the empty margin). */
export const GRID_CELLS = 48;
/** The fine step of the stored distances, as a fraction of a cell (see quant.ts). */
const STEP_PER_CELL = 1 / 6;

type V3 = [number, number, number];

/** Squared distance from point p to triangle abc (Ericson, Real-Time Collision Detection). */
function pointTriangleDist2(
  px: number, py: number, pz: number,
  ax: number, ay: number, az: number,
  bx: number, by: number, bz: number,
  cx: number, cy: number, cz: number,
): number {
  const abx = bx - ax, aby = by - ay, abz = bz - az;
  const acx = cx - ax, acy = cy - ay, acz = cz - az;
  const apx = px - ax, apy = py - ay, apz = pz - az;
  const d1 = abx * apx + aby * apy + abz * apz;
  const d2 = acx * apx + acy * apy + acz * apz;
  let qx: number, qy: number, qz: number;
  if (d1 <= 0 && d2 <= 0) {
    qx = ax; qy = ay; qz = az;
  } else {
    const bpx = px - bx, bpy = py - by, bpz = pz - bz;
    const d3 = abx * bpx + aby * bpy + abz * bpz;
    const d4 = acx * bpx + acy * bpy + acz * bpz;
    if (d3 >= 0 && d4 <= d3) {
      qx = bx; qy = by; qz = bz;
    } else {
      const vc = d1 * d4 - d3 * d2;
      if (vc <= 0 && d1 >= 0 && d3 <= 0) {
        const v = d1 / (d1 - d3);
        qx = ax + abx * v; qy = ay + aby * v; qz = az + abz * v;
      } else {
        const cpx = px - cx, cpy = py - cy, cpz = pz - cz;
        const d5 = abx * cpx + aby * cpy + abz * cpz;
        const d6 = acx * cpx + acy * cpy + acz * cpz;
        if (d6 >= 0 && d5 <= d6) {
          qx = cx; qy = cy; qz = cz;
        } else {
          const vb = d5 * d2 - d1 * d6;
          if (vb <= 0 && d2 >= 0 && d6 <= 0) {
            const w = d2 / (d2 - d6);
            qx = ax + acx * w; qy = ay + acy * w; qz = az + acz * w;
          } else {
            const va = d3 * d6 - d5 * d4;
            if (va <= 0 && d4 - d3 >= 0 && d5 - d6 >= 0) {
              const w = (d4 - d3) / (d4 - d3 + (d5 - d6));
              qx = bx + (cx - bx) * w; qy = by + (cy - by) * w; qz = bz + (cz - bz) * w;
            } else {
              const denom = 1 / (va + vb + vc);
              const v = vb * denom;
              const w = vc * denom;
              qx = ax + abx * v + acx * w; qy = ay + aby * v + acy * w; qz = az + abz * v + acz * w;
            }
          }
        }
      }
    }
  }
  const dx = px - qx, dy = py - qy, dz = pz - qz;
  return dx * dx + dy * dy + dz * dz;
}

/**
 * Measures a closed shape into a grid of signed distances to its skin. `pos` holds nine numbers per
 * triangle, in toy coordinates (y up), already centred on the middle of its box, which is `size` big.
 */
export function buildMeshGrid(pos: Float32Array, size: V3, maxCells = GRID_CELLS): PartMesh {
  const longest = Math.max(size[0], size[1], size[2]);
  const cell = Math.max(longest / maxCells, 0.02);
  const n: V3 = [
    Math.ceil(size[0] / cell) + 1 + 2 * MESH_PAD,
    Math.ceil(size[1] / cell) + 1 + 2 * MESH_PAD,
    Math.ceil(size[2] / cell) + 1 + 2 * MESH_PAD,
  ];
  const g0: V3 = [-size[0] / 2 - MESH_PAD * cell, -size[1] / 2 - MESH_PAD * cell, -size[2] / 2 - MESH_PAD * cell];
  const [nx, ny, nz] = n;
  const total = nx * ny * nz;
  const d2 = new Float32Array(total).fill(Infinity);

  // --- 1. exact distance to the skin for grid points within a cell or so of a triangle ---
  const reach = 1; // grid points
  const stamp = (ax: number, ay: number, az: number, bx: number, by: number, bz: number, cx: number, cy: number, cz: number, depth: number): void => {
    const e1 = Math.hypot(bx - ax, by - ay, bz - az);
    const e2 = Math.hypot(cx - bx, cy - by, cz - bz);
    const e3 = Math.hypot(ax - cx, ay - cy, az - cz);
    const longestEdge = Math.max(e1, e2, e3);
    if (longestEdge > cell * 3 && depth < 24) {
      // a big triangle is cut in two across its longest edge, so each piece touches only a few grid points
      if (longestEdge === e1) {
        const mx = (ax + bx) / 2, my = (ay + by) / 2, mz = (az + bz) / 2;
        stamp(ax, ay, az, mx, my, mz, cx, cy, cz, depth + 1);
        stamp(mx, my, mz, bx, by, bz, cx, cy, cz, depth + 1);
      } else if (longestEdge === e2) {
        const mx = (bx + cx) / 2, my = (by + cy) / 2, mz = (bz + cz) / 2;
        stamp(ax, ay, az, bx, by, bz, mx, my, mz, depth + 1);
        stamp(ax, ay, az, mx, my, mz, cx, cy, cz, depth + 1);
      } else {
        const mx = (cx + ax) / 2, my = (cy + ay) / 2, mz = (cz + az) / 2;
        stamp(ax, ay, az, bx, by, bz, mx, my, mz, depth + 1);
        stamp(mx, my, mz, bx, by, bz, cx, cy, cz, depth + 1);
      }
      return;
    }
    const lo0 = Math.max(0, Math.floor((Math.min(ax, bx, cx) - g0[0]) / cell) - reach);
    const lo1 = Math.max(0, Math.floor((Math.min(ay, by, cy) - g0[1]) / cell) - reach);
    const lo2 = Math.max(0, Math.floor((Math.min(az, bz, cz) - g0[2]) / cell) - reach);
    const hi0 = Math.min(nx - 1, Math.ceil((Math.max(ax, bx, cx) - g0[0]) / cell) + reach);
    const hi1 = Math.min(ny - 1, Math.ceil((Math.max(ay, by, cy) - g0[1]) / cell) + reach);
    const hi2 = Math.min(nz - 1, Math.ceil((Math.max(az, bz, cz) - g0[2]) / cell) + reach);
    for (let k = lo2; k <= hi2; k++) {
      const pz = g0[2] + k * cell;
      for (let j = lo1; j <= hi1; j++) {
        const py = g0[1] + j * cell;
        let idx = (k * ny + j) * nx + lo0;
        for (let i = lo0; i <= hi0; i++, idx++) {
          const d = pointTriangleDist2(g0[0] + i * cell, py, pz, ax, ay, az, bx, by, bz, cx, cy, cz);
          if (d < d2[idx]) d2[idx] = d;
        }
      }
    }
  };
  const nt = pos.length / 9;
  for (let t = 0; t < nt; t++) {
    const o = t * 9;
    stamp(pos[o], pos[o + 1], pos[o + 2], pos[o + 3], pos[o + 4], pos[o + 5], pos[o + 6], pos[o + 7], pos[o + 8], 0);
  }

  // --- 2. fill in the rest: pass distances outwards from those points (a chamfer sweep, about 8% off) ---
  const dist = new Float32Array(total);
  for (let i = 0; i < total; i++) dist[i] = Math.sqrt(d2[i]);
  chamfer(dist, n, cell);

  // --- 3. inside or outside: count how often a straight line crosses the skin, along each of the 3 directions, and take the majority ---
  const votes = new Uint8Array(total);
  for (let axis = 0; axis < 3; axis++) vote(pos, n, g0, cell, axis, votes);

  const step = cell * STEP_PER_CELL;
  const bytes = new Int8Array(total);
  for (let i = 0; i < total; i++) {
    const sd = votes[i] >= 2 ? -dist[i] : dist[i];
    bytes[i] = quantise(sd, step);
  }
  return { size, n, cell, step, data: encodeBase64(new Uint8Array(bytes.buffer)) };
}

/** Two sweeps over the grid that pass the smallest known distance along to each neighbour (3-4-5 style weights). */
function chamfer(d: Float32Array, n: V3, cell: number): void {
  const [nx, ny, nz] = n;
  const w1 = cell, w2 = cell * Math.SQRT2, w3 = cell * Math.sqrt(3);
  const fwd: [number, number, number, number][] = [];
  for (let dz = -1; dz <= 1; dz++) {
    for (let dy = -1; dy <= 1; dy++) {
      for (let dx = -1; dx <= 1; dx++) {
        if (dx === 0 && dy === 0 && dz === 0) continue;
        const before = dz < 0 || (dz === 0 && (dy < 0 || (dy === 0 && dx < 0)));
        if (!before) continue;
        const nonzero = Math.abs(dx) + Math.abs(dy) + Math.abs(dz);
        fwd.push([dx, dy, dz, nonzero === 1 ? w1 : nonzero === 2 ? w2 : w3]);
      }
    }
  }
  for (let k = 0; k < nz; k++) {
    for (let j = 0; j < ny; j++) {
      for (let i = 0; i < nx; i++) {
        const idx = (k * ny + j) * nx + i;
        let best = d[idx];
        for (const [dx, dy, dz, w] of fwd) {
          const a = i + dx, b = j + dy, c = k + dz;
          if (a < 0 || a >= nx || b < 0 || b >= ny || c < 0) continue;
          const v = d[(c * ny + b) * nx + a] + w;
          if (v < best) best = v;
        }
        d[idx] = best;
      }
    }
  }
  for (let k = nz - 1; k >= 0; k--) {
    for (let j = ny - 1; j >= 0; j--) {
      for (let i = nx - 1; i >= 0; i--) {
        const idx = (k * ny + j) * nx + i;
        let best = d[idx];
        for (const [dx, dy, dz, w] of fwd) {
          const a = i - dx, b = j - dy, c = k - dz;
          if (a < 0 || a >= nx || b < 0 || b >= ny || c >= nz) continue;
          const v = d[(c * ny + b) * nx + a] + w;
          if (v < best) best = v;
        }
        d[idx] = best;
      }
    }
  }
}

/**
 * For every line of grid points along `axis`, finds where the skin crosses the line and adds one vote to
 * each grid point that is inside (an odd number of crossings before it).
 */
function vote(pos: Float32Array, n: V3, g0: V3, cell: number, axis: number, votes: Uint8Array): void {
  const u = (axis + 1) % 3;
  const v = (axis + 2) % 3;
  const nu = n[u], nv = n[v], na = n[axis];
  // lines sit a hair off the grid so they never run exactly along a triangle's edge
  const eu = cell * 0.01371, ev = cell * 0.02913;
  const lines: number[][] = Array.from({ length: nu * nv }, () => []);
  const nt = pos.length / 9;
  for (let t = 0; t < nt; t++) {
    const o = t * 9;
    const au = pos[o + u], av = pos[o + v], aa = pos[o + axis];
    const bu = pos[o + 3 + u], bv = pos[o + 3 + v], ba = pos[o + 3 + axis];
    const cu = pos[o + 6 + u], cv = pos[o + 6 + v], ca = pos[o + 6 + axis];
    const det = (bv - cv) * (au - cu) + (cu - bu) * (av - cv);
    if (Math.abs(det) < 1e-12) continue; // seen edge-on from this direction
    const i0 = Math.max(0, Math.ceil((Math.min(au, bu, cu) - g0[u] - eu) / cell));
    const i1 = Math.min(nu - 1, Math.floor((Math.max(au, bu, cu) - g0[u] - eu) / cell));
    const j0 = Math.max(0, Math.ceil((Math.min(av, bv, cv) - g0[v] - ev) / cell));
    const j1 = Math.min(nv - 1, Math.floor((Math.max(av, bv, cv) - g0[v] - ev) / cell));
    for (let j = j0; j <= j1; j++) {
      const pv = g0[v] + j * cell + ev;
      for (let i = i0; i <= i1; i++) {
        const pu = g0[u] + i * cell + eu;
        const l1 = ((bv - cv) * (pu - cu) + (cu - bu) * (pv - cv)) / det;
        const l2 = ((cv - av) * (pu - cu) + (au - cu) * (pv - cv)) / det;
        const l3 = 1 - l1 - l2;
        if (l1 < 0 || l2 < 0 || l3 < 0) continue;
        lines[j * nu + i].push(l1 * aa + l2 * ba + l3 * ca);
      }
    }
  }
  const stride = axis === 0 ? 1 : axis === 1 ? n[0] : n[0] * n[1];
  const strideU = u === 0 ? 1 : u === 1 ? n[0] : n[0] * n[1];
  const strideV = v === 0 ? 1 : v === 1 ? n[0] : n[0] * n[1];
  for (let j = 0; j < nv; j++) {
    for (let i = 0; i < nu; i++) {
      const hits = lines[j * nu + i];
      if (hits.length < 2) continue;
      hits.sort((p, q) => p - q);
      const base = i * strideU + j * strideV;
      let h = 0;
      for (let a = 0; a < na; a++) {
        const pa = g0[axis] + a * cell;
        while (h < hits.length && hits[h] < pa) h++;
        if (h & 1) votes[base + a * stride]++;
      }
    }
  }
}
