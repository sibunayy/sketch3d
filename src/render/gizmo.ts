import { BoxGeometry, ConeGeometry, CylinderGeometry, Group, Mesh, MeshBasicMaterial, TorusGeometry } from 'three';
import type { Vec3 } from '../core/geom/vec';
import type { Axis } from './gizmoMath';
import { AXES } from './gizmoMath';

const COLOURS: Record<Axis, number> = { x: 0xe5484d, y: 0x30a46c, z: 0x2563eb };
/** How see-through each kind of handle is when nothing is held, and when another handle is held. */
const IDLE_OPACITY = { arrow: 1, ring: 0.9, cube: 1 } as const;
const FADED_OPACITY = 0.3;

/** Names a handle, the same way for drawing and for `setActive`: "move:x", "turn:y" or "resize". */
export type HandleKey = `move:${Axis}` | `turn:${Axis}` | 'resize';

/**
 * What the move / turn / resize handles look like: three arrows, three rings and one cube.
 * They are solid (not 1 px lines) so a child can see them on an iPad. They draw on top of the toy
 * (see Viewport.overlay). Where a finger can grab them is decided in gizmoMath.ts, so this file is
 * only about looks.
 */
export class GizmoView {
  readonly group = new Group();
  private readonly pieces: { key: HandleKey; material: MeshBasicMaterial; idle: number }[] = [];

  constructor() {
    for (const axis of ['x', 'y', 'z'] as Axis[]) {
      const colour = COLOURS[axis];
      const a = AXES[axis];

      // the arrow: a shaft and a cone. Cylinders and cones point along +y by default, so turn them to the axis.
      const arrow = this.piece(`move:${axis}`, colour, IDLE_OPACITY.arrow);
      const shaft = new Mesh(new CylinderGeometry(0.035, 0.035, 1, 12), arrow);
      shaft.position.set(a[0] / 2, a[1] / 2, a[2] / 2);
      const tip = new Mesh(new ConeGeometry(0.11, 0.26, 16), arrow);
      tip.position.set(a[0], a[1], a[2]);
      for (const m of [shaft, tip]) {
        if (axis === 'x') m.rotation.z = -Math.PI / 2;
        if (axis === 'z') m.rotation.x = Math.PI / 2;
        m.renderOrder = 11;
        m.userData.handle = `move:${axis}`;
        this.group.add(m);
      }

      // the ring: a thin tube. A torus lies flat in the x-y plane by default, so turn it to face its axis.
      const ring = new Mesh(new TorusGeometry(0.72, 0.026, 8, 64), this.piece(`turn:${axis}`, colour, IDLE_OPACITY.ring));
      if (axis === 'x') ring.rotation.y = Math.PI / 2;
      if (axis === 'y') ring.rotation.x = Math.PI / 2;
      ring.renderOrder = 10;
      ring.userData.handle = `turn:${axis}`;
      this.group.add(ring);
    }

    const cube = new Mesh(new BoxGeometry(0.26, 0.26, 0.26), this.piece('resize', 0xffffff, IDLE_OPACITY.cube));
    cube.position.set(-0.42, 0.42, 0.42);
    cube.renderOrder = 12;
    cube.userData.handle = 'resize';
    this.group.add(cube);
    this.group.visible = false;
  }

  private piece(key: HandleKey, color: number, idle: number): MeshBasicMaterial {
    const material = new MeshBasicMaterial({ color, depthTest: false, transparent: true, opacity: idle });
    this.pieces.push({ key, material, idle });
    return material;
  }

  /** Put the handles around `centre`, `size` millimetres long. */
  place(centre: Vec3, size: number): void {
    this.group.position.set(centre[0], centre[1], centre[2]);
    this.group.scale.setScalar(size);
  }

  /** Light up the handle being held and fade the rest, so it is clear what the finger has hold of. `null` puts everything back. */
  setActive(key: HandleKey | null): void {
    for (const p of this.pieces) p.material.opacity = key === null ? p.idle : p.key === key ? 1 : FADED_OPACITY;
  }

  set visible(v: boolean) {
    this.group.visible = v;
  }

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as Mesh;
      m.geometry?.dispose();
    });
    for (const p of this.pieces) p.material.dispose();
  }
}
