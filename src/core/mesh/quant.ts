/**
 * How a distance is kept in one signed byte. Close to the skin each step is `step` millimetres, so the skin is placed
 * accurately. Further away (more than 64 steps) each step is 8 times bigger, so the middle of a big shape still
 * reaches far enough.
 */
export const FINE_STEPS = 64;
export const COARSE_FACTOR = 8;

export function quantise(distance: number, step: number): number {
  const a = Math.abs(distance) / step;
  let q = a <= FINE_STEPS ? Math.round(a) : FINE_STEPS + Math.round((a - FINE_STEPS) / COARSE_FACTOR);
  if (q > 127) q = 127;
  return distance < 0 ? -q : q;
}

export function dequantise(q: number, step: number): number {
  const a = Math.abs(q);
  const d = (a <= FINE_STEPS ? a : FINE_STEPS + (a - FINE_STEPS) * COARSE_FACTOR) * step;
  return q < 0 ? -d : d;
}
