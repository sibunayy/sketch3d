import type { Store } from './state';
import { applyMove, applyResize, applyTurn, snapshotPart } from '../core/doc/edit';
import type { PartSnapshot } from '../core/doc/edit';
import { partFrame } from '../core/doc/frame';
import { GRAB_RADIUS, SCULPT_RADIUS, makeDab } from '../core/doc/sculpt';
import { effectiveParts } from '../core/geom/scene';
import type { MeshData } from '../core/geom/surfaceNets';
import type { Vec3 } from '../core/geom/vec';
import { GizmoView } from '../render/gizmo';
import { arrowDelta, hitHandle, ringAngleDeg, scaleFactor } from '../render/gizmoMath';
import type { Axis, HandleHit } from '../render/gizmoMath';
import { cameraBasis, pickPart } from '../render/picking';
import type { Ray } from '../render/picking';
import { FOV_DEG } from '../render/viewport';
import type { Viewport, ViewportInteraction } from '../render/viewport';

/** The gizmo is this big on screen, as a share of the camera distance. */
const GIZMO_SIZE = 0.17;

type Drag =
  | { kind: 'move'; axis: Axis; snap: PartSnapshot; id: string; start: Ray; origin: Vec3 }
  | { kind: 'turn'; axis: Axis; snap: PartSnapshot; id: string; start: Ray; centre: Vec3 }
  | { kind: 'resize'; snap: PartSnapshot; id: string; centre2: [number, number]; start2: [number, number] };

/**
 * Connects the 3D view to the toy: tapping picks a part, the gizmo moves, turns and resizes it,
 * sculpting adds dabs, and painting colours parts. Every drag is one undo step.
 */
export class Edit3D implements ViewportInteraction {
  private readonly gizmo = new GizmoView();
  private drag: Drag | null = null;
  private stroke: { type: 'sculpt' | 'paint'; lastAt: Vec3 | null; grab: { dabIndex: number; hit: Vec3; part: string } | null; added: number } | null = null;
  /** Which handle family was grabbed last: the gizmo starts out on Move. */
  active: 'move' | 'turn' | 'resize' = 'move';

  constructor(
    private readonly viewport: Viewport,
    private readonly store: Store,
    private readonly getMesh: () => MeshData | null,
  ) {
    viewport.overlay.add(this.gizmo.group);
    viewport.interaction = this;
    viewport.onBeforeDraw(() => this.placeGizmo());
  }

  /** Whether the gizmo is on show: one part picked, and not sculpting or painting. */
  get gizmoVisible(): boolean {
    return this.store.mode3d.value === 'view' && this.store.selection.value.size === 1;
  }

  refresh(): void {
    this.placeGizmo();
    this.viewport.requestRender();
  }

  dispose(): void {
    this.viewport.interaction = null;
    this.viewport.overlay.remove(this.gizmo.group);
    this.gizmo.dispose();
  }

  // ---------- gizmo placement ----------

  private selectedCentre(): Vec3 | null {
    const doc = this.store.doc.value;
    const id = [...this.store.selection.value][0];
    const part = effectiveParts(doc).find((p) => p.id === id);
    return part ? partFrame(part).origin : null;
  }

  private placeGizmo(): void {
    const centre = this.selectedCentre();
    const show = this.gizmoVisible && centre !== null;
    this.gizmo.visible = show;
    if (show && centre) this.gizmo.place(centre, this.viewport.camera.distance * GIZMO_SIZE);
  }

  // ---------- pointer handling ----------

  down(e: PointerEvent): boolean {
    const mode = this.store.mode3d.value;
    if (mode === 'view') return this.downView(e);
    const hit = this.hitMesh(e);
    if (!hit) return false; // nothing under the finger: the camera turns instead
    if (mode === 'paint') {
      this.stroke = { type: 'paint', lastAt: null, grab: null, added: 0 };
      this.paintAt(hit.partIndex);
      return true;
    }
    return this.startSculpt(hit);
  }

