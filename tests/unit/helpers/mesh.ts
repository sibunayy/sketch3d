import type { MeshData } from '../../../src/core/geom/surfaceNets';

export interface EdgeReport {
  /** True when every edge is shared by exactly two triangles, running in opposite directions. */
  ok: boolean;
  /** Edges used by one triangle only (holes). */
  open: number;
  /** Edges used by more than two triangles, or twice in the same direction. */
  tangled: number;
  triangles: number;
}

/** Checks that a mesh is a closed, consistently turned surface (no holes, no T-joins). */
export function edgeManifold(mesh: MeshData): EdgeReport {
  const idx = mesh.indices;
  const nv = mesh.positions.length / 3;
  const directed = new Map<number, number>();
  const key = (a: number, b: number) => a * nv + b;
  for (let t = 0; t < idx.length; t += 3) {
    for (let e = 0; e < 3; e++) {
      const k = key(idx[t + e], idx[t + ((e + 1) % 3)]);
      directed.set(k, (directed.get(k) ?? 0) + 1);
    }
  }
  let open = 0;
  let tangled = 0;
  for (const [k, count] of directed) {
    const a = Math.floor(k / nv);
    const b = k % nv;
    if (count !== 1) tangled++;
    else if (directed.get(key(b, a)) !== 1) open++;
  }
  return { ok: open === 0 && tangled === 0, open, tangled, triangles: idx.length / 3 };
}

/** Volume enclosed by a closed mesh, in cubic millimetres (positive when triangles face outward). */
export function meshVolume(mesh: MeshData): number {
  const p = mesh.positions;
  const idx = mesh.indices;
  let v = 0;
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    v +=
      (p[a] * (p[b + 1] * p[c + 2] - p[b + 2] * p[c + 1]) -
        p[a + 1] * (p[b] * p[c + 2] - p[b + 2] * p[c]) +
        p[a + 2] * (p[b] * p[c + 1] - p[b + 1] * p[c])) /
      6;
  }
  return v;
}
