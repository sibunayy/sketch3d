import { boxIsEmpty } from '../core/geom/bounds';
import { buildSceneField } from '../core/geom/scene';
import { chunkGrid, emptyMesh, mergeMeshes, meshChunk, meshField } from '../core/geom/surfaceNets';
import type { MeshData } from '../core/geom/surfaceNets';
import type { OutlineCache } from '../core/geom/sdf';
import type { Doc } from '../core/doc/types';
import type { Quality } from './protocol';

export interface JobOptions {
  /** Outline grids kept between jobs, so moving a part does not rebuild them. */
  cache?: OutlineCache;
  /** Return false once a newer job exists, so a long job can stop early. */
  isCurrent?: () => boolean;
  /** Called between chunks so the worker can hear about newer jobs. */
  yieldNow?: () => Promise<void>;
}

/** Final meshes are built in chunks of this many voxels, with a pause between chunks. */
const CHUNK_VOXELS = 24;
/** Below this many grid points a final mesh is built in one go: it is quick, and one go is cheaper. */
const ONE_GO_POINTS = 150_000;

/**
 * Meshes a document. A draft is built in one go. A big final is built chunk by chunk, checking
 * `isCurrent` between chunks. Returns null if the job was dropped for a newer one.
 * Runs in the mesher worker, but has no worker-specific code so it can be tested and benchmarked anywhere.
 */
export async function meshDocument(doc: Doc, voxelMm: number, quality: Quality, opts: JobOptions = {}): Promise<MeshData | null> {
  const isCurrent = opts.isCurrent ?? (() => true);
  const yieldNow = opts.yieldNow ?? (() => Promise.resolve());
  if (!isCurrent()) return null;

  const field = buildSceneField(doc, { voxelMm, cache: opts.cache });
  if (boxIsEmpty(field.bounds)) return emptyMesh();
  if (!isCurrent()) return null;

  const { min, max } = field.bounds;
  const points = ((max[0] - min[0]) / voxelMm + 6) * ((max[1] - min[1]) / voxelMm + 6) * ((max[2] - min[2]) / voxelMm + 6);
  if (quality === 'draft' || points <= ONE_GO_POINTS) return strip(meshField(field, { voxelMm }));

  const chunks: MeshData[] = [];
  const keys = chunkGrid(field.bounds, CHUNK_VOXELS, voxelMm);
  for (let i = 0; i < keys.length; i++) {
    if (!isCurrent()) return null;
    chunks.push(meshChunk(field, keys[i], voxelMm));
    if (i < keys.length - 1) await yieldNow();
  }
  if (!isCurrent()) return null;
  return strip(mergeMeshes(chunks));
}

/** The cell keys are only for joining chunk seams. The page does not need them. */
function strip(mesh: MeshData): MeshData {
  delete mesh.cellKeys;
  return mesh;
}