  move(e: PointerEvent): void {
    if (this.drag) {
      this.moveHandle(e);
      return;
    }
    if (!this.stroke) return;
    const hit = this.hitMesh(e);
    if (this.stroke.type === 'paint') {
      if (hit) this.paintAt(hit.partIndex);
    } else {
      this.moveSculpt(e, hit);
    }
  }

  up(): void {
    if (this.drag) {
      const label = this.drag.kind === 'move' ? 'Move' : this.drag.kind === 'turn' ? 'Turn' : 'Resize';
      this.store.commitPreview(label);
      this.drag = null;
      this.gizmo.setActive(null);
    } else if (this.stroke) {
      if (this.stroke.added > 0 || this.stroke.grab) this.store.commitPreview(this.stroke.type === 'paint' ? 'Paint' : 'Sculpt');
      this.stroke = null;
    }
    this.refresh();
  }

  tap(e: PointerEvent): void {
    if (this.store.mode3d.value === 'paint' || this.store.mode3d.value === 'sculpt') return;
    const hit = this.hitMesh(e);
    const id = hit ? this.store.doc.value.parts[hit.partIndex]?.id : undefined;
    if (id) this.store.select([id], e.shiftKey || this.store.multi.value);
    else if (!(e.shiftKey || this.store.multi.value)) this.store.select([]);
  }

  private hitMesh(e: PointerEvent) {
    const mesh = this.getMesh();
    return mesh ? pickPart(mesh, this.viewport.rayAt(e.clientX, e.clientY)) : null;
  }

  // ---------- move, turn, resize ----------

  private downView(e: PointerEvent): boolean {
    if (!this.gizmoVisible) return false;
    const centre = this.selectedCentre();
    const id = [...this.store.selection.value][0];
    if (!centre || !id) return false;
    const { width, height } = this.viewport.size;
    const r = this.viewport.canvasRect();
    const hit: HandleHit | null = hitHandle(this.viewport.camera, FOV_DEG, width / height, width, height, centre, this.viewport.camera.distance * GIZMO_SIZE, [e.clientX - r.left, e.clientY - r.top]);
    if (!hit) return false;
    const snap = snapshotPart(this.store.doc.value, id);
    if (!snap) return false;
    const start = this.viewport.rayAt(e.clientX, e.clientY);
    if (hit.kind === 'move') this.drag = { kind: 'move', axis: hit.axis, snap, id, start, origin: centre };
    else if (hit.kind === 'turn') this.drag = { kind: 'turn', axis: hit.axis, snap, id, start, centre };
    else {
      const c2 = this.viewport.screenOf(centre) ?? [r.left, r.top];
      this.drag = { kind: 'resize', snap, id, centre2: c2, start2: [e.clientX, e.clientY] };
    }
    this.active = hit.kind;
    this.gizmo.setActive(hit.kind === 'resize' ? 'resize' : `${hit.kind}:${hit.axis}`);
    return true;
  }

  private moveHandle(e: PointerEvent): void {
    const d = this.drag;
    if (!d) return;
    if (d.kind === 'move') {
      const now = this.viewport.rayAt(e.clientX, e.clientY);
      const amount = arrowDelta(d.origin, d.axis, d.start, now);
      this.store.preview((doc) => applyMove(doc, d.id, d.axis, amount, d.snap));
    } else if (d.kind === 'turn') {
      const now = this.viewport.rayAt(e.clientX, e.clientY);
      const deg = ringAngleDeg(d.centre, d.axis, d.start, now);
      this.store.preview((doc) => applyTurn(doc, d.id, d.axis, deg, d.snap.rot));
    } else {
      const k = scaleFactor(d.centre2, d.start2, [e.clientX, e.clientY]);
      this.store.preview((doc) => applyResize(doc, d.id, k, d.snap));
    }
  }

  // ---------- paint ----------

