import type { Vec2, Vec3 } from '../geom/vec';

export const DOC_VERSION = 3 as const;

/**
 * The biggest a toy may be in any direction, in millimetres. The printer (a Bambu P1S) has a 256 mm bed;
 * toys are kept to 100 mm so they print quickly and fit with room to spare. Change it here, nowhere else.
 */
export const BUILD_MM = 100 as const;

export const PART_KINDS = [
  'circle', 'box', 'star', 'heart', 'egg', 'capsule', 'triangle', 'drop', 'moon',
  'draw', 'limb', 'eyes', 'smile', 'import',
] as const;
export type PartKind = (typeof PART_KINDS)[number];

/** Number of samples in each side of a SideProfile. */
export const PROFILE_SAMPLES = 64;
/** Largest value a profile sample may have, in units of half the part's depth. */
export const PROFILE_MAX = 1.8;

/**
 * The part seen from the side. Index 0 is the bottom of the part and the last index is the top.
 * Values are distances from the part's middle plane, in units of half the depth:
 * `front` is positive (towards the viewer), `back` is negative. A plain part is 1 and -1.
 */
export interface SideProfile {
  front: number[];
  back: number[];
}

/**
 * A shape opened from an STL file, kept as a grid of distances to its skin (negative inside).
 * The grid is measured in the shape's size when it was opened; the part's outline box and thickness
 * stretch it. Grid point (i, j, k) sits at `-size / 2 - PAD * cell + (i, j, k) * cell` from the middle.
 */
export interface PartMesh {
  /** Size of the shape when it was opened, millimetres (width, height, depth). */
  size: Vec3;
  /** Number of grid points along x, y and z. */
  n: [number, number, number];
  /** Distance between grid points, millimetres. */
  cell: number;
  /** Millimetres for each fine step of the stored numbers (see mesh/quant.ts). */
  step: number;
  /** One signed byte per grid point (x changes fastest, then y, then z), as base64 text. */
  data: string;
  /** The grid is a mirror image of the shape it was made from (used by mirrored copies). */
  flipX?: boolean;
}

/** Empty grid points kept around an imported shape. */
export const MESH_PAD = 3;

export interface Part {
  id: string;
  name: string;
  kind: PartKind;
  /** Closed outline in the Front view, millimetres. */
  outline: Vec2[];
  /** CSS hex colour such as #e5484d. */
  color: string;
  /** How thick the part is, front to back, in millimetres. */
  depthMm: number;
  /** 0 is square-edged, 1 is fully round (a sphere for a circle). */
  round: number;
  /** Where the middle of the part sits front to back, millimetres. */
  z: number;
  /** How far this part melts into touching parts, millimetres. */
  blend: number;
  melt: boolean;
  /** Cut-away parts remove material instead of adding it. */
  cut: boolean;
  /** Turn in degrees, applied about the middle of the outline box in the order Z, then Y, then X. */
  rot: { x: number; y: number; z: number };
  /** Percent, -100 to 100. */
  taper: number;
  /** Percent, -100 to 100. */
  squash: number;
  profile?: SideProfile;
  /** This part is the mirrored copy (across x = 0) of the part with this id. */
  twinOf?: string;
  /** Only for kind 'import': the opened shape. */
  mesh?: PartMesh;
}

export type DabType = 'push' | 'pull' | 'smooth' | 'grab';

/**
 * A sculpt edit. Positions are in the part's local space (see `partFrame`):
 * relative to the middle of the part, turned with it, and divided by its width, height and depth.
 * That makes a dab follow its part when the part moves, turns or is resized.
 * `radius` is in millimetres and does not change when the part is resized.
 */
export interface Dab {
  partId: string;
  /** pull: surface comes out. push: surface goes in. */
  type: DabType;
  at: Vec3;
  radius: number;
  /** Used by smooth. Push, pull and grab ignore it. */
  strength: number;
  /** Grab only: how far the surface was dragged, in the same local units as `at`. */
  drag?: Vec3;
}

/** A carved line (the Crease tool). Points are world millimetres. */
export interface Groove {
  points: Vec3[];
  radius: number;
  mirror: boolean;
}

export interface Doc {
  version: typeof DOC_VERSION;
  parts: Part[];
  dabs: Dab[];
  grooves: Groove[];
  settings: {
    symmetry: boolean;
    build: { w: typeof BUILD_MM; h: typeof BUILD_MM; d: typeof BUILD_MM };
  };
}
