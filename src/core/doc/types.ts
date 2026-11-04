import type { Vec2, Vec3 } from '../geom/vec';

export const DOC_VERSION = 3 as const;

export const PART_KINDS = [
  'circle', 'box', 'star', 'heart', 'egg', 'capsule', 'triangle', 'drop', 'moon',
  'draw', 'limb', 'eyes', 'smile',
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
    build: { w: 110; h: 110; d: 70 };
  };
}
