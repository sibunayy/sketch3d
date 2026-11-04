import { boxIsEmpty } from './bounds';
import type { Box3 } from './bounds';
import type { SceneField } from './scene';

/**
 * Turns a distance field into a triangle mesh with naive surface nets: one vertex in every grid
 * cell the surface passes through, and one quad (two triangles) for every grid edge it crosses.
 *
 * The grid is global: grid points sit at whole multiples of `voxelMm` from the origin, so chunks
 * made separately line up exactly. A chunk owns the grid edges that start inside it, so every
 * triangle comes from exactly one chunk; chunks repeat the vertices on their border cells, and
 * `mergeMeshes` joins those copies.
 */

export interface MeshData {
  /** x, y, z for each vertex, millimetres. */
  positions: Float32Array;
  /** Unit normals, pointing out of the toy. */
  normals: Float32Array;
  /** Three vertex numbers per triangle. */
  indices: Uint32Array;
  /** Which part (index in the document) each vertex belongs to. */
  partIds: Uint16Array;
  /** Identifies each vertex's grid cell. Lets `mergeMeshes` join chunk seams exactly. */
  cellKeys?: Float64Array;
}

export interface ChunkKey {
  cx: number;
  cy: number;
  cz: number;
  /** Chunk width in voxels. */
  size: number;
}

export function emptyMesh(): MeshData {
  return { positions: new Float32Array(0), normals: new Float32Array(0), indices: new Uint32Array(0), partIds: new Uint16Array(0) };
}

const KEY_OFFSET = 1 << 16;
const KEY_BASE = 1 << 17;
const cellKey = (x: number, y: number, z: number): number => ((x + KEY_OFFSET) * KEY_BASE + (y + KEY_OFFSET)) * KEY_BASE + (z + KEY_OFFSET);

/** Beyond this many grid points a single block is split into chunks. */
const MAX_BLOCK_POINTS = 6_000_000;
const FALLBACK_CHUNK = 32;

// The 12 edges of a cube, as pairs of corner numbers (bit 0 = x, bit 1 = y, bit 2 = z).
const EDGE_A: number[] = [];
const EDGE_B: number[] = [];
for (let k = 0; k < 8; k++) {
  for (let b = 0; b < 3; b++) {
    if (!((k >> b) & 1)) {
      EDGE_A.push(k);
      EDGE_B.push(k | (1 << b));
    }
  }
}

// Buffers reused between calls, so meshing does not allocate in its inner loops.
// Results are always copied out, so nothing returned ever aliases these.
let samples = new Float32Array(0);
let cellVertex = new Int32Array(0);
let posBuf = new Float32Array(0);
let norBuf = new Float32Array(0);
let keyBuf = new Float64Array(0);
let idxBuf = new Uint32Array(0);
const corner = new Float64Array(8);

function grow<T extends Float32Array | Float64Array | Int32Array | Uint32Array>(buf: T, size: number): T {
  if (buf.length >= size) return buf;
  const next = new (buf.constructor as new (n: number) => T)(Math.max(size, buf.length * 2, 1024));
  next.set(buf);
  return next;
}

