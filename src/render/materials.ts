import { Color, MeshStandardMaterial, MeshBasicMaterial, DoubleSide } from 'three';

/** The toy: colours come from the vertices, so one material serves every part. */
export function toyMaterial(): MeshStandardMaterial {
  return new MeshStandardMaterial({ vertexColors: true, roughness: 0.55, metalness: 0.0 });
}

/** A see-through copy of the previous shape, shown while a new one is being made. */
export function ghostMaterial(): MeshBasicMaterial {
  return new MeshBasicMaterial({ color: new Color('#6e56cf'), transparent: true, opacity: 0.25, depthWrite: false, side: DoubleSide });
}

const cache = new Map<string, [number, number, number]>();

/** '#e5484d' or '#abc' to red, green, blue from 0 to 1. Anything else is mid grey. */
export function rgb(hex: string): [number, number, number] {
  let c = cache.get(hex);
  if (!c) {
    let h = hex.replace('#', '');
    if (h.length === 3) h = h.split('').map((d) => d + d).join('');
    const n = parseInt(h.slice(0, 6), 16);
    c = Number.isNaN(n) ? [0.53, 0.56, 0.58] : [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
    cache.set(hex, c);
  }
  return c;
}
