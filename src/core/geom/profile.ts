import { PROFILE_MAX, PROFILE_SAMPLES } from '../doc/types';
import type { SideProfile } from '../doc/types';
import { catmullRom, clamp } from './vec';
import type { Vec2 } from './vec';

/** The thinnest a part may get at any height, in units of half the depth (front minus back). */
export const PROF_MIN = 0.14;

/**
 * Builds a side profile from a loop drawn around the part as seen from the side.
 * The loop's points are (z, y): z is measured from the middle of the part, y is height.
 * `yRange` is the part's bottom and top (default: the loop's own bottom and top).
 * Returns null if the loop does not cross the part's height.
 */
export function profileFromLoop(loop: readonly Vec2[], depthMm: number, yRange?: readonly [number, number]): SideProfile | null {
  if (loop.length < 3) return null;
  let y0: number;
  let y1: number;
  if (yRange) {
    [y0, y1] = yRange;
  } else {
    y0 = Infinity;
    y1 = -Infinity;
    for (const [, y] of loop) {
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  const hD = Math.max(depthMm / 2, 1e-6);
  const F: (number | null)[] = [];
  const B: (number | null)[] = [];
  for (let i = 0; i < PROFILE_SAMPLES; i++) {
    const y = y0 + ((y1 - y0) * i) / (PROFILE_SAMPLES - 1);
    let hi = -Infinity;
    let lo = Infinity;
    let crossings = 0;
    for (let k = 0; k < loop.length; k++) {
      const a = loop[k];
      const c = loop[(k + 1) % loop.length];
      if (a[1] <= y !== c[1] <= y) {
        const z = a[0] + ((y - a[1]) * (c[0] - a[0])) / (c[1] - a[1]);
        if (z > hi) hi = z;
        if (z < lo) lo = z;
        crossings++;
      }
    }
    if (crossings >= 2) {
      F.push(hi);
      B.push(lo);
    } else {
      F.push(null);
      B.push(null);
    }
  }
  if (F.every((v) => v === null)) return null;

  // heights the loop does not reach take the nearest value above or below
  const fill = (a: (number | null)[]) => {
    let last: number | null = null;
    for (let i = 0; i < a.length; i++) {
      if (a[i] !== null) last = a[i];
      else if (last !== null) a[i] = last;
    }
    last = null;
    for (let i = a.length - 1; i >= 0; i--) {
      if (a[i] !== null) last = a[i];
      else a[i] = last;
    }
  };
  fill(F);
  fill(B);

  const front: number[] = [];
  const back: number[] = [];
  for (let i = 0; i < PROFILE_SAMPLES; i++) {
    let fv = clamp((F[i] as number) / hD, -PROFILE_MAX, PROFILE_MAX);
    let bv = clamp((B[i] as number) / hD, -PROFILE_MAX, PROFILE_MAX);
    if (fv - bv < PROF_MIN) {
      const c = (fv + bv) / 2;
      fv = c + PROF_MIN / 2;
      bv = c - PROF_MIN / 2;
    }
    front.push(fv);
    back.push(bv);
  }
  return { front, back };
}

/** Front and back at a height from 0 (bottom of the part) to 1 (top), smoothly interpolated. */
export function profileAt(p: SideProfile, y01: number): { front: number; back: number } {
  return { front: catmullRom(p.front, y01), back: catmullRom(p.back, y01) };
}