  private paintAt(partIndex: number): void {
    const id = this.store.doc.value.parts[partIndex]?.id;
    if (!id || !this.stroke) return;
    const colour = this.store.paintColour.value;
    if (this.store.doc.value.parts[partIndex].color === colour) return;
    this.store.preview((doc) => {
      const p = doc.parts.find((q) => q.id === id);
      if (p) p.color = colour;
    });
    this.stroke.added++;
  }

  // ---------- sculpt ----------

  private startSculpt(hit: { partIndex: number; point: Vec3; normal: Vec3 }): boolean {
    const store = this.store;
    const part = effectiveParts(store.doc.value)[hit.partIndex];
    if (!part || part.cut) return false;
    const type = store.sculptTool.value;
    this.stroke = { type: 'sculpt', lastAt: hit.point, grab: null, added: 0 };
    const radius = (type === 'grab' ? GRAB_RADIUS : SCULPT_RADIUS)[store.sculptSize.value];
    const dab = makeDab(part, type, hit.point, hit.normal, radius, store.sculptStrength.value);
    let index = -1;
    store.preview((doc) => {
      doc.dabs.push(dab);
      index = doc.dabs.length - 1;
    });
    if (type === 'grab') this.stroke.grab = { dabIndex: index, hit: hit.point, part: part.id };
    else this.stroke.added++;
    return true;
  }

  private moveSculpt(e: PointerEvent, hit: { partIndex: number; point: Vec3; normal: Vec3 } | null): void {
    const st = this.stroke;
    if (!st) return;
    const store = this.store;
    if (st.grab) {
      // drag the surface along with the finger, in the plane facing the camera
      const g = st.grab;
      const cam = this.viewport.camera;
      const { right, up } = cameraBasis(cam);
      const r = this.viewport.canvasRect();
      const ray = this.viewport.rayAt(e.clientX, e.clientY);
      const depth = Math.hypot(g.hit[0] - ray.origin[0], g.hit[1] - ray.origin[1], g.hit[2] - ray.origin[2]);
      const centreScreen = this.viewport.screenOf(g.hit);
      if (!centreScreen) return;
      const mmPerPx = (2 * depth * Math.tan((FOV_DEG * Math.PI) / 360)) / r.height;
      const dx = (e.clientX - centreScreen[0]) * mmPerPx;
      const dy = -(e.clientY - centreScreen[1]) * mmPerPx;
      const world: Vec3 = [right[0] * dx + up[0] * dy, right[1] * dx + up[1] * dy, right[2] * dx + up[2] * dy];
      const part = effectiveParts(store.doc.value).find((p) => p.id === g.part);
      if (!part) return;
      const frame = partFrame(part);
      store.preview((doc) => {
        // keep earlier dabs; only the grab changes as the finger moves
        const base = doc.dabs[g.dabIndex];
        if (!base) return;
        const rot = frame.rot;
        const lx = rot[0] * world[0] + rot[3] * world[1] + rot[6] * world[2];
        const ly = rot[1] * world[0] + rot[4] * world[1] + rot[7] * world[2];
        const lz = rot[2] * world[0] + rot[5] * world[1] + rot[8] * world[2];
        base.drag = [lx / frame.size[0], ly / frame.size[1], lz / frame.size[2]];
      });
      return;
    }
    if (!hit || !st.lastAt) return;
    const type = store.sculptTool.value;
    const radius = SCULPT_RADIUS[store.sculptSize.value];
    const gap = Math.hypot(hit.point[0] - st.lastAt[0], hit.point[1] - st.lastAt[1], hit.point[2] - st.lastAt[2]);
    if (gap < radius * 0.6) return; // dabs are spaced along the stroke, not piled up
    const part = effectiveParts(store.doc.value)[hit.partIndex];
    if (!part || part.cut || store.doc.value.dabs.length >= 6000) return;
    const dab = makeDab(part, type, hit.point, hit.normal, radius, store.sculptStrength.value);
    store.preview((doc) => void doc.dabs.push(dab));
    st.lastAt = hit.point;
    st.added++;
  }
}

