import { BoxGeometry, BufferGeometry, ConeGeometry, Float32BufferAttribute, Group, Line, LineBasicMaterial, LineLoop, Mesh, MeshBasicMaterial } from 'three';
import type { Vec3 } from '../core/geom/vec';
import type { Axis } from './gizmoMath';
import { AXES } from './gizmoMath';

const COLOURS: Record<Axis, number> = { x: 0xe5484d, y: 0x30a46c, z: 0x2563eb };

/**
 * What the move / turn / resize handles look like: three arrows, three rings and one cube.
 * They draw on top of the toy (see Viewport.overlay). Where a finger can grab them is decided in
 * gizmoMath.ts, so this file is only about looks.
 */
export class GizmoView {
  readonly group = new Group();
  private readonly cube: Mesh;

  constructor() {
    for (const axis of ['x', 'y', 'z'] as Axis[]) {
      const colour = COLOURS[axis];
      const a = AXES[axis];

      const shaft = new Line(new BufferGeometry().setFromPoints([]), new LineBasicMaterial({ color: colour, depthTest: false, linewidth: 3 }));
      shaft.geometry.setAttribute('position', new Float32BufferAttribute([0, 0, 0, a[0], a[1], a[2]], 3));
      shaft.renderOrder = 10;
      this.group.add(shaft);

      const tip = new Mesh(new ConeGeometry(0.07, 0.2, 16), new MeshBasicMaterial({ color: colour, depthTest: false }));
      tip.position.set(a[0], a[1], a[2]);
      // the cone points along +y by default: turn it to the axis
      if (axis === 'x') tip.rotation.z = -Math.PI / 2;
      if (axis === 'z') tip.rotation.x = Math.PI / 2;
      tip.renderOrder = 11;
      this.group.add(tip);

      const ring = new LineLoop(new BufferGeometry(), new LineBasicMaterial({ color: colour, depthTest: false, transparent: true, opacity: 0.85 }));
      const pts: number[] = [];
      for (let i = 0; i < 64; i++) {
        const t = (i / 64) * Math.PI * 2;
        const c = Math.cos(t) * 0.72;
        const s = Math.sin(t) * 0.72;
        if (axis === 'x') pts.push(0, c, s);
        else if (axis === 'y') pts.push(c, 0, s);
        else pts.push(c, s, 0);
      }
      ring.geometry.setAttribute('position', new Float32BufferAttribute(pts, 3));
      ring.renderOrder = 10;
      this.group.add(ring);
    }

    this.cube = new Mesh(new BoxGeometry(0.17, 0.17, 0.17), new MeshBasicMaterial({ color: 0xffffff, depthTest: false }));
    this.cube.position.set(-0.42, 0.42, 0.42);
    this.cube.renderOrder = 12;
    this.group.add(this.cube);
    this.group.visible = false;
  }

  /** Put the handles around `centre`, `size` millimetres long. */
  place(centre: Vec3, size: number): void {
    this.group.position.set(centre[0], centre[1], centre[2]);
    this.group.scale.setScalar(size);
  }

  set visible(v: boolean) {
    this.group.visible = v;
  }

  dispose(): void {
    this.group.traverse((o) => {
      const m = o as Mesh;
      m.geometry?.dispose();
      (m.material as { dispose?: () => void } | undefined)?.dispose?.();
    });
  }
}
