import { rotationMatrix } from '../doc/frame';
import type { Part } from '../doc/types';
import { bbox } from './bounds';
import { buildMeshPartField } from './meshPartField';
import type { Box3 } from './bounds';
import { OutlineField, outlineSignature } from './outlineField';
import { PROF_MIN } from './profile';
import { clamp } from './vec';

/** A signed distance function for one part: negative inside, positive outside, millimetres, world space. */
export interface PartField {
  bounds: Box3;
  distance(x: number, y: number, z: number): number;
}

/** Remembers each part's outline grid so moving a part does not rebuild it. Keyed by part id. */
export type OutlineCache = Map<string, { sig: string; field: OutlineField }>;

export interface FieldOptions {
  /** Grid cell size for the outline, mm. Smaller is more exact and slower to build. Default 0.75. */
  cell?: number;
  /** Extra room kept around the outline for blending, mm. Default: the part's blend plus 8. */
  margin?: number;
  cache?: OutlineCache;
}

const PROFILE_TABLE = 64;

/**
 * Builds the distance function for one part: its outline pushed out to a thickness with rounded
 * edges, then optionally squashed, tapered, shaped from the side, and turned.
 * `distance` does no allocation: it is the hot loop of the mesher.
 */
export function buildPartField(part: Part, opts: FieldOptions = {}): PartField {
  if (part.kind === 'import' && part.mesh) return buildMeshPartField(part);
  const cell = opts.cell ?? 0.75;
  const margin = opts.margin ?? Math.max(part.blend, 0) + 8;
  const bb = bbox(part.outline);

  // --- the outline grid, shared when only the position changed ---
  const sig = outlineSignature(part.outline, cell, margin);
  let outline: OutlineField;
  const cached = opts.cache?.get(part.id);
  if (cached && cached.sig === sig) {
    outline = cached.field;
  } else {
    outline = new OutlineField(part.outline, cell, margin);
    opts.cache?.set(part.id, { sig, field: outline });
  }
  const ox = bb.x0;
  const oy = bb.y0;

  // --- rounded-extrusion parameters ---
  const hD = part.depthMm / 2;
  const zc = part.z;
  const rin = Math.max(outline.inscribedRadius, 0.01);
  const rc = Math.min(hD, rin);
  const t = part.cut ? 0 : clamp(part.round, 0, 1);
  let rxy: number;
  let rz: number;
  if (t <= 0.5) {
    rxy = rz = rc * 2 * t;
  } else {
    const s = 2 * t - 1;
    rxy = rc + (Math.max(rc, rin * 0.98) - rc) * s;
    rz = rc + (hD - rc) * s;
  }
  if (rxy < 1e-3 || rz < 1e-3) {
    rxy = 0;
    rz = 0;
  }
  const k = rz > 0 ? rxy / rz : 1;
  const ks = k > 1 ? Math.sqrt(k) : 1;

  /** The part with no turn or warp: d2 is the 2D distance, z the height. */
  const extruded = (d2: number, z: number): number => {
    if (rxy === 0) {
      const zz = Math.abs(z - zc) - hD;
      const ma = d2 > 0 ? d2 : 0;
      const mz = zz > 0 ? zz : 0;
      return Math.min(Math.max(d2, zz), 0) + Math.sqrt(ma * ma + mz * mz);
    }
    const zs = (z - zc) * k;
    const a = d2 + rxy;
    const zz = Math.abs(zs) - (hD * k - rxy);
    const ma = a > 0 ? a : 0;
    const mz = zz > 0 ? zz : 0;
    return (Math.min(Math.max(a, zz), 0) + Math.sqrt(ma * ma + mz * mz) - rxy) / ks;
  };

  // --- turn, squash, taper, side profile ---
  const { x: rx, y: ry, z: rzDeg } = part.rot;
  const R = rx || ry || rzDeg ? rotationMatrix(part.rot) : null;
  const sq = clamp(part.squash / 100, -0.6, 0.8);
  const wb = 1 + sq;
  const wa = 1 / Math.sqrt(wb);
  const tp = clamp(part.taper / 100, -1, 1);
  const warp = wa !== 1 || wb !== 1 || tp !== 0;

  const prof = part.profile;
  let profC: Float32Array | null = null; // middle of the part at each height
  let profH: Float32Array | null = null; // half thickness at each height
  if (prof) {
    profC = new Float32Array(PROFILE_TABLE);
    profH = new Float32Array(PROFILE_TABLE);
    for (let i = 0; i < PROFILE_TABLE; i++) {
      const f = prof.front[i];
      const b = prof.back[i];
      profC[i] = ((f + b) / 2) * hD;
      profH[i] = Math.max((f - b) / 2, PROF_MIN / 2) * hD;
    }
  }

  const cx = bb.cx;
  const cy = bb.cy;
  const hh = Math.max(bb.h / 2, 0.01);

  // --- bounds ---
  const z0 = zc + (prof ? Math.min(Math.min(...prof.back), -0.05) : -1) * hD;
  const z1 = zc + (prof ? Math.max(Math.max(...prof.front), 0.05) : 1) * hD;
  let bounds: Box3;
  if (!R && !warp) {
    bounds = { min: [bb.x0, bb.y0, z0], max: [bb.x1, bb.y1, z1] };
  } else {
    const lo: [number, number, number] = [Infinity, Infinity, Infinity];
    const hi: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    for (const sx of [bb.x0, bb.x1]) {
      for (const sy of [bb.y0, bb.y1]) {
        for (const sz of [z0, z1]) {
          let x = (sx - cx) * wa;
          let y = (sy - cy) * wb;
          let z = (sz - zc) * wa;
          if (R) {
            const X = R[0] * x + R[1] * y + R[2] * z;
            const Y = R[3] * x + R[4] * y + R[5] * z;
            const Z = R[6] * x + R[7] * y + R[8] * z;
            x = X;
            y = Y;
            z = Z;
          }
          x += cx;
          y += cy;
          z += zc;
          if (x < lo[0]) lo[0] = x;
          if (x > hi[0]) hi[0] = x;
          if (y < lo[1]) lo[1] = y;
          if (y > hi[1]) hi[1] = y;
          if (z < lo[2]) lo[2] = z;
          if (z > hi[2]) hi[2] = z;
        }
      }
    }
    bounds = { min: lo, max: hi };
  }

  if (!R && !warp && !prof) {
    return {
      bounds,
      distance: (x, y, z) => extruded(outline.sample(x - ox, y - oy), z),
    };
  }

  const last = PROFILE_TABLE - 1;
  return {
    bounds,
    distance: (x, y, z) => {
      let dx = x - cx;
      let dy = y - cy;
      let dz = z - zc;
      if (R) {
        // undo the turn: multiply by the transpose
        const lx = R[0] * dx + R[3] * dy + R[6] * dz;
        const ly = R[1] * dx + R[4] * dy + R[7] * dz;
        const lz = R[2] * dx + R[5] * dy + R[8] * dz;
        dx = lx;
        dy = ly;
        dz = lz;
      }
      let f = 1; // how much distances were stretched by the steps below
      if (warp) {
        dx /= wa;
        dy /= wb;
        dz /= wa;
        f = Math.min(wa, wb);
        if (tp !== 0) {
          let u = (dy / hh + 1) * 0.5;
          u = u < 0 ? 0 : u > 1 ? 1 : u;
          const s = tp > 0 ? 1 - 0.9 * tp * u : 1 - 0.9 * -tp * (1 - u);
          dx /= s;
          dz /= s;
          f *= s;
        }
      }
      if (profC !== null && profH !== null) {
        let u = (dy / hh + 1) * 0.5;
        u = u < 0 ? 0 : u > 1 ? 1 : u;
        const g = u * last;
        const i = g | 0;
        const j = i > last - 1 ? last : i + 1;
        const w = g - i;
        const c = profC[i] + (profC[j] - profC[i]) * w;
        const h = profH[i] + (profH[j] - profH[i]) * w;
        const s = h / hD;
        dz = (dz - c) / s;
        if (s < 1) f *= s;
      }
      return extruded(outline.sample(cx + dx - ox, cy + dy - oy), zc + dz) * f;
    },
  };
}
