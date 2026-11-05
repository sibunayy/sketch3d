import { STL_MESSAGES } from './messages';

/** Thrown when a file cannot be opened as a 3D shape. `message` is safe to show to a child; `detail` is for logs. */
export class StlError extends Error {
  readonly detail: string;
  constructor(message: string, detail = '') {
    super(message);
    this.name = 'StlError';
    this.detail = detail;
  }
}

/** Most triangles we will open. More than this is slow and does not make a better toy. */
export const MAX_TRIANGLES = 1_500_000;
/** Biggest file we will read, bytes. */
export const MAX_FILE_BYTES = 120 * 1024 * 1024;

const bad = (message: string, detail: string) => new StlError(message, detail);

/**
 * Reads an STL file (binary or text) and returns the triangles as x, y, z for each of three corners
 * (nine numbers per triangle), exactly as stored. Triangles with no area are left out.
 */
export function parseStl(buf: ArrayBuffer): Float32Array {
  if (buf.byteLength > MAX_FILE_BYTES) throw bad(STL_MESSAGES.tooBig, `${buf.byteLength} bytes`);
  if (buf.byteLength < 15) throw bad(STL_MESSAGES.notAShape, 'too short');

  // A binary file says how many triangles it holds, and its length matches that exactly.
  let count = -1;
  if (buf.byteLength >= 84) {
    const n = new DataView(buf).getUint32(80, true);
    if (buf.byteLength === 84 + 50 * n) count = n;
    else if (n > MAX_TRIANGLES && !looksLikeText(buf)) throw bad(STL_MESSAGES.tooDetailed, `${n} triangles claimed`);
  }
  let raw: Float32Array;
  if (count >= 0) {
    if (count > MAX_TRIANGLES) throw bad(STL_MESSAGES.tooDetailed, `${count} triangles`);
    raw = readBinary(buf, count);
  } else if (looksLikeText(buf)) {
    raw = readText(buf);
  } else if (buf.byteLength >= 84) {
    throw bad(STL_MESSAGES.broken, 'length does not match the triangle count');
  } else {
    throw bad(STL_MESSAGES.notAShape, 'not binary or text');
  }
  return dropFlat(raw);
}

function looksLikeText(buf: ArrayBuffer): boolean {
  const head = new Uint8Array(buf, 0, Math.min(buf.byteLength, 4000));
  let s = '';
  for (let i = 0; i < head.length; i++) s += String.fromCharCode(head[i]);
  const t = s.trimStart().toLowerCase();
  return t.startsWith('solid') && t.includes('facet');
}

function readBinary(buf: ArrayBuffer, n: number): Float32Array {
  const dv = new DataView(buf);
  const out = new Float32Array(n * 9);
  for (let t = 0; t < n; t++) {
    const base = 84 + t * 50 + 12;
    for (let k = 0; k < 9; k++) {
      const v = dv.getFloat32(base + k * 4, true);
      if (!Number.isFinite(v)) throw bad(STL_MESSAGES.broken, `triangle ${t} has a corner that is not a number`);
      out[t * 9 + k] = v;
    }
  }
  return out;
}

function readText(buf: ArrayBuffer): Float32Array {
  const text = new TextDecoder().decode(buf);
  const out: number[] = [];
  const re = /vertex\s+(\S+)\s+(\S+)\s+(\S+)/gi;
  let m: RegExpExecArray | null;
  while ((m = re.exec(text)) !== null) {
    for (let k = 1; k <= 3; k++) {
      const v = Number(m[k]);
      if (!Number.isFinite(v)) throw bad(STL_MESSAGES.broken, `bad number "${m[k]}"`);
      out.push(v);
    }
    if (out.length / 9 > MAX_TRIANGLES) throw bad(STL_MESSAGES.tooDetailed, 'too many triangles');
  }
  if (out.length % 9 !== 0) throw bad(STL_MESSAGES.broken, 'a triangle has fewer than three corners');
  return Float32Array.from(out);
}

function dropFlat(p: Float32Array): Float32Array {
  const n = p.length / 9;
  const keep = new Float32Array(p.length);
  let w = 0;
  for (let t = 0; t < n; t++) {
    const o = t * 9;
    const ux = p[o + 3] - p[o], uy = p[o + 4] - p[o + 1], uz = p[o + 5] - p[o + 2];
    const vx = p[o + 6] - p[o], vy = p[o + 7] - p[o + 1], vz = p[o + 8] - p[o + 2];
    const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
    if (cx * cx + cy * cy + cz * cz <= 1e-14) continue;
    keep.set(p.subarray(o, o + 9), w);
    w += 9;
  }
  if (w === 0) throw bad(STL_MESSAGES.empty, 'no triangles with area');
  return keep.slice(0, w);
}
