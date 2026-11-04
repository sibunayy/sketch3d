/** Small vector types and helpers. Units are millimetres, y is up. */

export type Vec2 = [number, number];
export type Vec3 = [number, number, number];

export const clamp = (v: number, lo: number, hi: number): number => (v < lo ? lo : v > hi ? hi : v);

/**
 * Smooth curve through the control values in `a` (Catmull-Rom), with t from 0 to 1.
 * The curve passes through every control value, so t = 0 gives a[0] and t = 1 gives the last one.
 */
export function catmullRom(a: readonly number[], t: number): number {
  const n = a.length;
  if (n === 0) return 0;
  if (n === 1) return a[0];
  t = clamp(t, 0, 1);
  const x = t * (n - 1);
  let i = Math.floor(x);
  if (i >= n - 1) i = n - 2;
  const u = x - i;
  const p0 = a[Math.max(0, i - 1)];
  const p1 = a[i];
  const p2 = a[i + 1];
  const p3 = a[Math.min(n - 1, i + 2)];
  return (
    0.5 *
    (2 * p1 +
      (-p0 + p2) * u +
      (2 * p0 - 5 * p1 + 4 * p2 - p3) * u * u +
      (-p0 + 3 * p1 - 3 * p2 + p3) * u * u * u)
  );
}
