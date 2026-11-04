import { dirToWorld, localToWorld, partFrame } from '../doc/frame';
import type { Doc, Part } from '../doc/types';
import { boxIsEmpty, emptyBox, growBox } from './bounds';
import type { Box3 } from './bounds';
import { buildPartField } from './sdf';
import type { OutlineCache, PartField } from './sdf';
import { SpatialIndex } from './spatial';
import { clamp } from './vec';

/** The whole toy as one signed distance function (negative inside, millimetres). */
export interface SceneField {
  /** Box around everything solid. Empty (see `boxIsEmpty`) when there is nothing to print. */
  bounds: Box3;
  /**
   * Signed distance to the toy. +Infinity everywhere if there is nothing solid.
   * Accurate near the surface; far away it is only a safe positive number.
   */
  sample(x: number, y: number, z: number): number;
  /** Index (in `doc.parts`) of the nearest solid part, for colouring and picking. -1 if none. */
  partAt(x: number, y: number, z: number): number;
}

export interface SceneOptions {
  /** Build only these parts (by id). Used to look at one part on its own. */
  onlyParts?: ReadonlySet<string>;
  /** Size of the mesh grid the field will be sampled on, mm. Sets blend margins and smoothing reach. */
  voxelMm?: number;
  /** Cell size of each part's outline grid, mm. */
  cell?: number;
  cache?: OutlineCache;
}

/** Smooth minimum: blends a and b over a distance k. With k = 0 it is a plain minimum. */
export function smin(a: number, b: number, k: number): number {
  if (k <= 1e-6) return a < b ? a : b;
  const h = Math.max(k - Math.abs(a - b), 0) / k;
  return Math.min(a, b) - h * h * k * 0.25;
}

/** The mirrored copy (across x = 0) of `src`, keeping the twin's own name, colour and id. */
function mirrorPart(src: Part, twin: Part): Part {
  return {
    ...twin,
    outline: src.outline.map(([x, y]): [number, number] => [-x, y]).reverse(),
    depthMm: src.depthMm,
    round: src.round,
    z: src.z,
    blend: src.blend,
    melt: src.melt,
    cut: src.cut,
    taper: src.taper,
    squash: src.squash,
    rot: { x: src.rot.x, y: -src.rot.y, z: -src.rot.z },
    profile: src.profile,
  };
}

const PULL = 0;
const PUSH = 1;
const GRAB = 2;
const SMOOTH = 3;

const wFall = (t: number): number => (t >= 1 ? 0 : (1 - t * t) * (1 - t * t));