/** Meshes the grid points [lx, hx) x [ly, hy) x [lz, hz), which this block owns. */
function meshBlock(field: SceneField, voxel: number, lx: number, ly: number, lz: number, hx: number, hy: number, hz: number): MeshData {
  if (hx <= lx || hy <= ly || hz <= lz) return emptyMesh();
  // sample one point before the block and one after it, so edges and cells on the border are complete
  const px = hx - lx + 2, py = hy - ly + 2, pz = hz - lz + 2;
  const pxy = px * py;
  const total = pxy * pz;
  if (samples.length < total) samples = new Float32Array(Math.max(total, samples.length * 2));
  const F = samples;

  let anyNeg = false;
  let anyPos = false;
  let n = 0;
  for (let k = 0; k < pz; k++) {
    const z = (lz - 1 + k) * voxel;
    for (let j = 0; j < py; j++) {
      const y = (ly - 1 + j) * voxel;
      for (let i = 0; i < px; i++, n++) {
        const v = field.sample((lx - 1 + i) * voxel, y, z);
        F[n] = v;
        if (v < 0) anyNeg = true;
        else anyPos = true;
      }
    }
  }
  if (!anyNeg || !anyPos) return emptyMesh(); // no surface passes through here

  const cx = px - 1, cy = py - 1, cz = pz - 1;
  const cells = cx * cy * cz;
  if (cellVertex.length < cells) cellVertex = new Int32Array(Math.max(cells, cellVertex.length * 2));
  cellVertex.fill(-1, 0, cells);
  const off = [0, 1, px, px + 1, pxy, pxy + 1, pxy + px, pxy + px + 1];

  let nv = 0;
  let ni = 0;

  /** The vertex for the cell with lower corner (i, j, k) in block coordinates, made when first needed. */
  const vertexFor = (i: number, j: number, k: number): number => {
    const cell = i + cx * (j + cy * k);
    const have = cellVertex[cell];
    if (have >= 0) return have;
    const base = i + px * j + pxy * k;
    for (let c = 0; c < 8; c++) corner[c] = F[base + off[c]];
    let sx = 0, sy = 0, sz = 0, cnt = 0;
    for (let e = 0; e < 12; e++) {
      const a = EDGE_A[e], b = EDGE_B[e];
      const fa = corner[a], fb = corner[b];
      if (fa < 0 !== fb < 0) {
        const t = fa / (fa - fb);
        sx += (a & 1) + ((b & 1) - (a & 1)) * t;
        sy += ((a >> 1) & 1) + (((b >> 1) & 1) - ((a >> 1) & 1)) * t;
        sz += ((a >> 2) & 1) + (((b >> 2) & 1) - ((a >> 2) & 1)) * t;
        cnt++;
      }
    }
    if (cnt === 0) {
      sx = sy = sz = 0.5;
      cnt = 1;
    }
    if (posBuf.length < (nv + 1) * 3) {
      posBuf = grow(posBuf, (nv + 1) * 3);
      norBuf = grow(norBuf, (nv + 1) * 3);
      keyBuf = grow(keyBuf, nv + 1);
    }
    const gi = lx - 1 + i, gj = ly - 1 + j, gk = lz - 1 + k;
    posBuf[nv * 3] = (gi + sx / cnt) * voxel;
    posBuf[nv * 3 + 1] = (gj + sy / cnt) * voxel;
    posBuf[nv * 3 + 2] = (gk + sz / cnt) * voxel;
    const gx = corner[1] + corner[3] + corner[5] + corner[7] - corner[0] - corner[2] - corner[4] - corner[6];
    const gy = corner[2] + corner[3] + corner[6] + corner[7] - corner[0] - corner[1] - corner[4] - corner[5];
    const gz = corner[4] + corner[5] + corner[6] + corner[7] - corner[0] - corner[1] - corner[2] - corner[3];
    const gl = Math.sqrt(gx * gx + gy * gy + gz * gz) || 1;
    norBuf[nv * 3] = gx / gl;
    norBuf[nv * 3 + 1] = gy / gl;
    norBuf[nv * 3 + 2] = gz / gl;
    keyBuf[nv] = cellKey(gi, gj, gk);
    cellVertex[cell] = nv;
    return nv++;
  };

  const pointStep = [1, px, pxy];
  for (let a = 0; a < 3; a++) {
    // for an edge along axis a, the four cells around it differ by one step along the other two axes u and w
    const u = (a + 1) % 3, w = (a + 2) % 3;
    const ux = u === 0 ? 1 : 0, uy = u === 1 ? 1 : 0, uz = u === 2 ? 1 : 0;
    const wx = w === 0 ? 1 : 0, wy = w === 1 ? 1 : 0, wz = w === 2 ? 1 : 0;
    const step = pointStep[a];
    for (let k = 1; k < pz - 1; k++) {
      for (let j = 1; j < py - 1; j++) {
        let p = 1 + px * j + pxy * k;
        for (let i = 1; i < px - 1; i++, p++) {
          const f0 = F[p];
          const f1 = F[p + step];
          if (f0 < 0 === f1 < 0) continue;
          const v00 = vertexFor(i, j, k);
          const v10 = vertexFor(i - ux, j - uy, k - uz);
          const v11 = vertexFor(i - ux - wx, j - uy - wy, k - uz - wz);
          const v01 = vertexFor(i - wx, j - wy, k - wz);
          if (idxBuf.length < ni + 6) idxBuf = grow(idxBuf, ni + 6);
          if (f0 < 0) {
            idxBuf[ni++] = v00; idxBuf[ni++] = v10; idxBuf[ni++] = v11;
            idxBuf[ni++] = v00; idxBuf[ni++] = v11; idxBuf[ni++] = v01;
          } else {
            idxBuf[ni++] = v00; idxBuf[ni++] = v11; idxBuf[ni++] = v10;
            idxBuf[ni++] = v00; idxBuf[ni++] = v01; idxBuf[ni++] = v11;
          }
        }
      }
    }
  }

  const partIds = new Uint16Array(nv);
  for (let v = 0; v < nv; v++) {
    const id = field.partAt(posBuf[v * 3], posBuf[v * 3 + 1], posBuf[v * 3 + 2]);
    partIds[v] = id < 0 ? 0 : id;
  }
  return {
    positions: posBuf.slice(0, nv * 3),
    normals: norBuf.slice(0, nv * 3),
    indices: idxBuf.slice(0, ni),
    partIds,
    cellKeys: keyBuf.slice(0, nv),
  };
}

