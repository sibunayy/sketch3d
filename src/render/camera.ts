import type { Box3 } from '../core/geom/bounds';
import type { Vec3 } from '../core/geom/vec';

export const MIN_DISTANCE = 20;
export const MAX_DISTANCE = 600;
/** Looking straight up or down is allowed to within a few degrees, so the view never flips over. */
export const MAX_ELEVATION = (87 * Math.PI) / 180;

const HOME = { azimuth: (-25 * Math.PI) / 180, elevation: (18 * Math.PI) / 180, distance: 170, target: [0, 28, 0] as Vec3 };

export type CameraPreset = 'front' | 'side' | 'top' | 'home';

/**
 * An orbit camera: it circles a target point. Pure maths, no three.js, so it can be tested anywhere.
 * Azimuth 0 looks from the front (+z) towards the model; y is up.
 */
export class OrbitCamera {
  azimuth = HOME.azimuth;
  elevation = HOME.elevation;
  distance = HOME.distance;
  target: Vec3 = [...HOME.target];

  /** Drag by (dx, dy) screen pixels: turns the model. */
  orbit(dx: number, dy: number): void {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    this.azimuth -= dx * 0.008;
    this.elevation = Math.min(MAX_ELEVATION, Math.max(-MAX_ELEVATION, this.elevation + dy * 0.008));
  }

  /** Slide the view by (dx, dy) screen pixels. */
  pan(dx: number, dy: number): void {
    if (!Number.isFinite(dx) || !Number.isFinite(dy)) return;
    const k = this.distance * 0.0016;
    const cosA = Math.cos(this.azimuth);
    const sinA = Math.sin(this.azimuth);
    // screen right, in the world
    this.target[0] -= dx * k * cosA;
    this.target[2] += dx * k * sinA;
    this.target[1] += dy * k;
  }

  /** factor below 1 zooms in, above 1 zooms out. */
  zoom(factor: number): void {
    if (!Number.isFinite(factor) || factor <= 0) return;
    this.distance = Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, this.distance * factor));
  }

  /** Where the eye is. */
  position(): Vec3 {
    const ce = Math.cos(this.elevation);
    return [
      this.target[0] + this.distance * ce * Math.sin(this.azimuth),
      this.target[1] + this.distance * Math.sin(this.elevation),
      this.target[2] + this.distance * ce * Math.cos(this.azimuth),
    ];
  }

  preset(name: CameraPreset): void {
    if (name === 'home') {
      this.azimuth = HOME.azimuth;
      this.elevation = HOME.elevation;
      this.distance = HOME.distance;
      this.target = [...HOME.target];
      return;
    }
    this.azimuth = name === 'side' ? Math.PI / 2 : 0;
    this.elevation = name === 'top' ? MAX_ELEVATION : 0;
  }

  /** Centre on a box and back off far enough to see all of it. */
  fit(box: Box3): void {
    this.target = [(box.min[0] + box.max[0]) / 2, (box.min[1] + box.max[1]) / 2, (box.min[2] + box.max[2]) / 2];
    const size = Math.max(box.max[0] - box.min[0], box.max[1] - box.min[1], box.max[2] - box.min[2]);
    this.distance = Math.min(MAX_DISTANCE, Math.max(MIN_DISTANCE, size * 2.2));
  }
}
