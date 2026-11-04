import { bbox } from '../geom/bounds';
import { buildSceneField } from '../geom/scene';
import type { MeshData } from '../geom/surfaceNets';
import { BUILD_MM } from '../doc/types';
import type { Doc } from '../doc/types';
import { PRINT_MESSAGES } from './messages';
import type { PrintIssueCode } from './messages';

export interface PrintIssue {
  code: PrintIssueCode;
  message: string;
  fix: string;
  /** The parts to look at, when the problem belongs to particular parts. */
  partIds?: string[];
  /** A little more detail, such as the size. */
  detail?: string;
}

export interface PrintReport {
  ok: boolean;
  issues: PrintIssue[];
}

/** The thinnest wall a printer can make well, in millimetres. */
export const MIN_WALL_MM = 2;
const SIZE_TOLERANCE_MM = 0.05;

/** How big the mesh is: width (x), height (y), depth (z), in millimetres. */
export function meshSize(mesh: MeshData): { w: number; h: number; d: number } {
  const p = mesh.positions;
  if (p.length === 0) return { w: 0, h: 0, d: 0 };
  const lo = [Infinity, Infinity, Infinity];
  const hi = [-Infinity, -Infinity, -Infinity];
  for (let i = 0; i < p.length; i += 3) {
    for (let a = 0; a < 3; a++) {
      if (p[i + a] < lo[a]) lo[a] = p[i + a];
      if (p[i + a] > hi[a]) hi[a] = p[i + a];
    }
  }
  return { w: hi[0] - lo[0], h: hi[1] - lo[1], d: hi[2] - lo[2] };
}

const issue = (code: PrintIssueCode, extra: Partial<PrintIssue> = {}): PrintIssue => ({ code, ...PRINT_MESSAGES[code], ...extra });

/** Edges used by only one triangle are holes in the surface. */
function openEdgeCount(mesh: MeshData): number {
  const I = mesh.indices;
  const nv = mesh.positions.length / 3;
  const seen = new Map<number, number>();
  for (let t = 0; t < I.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const k = I[t + e] * nv + I[t + ((e + 1) % 3)];
      seen.set(k, (seen.get(k) ?? 0) + 1);
    }
  }
  let open = 0;
  for (const k of seen.keys()) {
    const a = Math.floor(k / nv);
    const b = k % nv;
    if (!seen.has(b * nv + a)) open++;
  }
  return open;
}

/** Which parts have pieces that are not joined to the rest. Empty if there is only one piece. */
function floatingPartIndexes(mesh: MeshData): number[] {
  const nv = mesh.positions.length / 3;
  const parent = new Int32Array(nv).map((_, i) => i);
  const find = (x: number): number => {
    while (parent[x] !== x) {
      parent[x] = parent[parent[x]];
      x = parent[x];
    }
    return x;
  };
  const used = new Uint8Array(nv);
  const I = mesh.indices;
  for (let t = 0; t < I.length; t += 3) {
    for (let e = 0; e < 3; e++) used[I[t + e]] = 1;
    const a = find(I[t]);
    parent[find(I[t + 1])] = a;
    parent[find(I[t + 2])] = a;
  }
  const roots = new Set<number>();
  for (let v = 0; v < nv; v++) if (used[v]) roots.add(find(v));
  if (roots.size <= 1) return [];
  const parts = new Set<number>();
  for (let v = 0; v < nv; v++) if (used[v]) parts.add(mesh.partIds[v]);
  return [...parts];
}

/**
 * Looks at a toy and its mesh and says whether it can be printed, in words a child can read.
 * It never changes the toy, and never says ok when it cannot be printed.
 */
export function checkPrintable(doc: Doc, mesh: MeshData): PrintReport {
  const issues: PrintIssue[] = [];
  const solid = doc.parts.filter((p) => !p.cut && p.outline.length >= 3);
  if (doc.parts.length === 0) return { ok: false, issues: [issue('empty')] };
  if (solid.length === 0) return { ok: false, issues: [issue('only-cuts')] };
  if (mesh.indices.length === 0) return { ok: false, issues: [issue('empty')] };

  const size = meshSize(mesh);
  const r1 = (v: number) => Math.round(v * 10) / 10;
  if (size.w > BUILD_MM + SIZE_TOLERANCE_MM || size.h > BUILD_MM + SIZE_TOLERANCE_MM || size.d > BUILD_MM + SIZE_TOLERANCE_MM) {
    issues.push(issue('too-big', { detail: `It is ${r1(size.w)} × ${r1(size.h)} × ${r1(size.d)} mm. The most is ${BUILD_MM} mm.` }));
  }

  // thin parts: by their own size first, then by looking for thin walls anywhere in the surface
  const thin = new Set<string>();
  for (const p of solid) {
    const b = bbox(p.outline);
    if (p.depthMm < MIN_WALL_MM || Math.min(b.w, b.h) < MIN_WALL_MM) thin.add(p.id);
  }
  let thinSpots = 0;
  const field = buildSceneField(doc, { voxelMm: 0.5 });
  const nv = mesh.positions.length / 3;
  const step = Math.max(1, Math.floor(nv / 300));
  const wallSteps = 8;
  for (let v = 0; v < nv; v += step) {
    const x = mesh.positions[v * 3], y = mesh.positions[v * 3 + 1], z = mesh.positions[v * 3 + 2];
    const nx = mesh.normals[v * 3], ny = mesh.normals[v * 3 + 1], nz = mesh.normals[v * 3 + 2];
    for (let s = 1; s <= wallSteps; s++) {
      const t = (s * MIN_WALL_MM) / wallSteps;
      if (field.sample(x - nx * t, y - ny * t, z - nz * t) > 0) {
        // the other side of the toy is closer than the thinnest wall allowed
        thinSpots++;
        const part = doc.parts[mesh.partIds[v]];
        if (part) thin.add(part.id);
        break;
      }
    }
  }
  if (thin.size > 0 && (thinSpots >= 6 || solid.some((p) => thin.has(p.id) && (p.depthMm < MIN_WALL_MM || Math.min(bbox(p.outline).w, bbox(p.outline).h) < MIN_WALL_MM)))) {
    issues.push(issue('too-thin', { partIds: [...thin] }));
  }

  const apart = floatingPartIndexes(mesh);
  if (apart.length > 0) issues.push(issue('floating', { partIds: apart.map((i) => doc.parts[i]?.id).filter((id): id is string => !!id) }));

  if (openEdgeCount(mesh) > 0) issues.push(issue('not-watertight'));

  return { ok: issues.length === 0, issues };
}