/** The grid-point range [lo, hi) covering a box, with `pad` extra voxels on every side. */
function pointRange(box: Box3, voxel: number, pad: number): { lo: [number, number, number]; hi: [number, number, number] } {
  const lo: [number, number, number] = [0, 0, 0];
  const hi: [number, number, number] = [0, 0, 0];
  for (let a = 0; a < 3; a++) {
    lo[a] = Math.floor(box.min[a] / voxel) - pad;
    hi[a] = Math.ceil(box.max[a] / voxel) + pad + 1;
  }
  return { lo, hi };
}

/** Meshes a whole field (or just a region of it) at one grid size. */
export function meshField(field: SceneField, opts: { voxelMm: number; region?: Box3 }): MeshData {
  const voxel = opts.voxelMm;
  if (!(voxel > 0)) throw new RangeError('voxelMm must be positive');
  const box = opts.region ?? field.bounds;
  if (boxIsEmpty(box) || boxIsEmpty(field.bounds)) return emptyMesh();
  const { lo, hi } = pointRange(box, voxel, opts.region ? 0 : 2);
  const points = (hi[0] - lo[0] + 2) * (hi[1] - lo[1] + 2) * (hi[2] - lo[2] + 2);
  if (points <= MAX_BLOCK_POINTS) return meshBlock(field, voxel, lo[0], lo[1], lo[2], hi[0], hi[1], hi[2]);

  // very large: build it in chunks and join them
  const chunks: MeshData[] = [];
  const N = FALLBACK_CHUNK;
  for (let z = lo[2]; z < hi[2]; z += N) {
    for (let y = lo[1]; y < hi[1]; y += N) {
      for (let x = lo[0]; x < hi[0]; x += N) {
        chunks.push(meshBlock(field, voxel, x, y, z, Math.min(x + N, hi[0]), Math.min(y + N, hi[1]), Math.min(z + N, hi[2])));
      }
    }
  }
  return mergeMeshes(chunks);
}

/** The chunks (each `chunkVoxels` wide) needed to cover a box, with a 2-voxel border. */
export function chunkGrid(bounds: Box3, chunkVoxels: number, voxelMm: number): ChunkKey[] {
  if (boxIsEmpty(bounds)) return [];
  const { lo, hi } = pointRange(bounds, voxelMm, 2);
  const N = chunkVoxels;
  const out: ChunkKey[] = [];
  for (let cz = Math.floor(lo[2] / N); cz <= Math.floor((hi[2] - 1) / N); cz++) {
    for (let cy = Math.floor(lo[1] / N); cy <= Math.floor((hi[1] - 1) / N); cy++) {
      for (let cx = Math.floor(lo[0] / N); cx <= Math.floor((hi[0] - 1) / N); cx++) out.push({ cx, cy, cz, size: N });
    }
  }
  return out;
}

/** Meshes one chunk. Its seams join up with the neighbouring chunks when merged. */
export function meshChunk(field: SceneField, key: ChunkKey, voxelMm: number): MeshData {
  if (boxIsEmpty(field.bounds)) return emptyMesh();
  const N = key.size;
  const lx = key.cx * N, ly = key.cy * N, lz = key.cz * N;
  return meshBlock(field, voxelMm, lx, ly, lz, lx + N, ly + N, lz + N);
}

/** Joins chunk meshes into one. Vertices that sit on a seam (same cell) are joined into one. */
export function mergeMeshes(chunks: readonly MeshData[]): MeshData {
  let nv = 0;
  let ni = 0;
  let keyed = true;
  for (const c of chunks) {
    nv += c.positions.length / 3;
    ni += c.indices.length;
    if (!c.cellKeys && c.positions.length) keyed = false;
  }
  if (nv === 0) return emptyMesh();

  const positions = new Float32Array(nv * 3);
  const normals = new Float32Array(nv * 3);
  const partIds = new Uint16Array(nv);
  const keys = keyed ? new Float64Array(nv) : undefined;
  const indices = new Uint32Array(ni);
  const seen = keyed ? new Map<number, number>() : null;
  let outV = 0;
  let outI = 0;
  for (const c of chunks) {
    const cv = c.positions.length / 3;
    if (cv === 0) continue;
    const remap = new Uint32Array(cv);
    for (let v = 0; v < cv; v++) {
      const key = c.cellKeys ? c.cellKeys[v] : NaN;
      const known = seen && keys ? seen.get(key) : undefined;
      if (known !== undefined) {
        remap[v] = known;
        continue;
      }
      positions.set(c.positions.subarray(v * 3, v * 3 + 3), outV * 3);
      normals.set(c.normals.subarray(v * 3, v * 3 + 3), outV * 3);
      partIds[outV] = c.partIds[v];
      if (keys) keys[outV] = key;
      seen?.set(key, outV);
      remap[v] = outV++;
    }
    for (let i = 0; i < c.indices.length; i++) indices[outI++] = remap[c.indices[i]];
  }
  return {
    positions: positions.slice(0, outV * 3),
    normals: normals.slice(0, outV * 3),
    indices,
    partIds: partIds.slice(0, outV),
    cellKeys: keys?.slice(0, outV),
  };
}
