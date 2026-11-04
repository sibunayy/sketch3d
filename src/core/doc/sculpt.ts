import type { Vec3 } from '../geom/vec';
import { partFrame, worldToLocal } from './frame';
import type { Dab, DabType, Part } from './types';

export type SculptSize = 's' | 'm' | 'l';
export type SculptStrength = 'gentle' | 'firm';

/** Brush radius in millimetres. Grab uses a wider reach, as the prototype did. */
export const SCULPT_RADIUS: Record<SculptSize, number> = { s: 2.5, m: 4.5, l: 8 };
export const GRAB_RADIUS: Record<SculptSize, number> = { s: 7, m: 12, l: 20 };

/**
 * A sculpt dab for `part` where the finger touched the surface at `hit` (surface pointing along `normal`).
 * The dab is stored in the part's own space, so it moves, turns and resizes with the part.
 * Pull sits just inside the surface (a bump comes out), push just outside (a dent goes in).
 * `part` must be the part as it really is, with a mirrored twin shown mirrored.
 */
export function makeDab(part: Pick<Part, 'id' | 'outline' | 'z' | 'depthMm' | 'rot'>, type: DabType, hit: Vec3, normal: Vec3, radius: number, strength: SculptStrength): Dab {
  const reach = radius * (strength === 'gentle' ? 0.3 : 0.6);
  const push = type === 'push' ? 1 : type === 'pull' ? -1 : 0;
  const centre: Vec3 = [hit[0] + normal[0] * push * (radius - reach), hit[1] + normal[1] * push * (radius - reach), hit[2] + normal[2] * push * (radius - reach)];
  const dab: Dab = {
    partId: part.id,
    type,
    at: worldToLocal(partFrame(part), centre),
    radius,
    strength: type === 'smooth' ? (strength === 'gentle' ? 0.35 : 0.75) : 1,
  };
  if (type === 'grab') dab.drag = [0, 0, 0];
  return dab;
}