export function buildSceneField(doc: Doc, opts: SceneOptions = {}): SceneField {
  const voxel = opts.voxelMm ?? 1;
  const cell = opts.cell ?? clamp(voxel * 0.6, 0.4, 1.5);

  // --- which parts count, and what they really look like (twins are mirrored copies) ---
  const byId = new Map(doc.parts.map((p) => [p.id, p]));
  const parts: Part[] = [];
  const docIndex: number[] = [];
  doc.parts.forEach((p, i) => {
    if (opts.onlyParts && !opts.onlyParts.has(p.id)) return;
    let eff = p;
    if (doc.settings.symmetry && p.twinOf) {
      const src = byId.get(p.twinOf);
      if (src) eff = mirrorPart(src, p);
    }
    if (eff.outline.length < 3) return;
    parts.push(eff);
    docIndex.push(i);
  });
  const n = parts.length;
  const solid: number[] = [];
  const cuts: number[] = [];
  parts.forEach((p, i) => (p.cut ? cuts : solid).push(i));

  if (solid.length === 0) {
    return { bounds: emptyBox(), sample: () => Infinity, partAt: () => -1 };
  }

  // --- blending: which parts melt into which ---
  const isOff = (p: Part) => !p.melt || p.cut;
  let mb = 0;
  for (const p of parts) if (!isOff(p)) mb = Math.max(mb, p.blend);
  const margin = mb + 3 * voxel + 1;
  const fields: PartField[] = parts.map((p) => buildPartField(p, { cell, margin, cache: opts.cache }));

  const bx0 = new Float64Array(n), by0 = new Float64Array(n), bz0 = new Float64Array(n);
  const bx1 = new Float64Array(n), by1 = new Float64Array(n), bz1 = new Float64Array(n);
  fields.forEach((f, i) => {
    bx0[i] = f.bounds.min[0]; by0[i] = f.bounds.min[1]; bz0[i] = f.bounds.min[2];
    bx1[i] = f.bounds.max[0]; by1[i] = f.bounds.max[1]; bz1[i] = f.bounds.max[2];
  });

  // A part blends with the parts before it that melt and sit close by.
  const kk = new Float64Array(n);
  for (let i = 0; i < n; i++) {
    const p = parts[i];
    if (p.cut) continue;
    let k = isOff(p) ? 0 : p.blend;
    for (let j = 0; j < i; j++) {
      if (isOff(parts[j])) continue;
      if (
        bx0[i] < bx1[j] + mb && bx1[i] > bx0[j] - mb &&
        by0[i] < by1[j] + mb && by1[i] > by0[j] - mb &&
        bz0[i] < bz1[j] + mb && bz1[i] > bz0[j] - mb
      ) {
        k = Math.max(k, parts[j].blend);
      }
    }
    kk[i] = k;
  }
  let kc = 0;
  for (const i of cuts) kc = Math.max(kc, Math.min(parts[i].blend, 6));

  // how far from a part's box we still bother to ask it
  const reach = new Float64Array(n);
  for (let i = 0; i < n; i++) reach[i] = (parts[i].cut ? kc : kk[i]) + 2 * voxel + 1;

  const boxDist = (i: number, x: number, y: number, z: number): number => {
    const dx = Math.max(bx0[i] - x, 0, x - bx1[i]);
    const dy = Math.max(by0[i] - y, 0, y - by1[i]);
    const dz = Math.max(bz0[i] - z, 0, z - bz1[i]);
    return Math.sqrt(dx * dx + dy * dy + dz * dz);
  };

  // --- grooves: capsule-shaped cuts, listed as segments ---
  const segA: number[] = [];
  const segB: number[] = [];
  const segR: number[] = [];
  const segBoxes: Box3[] = [];
  for (const g of doc.grooves) {
    const variants = g.mirror ? [1, -1] : [1];
    for (const sx of variants) {
      for (let s = 0; s + 1 < g.points.length; s++) {
        const a = g.points[s];
        const b = g.points[s + 1];
        segA.push(a[0] * sx, a[1], a[2]);
        segB.push(b[0] * sx, b[1], b[2]);
        segR.push(g.radius);
        const m = g.radius + voxel * 1.5;
        segBoxes.push({
          min: [Math.min(a[0] * sx, b[0] * sx) - m, Math.min(a[1], b[1]) - m, Math.min(a[2], b[2]) - m],
          max: [Math.max(a[0] * sx, b[0] * sx) + m, Math.max(a[1], b[1]) + m, Math.max(a[2], b[2]) + m],
        });
      }
    }
  }
  const segIndex = segBoxes.length ? new SpatialIndex(segBoxes) : null;

  // --- sculpt dabs, turned into world-space operations in order ---
  const partById = new Map(parts.map((p) => [p.id, p]));
  const oType: number[] = [];
  const oc: number[] = []; // centres, 3 per op
  const oR: number[] = [];
  const oK: number[] = [];
  const oD: number[] = []; // drag, 3 per op
  const oReff: number[] = [];
  const oW: number[] = [];
  const opBoxes: Box3[] = [];
  for (const d of doc.dabs) {
    const p = partById.get(d.partId);
    if (!p || p.cut) continue;
    const fr = partFrame(p);
    const c = localToWorld(fr, d.at);
    const drag = d.drag ? dirToWorld(fr, d.drag) : ([0, 0, 0] as const);
    const L = Math.hypot(drag[0], drag[1], drag[2]);
    const r = d.radius;
    let type: number;
    let k = 0;
    let reff = r;
    let reachR: number;
    switch (d.type) {
      case 'pull': type = PULL; k = r * 0.5; reachR = r + k + voxel + 1; break;
      case 'push': type = PUSH; k = r * 0.4; reachR = r + k + voxel + 1; break;
      case 'grab': type = GRAB; reff = Math.max(r, L * 1.6); reachR = reff + L + voxel + 1; break;
      default: type = SMOOTH; reachR = r + 0.01; break;
    }
    oType.push(type);
    oc.push(c[0], c[1], c[2]);
    oR.push(r);
    oK.push(k);
    oD.push(drag[0], drag[1], drag[2]);
    oReff.push(reff);
    oW.push(d.strength);
    opBoxes.push({ min: [c[0] - reachR, c[1] - reachR, c[2] - reachR], max: [c[0] + reachR, c[1] + reachR, c[2] + reachR] });
  }
  const nOps = oType.length;
  const opIndex = nOps ? new SpatialIndex(opBoxes) : null;
  const hasSmooth = oType.includes(SMOOTH);

  // --- bounds ---
  const bounds = emptyBox();
  // melting can push a surface out by up to a quarter of the blend distance
  const bulge = mb / 4;
  for (const i of solid) growBox(bounds, bx0[i] - bulge, by0[i] - bulge, bz0[i] - bulge, bx1[i] + bulge, by1[i] + bulge, bz1[i] + bulge);
  for (let o = 0; o < nOps; o++) {
    const r = oReff[o];
    if (oType[o] === PULL) {
      growBox(bounds, oc[o * 3] - r, oc[o * 3 + 1] - r, oc[o * 3 + 2] - r, oc[o * 3] + r, oc[o * 3 + 1] + r, oc[o * 3 + 2] + r);
    } else if (oType[o] === GRAB) {
      for (const s of [0, 1]) {
        const cx = oc[o * 3] + oD[o * 3] * s, cy = oc[o * 3 + 1] + oD[o * 3 + 1] * s, cz = oc[o * 3 + 2] + oD[o * 3 + 2] * s;
        growBox(bounds, cx - r, cy - r, cz - r, cx + r, cy + r, cz + r);
      }
    }
  }

  // --- evaluation ---
  const evalBase = (x: number, y: number, z: number): number => {
    let F = 0;
    let any = false;
    let lower = Infinity;
    for (let s = 0; s < solid.length; s++) {
      const i = solid[s];
      const bd = boxDist(i, x, y, z);
      if (bd > reach[i]) {
        if (bd < lower) lower = bd;
        continue;
      }
      const d = fields[i].distance(x, y, z);
      F = any ? smin(F, d, kk[i]) : d;
      any = true;
    }
    if (!any) return lower; // nothing is close: a safe, positive "outside"

    if (cuts.length) {
      let C = 0;
      let anyCut = false;
      for (let s = 0; s < cuts.length; s++) {
        const i = cuts[s];
        if (boxDist(i, x, y, z) > reach[i]) continue;
        const d = fields[i].distance(x, y, z);
        C = anyCut ? (d < C ? d : C) : d;
        anyCut = true;
      }
      if (anyCut) F = kc > 1e-6 ? -smin(-F, C, kc) : Math.max(F, -C);
    }

    if (segIndex) {
      const c = segIndex.cellOf(x, y, z);
      if (c >= 0) {
        for (let q = segIndex.starts[c]; q < segIndex.starts[c + 1]; q++) {
          const s = segIndex.items[q] * 3;
          const ax = segA[s], ay = segA[s + 1], az = segA[s + 2];
          const dx = segB[s] - ax, dy = segB[s + 1] - ay, dz = segB[s + 2] - az;
          const len2 = dx * dx + dy * dy + dz * dz || 1e-9;
          let t = ((x - ax) * dx + (y - ay) * dy + (z - az) * dz) / len2;
          t = t < 0 ? 0 : t > 1 ? 1 : t;
          const ex = ax + t * dx - x, ey = ay + t * dy - y, ez = az + t * dz - z;
          const v = segR[segIndex.items[q]] - Math.sqrt(ex * ex + ey * ey + ez * ez);
          if (v > F) F = v;
        }
      }
    }
    return F;
  };

  /** The field with only the first `limit` sculpt operations applied. */
  const evalOps = (x: number, y: number, z: number, limit: number): number => {
    const cellId = opIndex ? opIndex.cellOf(x, y, z) : -1;
    if (cellId < 0 || !opIndex) return evalBase(x, y, z);
    const items = opIndex.items;
    const s0 = opIndex.starts[cellId];
    const s1 = opIndex.starts[cellId + 1];

    // The last grab that reaches here replaces everything before it: look up the earlier field where the surface was dragged from.
    let F = NaN;
    let from = s0;
    for (let q = s1 - 1; q >= s0; q--) {
      const o = items[q];
      if (o >= limit || oType[o] !== GRAB) continue;
      const cx = oc[o * 3], cy = oc[o * 3 + 1], cz = oc[o * 3 + 2];
      const Dx = oD[o * 3], Dy = oD[o * 3 + 1], Dz = oD[o * 3 + 2];
      const reff = oReff[o];
      const L = Math.sqrt(Dx * Dx + Dy * Dy + Dz * Dz);
      if (Math.hypot(x - cx, y - cy, z - cz) >= reff + L) continue;
      let qx = x, qy = y, qz = z;
      for (let it = 0; it < 3; it++) {
        const w = wFall(Math.hypot(qx - cx, qy - cy, qz - cz) / reff);
        qx = x - Dx * w;
        qy = y - Dy * w;
        qz = z - Dz * w;
      }
      F = evalOps(qx, qy, qz, o);
      from = q + 1;
      break;
    }

    let base = NaN;
    if (F !== F) {
      base = evalBase(x, y, z);
      F = base;
    }

    let smooth = 0;
    for (let q = from; q < s1; q++) {
      const o = items[q];
      if (o >= limit) break;
      const type = oType[o];
      if (type === GRAB) continue;
      const dx = x - oc[o * 3], dy = y - oc[o * 3 + 1], dz = z - oc[o * 3 + 2];
      const dist = Math.sqrt(dx * dx + dy * dy + dz * dz);
      const r = oR[o];
      if (type === PULL) {
        F = smin(F, dist - r, oK[o]);
      } else if (type === PUSH) {
        F = -smin(-F, dist - r, oK[o]);
      } else if (dist < r) {
        const u = 1 - dist / r;
        smooth += oW[o] * u * u;
      }
    }

    if (smooth > 0 && hasSmooth) {
      // pull the value towards the average of its neighbours, as the prototype's smooth brush did
      if (base !== base) base = evalBase(x, y, z);
      const h = voxel;
      const avg =
        (evalBase(x - h, y, z) + evalBase(x + h, y, z) + evalBase(x, y - h, z) + evalBase(x, y + h, z) + evalBase(x, y, z - h) + evalBase(x, y, z + h)) / 6;
      F += Math.min(smooth, 1) * (avg - base);
    }
    return F;
  };

  const sample = (x: number, y: number, z: number): number => (nOps ? evalOps(x, y, z, nOps) : evalBase(x, y, z));

  const partAt = (x: number, y: number, z: number): number => {
    const near = mb + 3;
    let best = -1;
    let bestD = Infinity;
    for (let s = 0; s < solid.length; s++) {
      const i = solid[s];
      if (boxDist(i, x, y, z) > near) continue;
      const d = fields[i].distance(x, y, z);
      if (d < bestD) {
        bestD = d;
        best = i;
      }
    }
    if (best < 0) {
      // nothing close: fall back to the closest box
      for (let s = 0; s < solid.length; s++) {
        const i = solid[s];
        const d = boxDist(i, x, y, z);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      }
    }
    return best < 0 ? -1 : docIndex[best];
  };

  if (boxIsEmpty(bounds)) return { bounds, sample: () => Infinity, partAt: () => -1 };
  return { bounds, sample, partAt };
}
