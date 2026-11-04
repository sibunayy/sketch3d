// Tools that make new things: draw, shapes, limbs, eyes and smile, creases.
import type { Store } from '../app/state';
import { hitTest, limbOutline, newPart, smileOutline } from '../core/doc/partOps';
import type { Part, PartKind } from '../core/doc/types';
import { bbox } from '../core/geom/bounds';
import { strokeToOutline } from '../core/geom/outline';
import { profileFromLoop } from '../core/geom/profile';
import { effectiveParts } from '../core/geom/scene';
import { SHAPES } from '../core/geom/shapes';
import type { ShapeName } from '../core/geom/shapes';
import type { Vec2, Vec3 } from '../core/geom/vec';
import { copy } from '../ui/copy';
import { TAP_PX, isTap } from './gestures';
import type { Tool } from './toolKit';
import { DARK, dist, round1, pickFirst, strokePath } from './toolKit';

export function drawTool(store: Store, redraw: () => void): Tool {
  let pts: Vec2[] = [];
  let screenPts: Vec2[] = [];
  return {
    hint: copy.hintDraw,
    down(e) {
      pts = [e.at];
      screenPts = [e.screen];
    },
    move(e) {
      if (!pts.length) return;
      pts.push(e.at);
      screenPts.push(e.screen);
      redraw();
    },
    up(e) {
      const stroke = pts;
      const onScreen = screenPts;
      pts = [];
      screenPts = [];
      redraw();
      if (stroke.length === 0 || isTap(onScreen)) return; // a tap is not a shape
      const result = strokeToOutline(stroke);
      if (!result) {
        store.toast(copy.scribble);
        return;
      }
      if (e.view === 'front') {
        let id = '';
        const ok = store.commit('Draw a shape', (d) => {
          const p = newPart(d, { kind: 'draw', outline: result.outline });
          d.parts.push(p);
          id = p.id;
        });
        if (ok) {
          store.select([id]);
          if (result.untwisted) store.toast(copy.untwisted);
        }
        return;
      }
      // Side view: the loop is the part's shape seen from the side
      const target = pickFirst(store);
      if (!target) return;
      const part = store.doc.value.parts.find((p) => p.id === target.id);
      if (!part) return;
      const b = bbox(part.outline);
      const profile = profileFromLoop(
        result.outline.map(([z, y]): Vec2 => [z - part.z, y]),
        part.depthMm,
        [b.y0, b.y1],
      );
      if (!profile) {
        store.toast(copy.toastSideLoop);
        return;
      }
      store.commit('Change side shape', (d) => {
        const p = d.parts.find((q) => q.id === target.id);
        if (p) p.profile = profile;
      });
      store.toast(copy.toastSideUpdated);
    },
    cancel() {
      pts = [];
      screenPts = [];
      redraw();
    },
    paint: (ctx, vt) => strokePath(ctx, vt, pts, '#2154c9'),
  };
}

// ---------- Shapes and holes ----------

export function shapeTool(store: Store, redraw: () => void, name: ShapeName, cut: boolean): Tool {
  let start: Vec2 | null = null;
  let current: Vec2 | null = null;
  let startScreen: Vec2 = [0, 0];

  const box = (): [number, number, number, number] | null => {
    if (!start || !current) return null;
    return [Math.min(start[0], current[0]), Math.min(start[1], current[1]), Math.max(start[0], current[0]), Math.max(start[1], current[1])];
  };

  return {
    hint: cut ? copy.hintHole : copy.hintShape,
    down(e) {
      start = e.at;
      current = e.at;
      startScreen = e.screen;
    },
    move(e) {
      current = e.at;
      redraw();
    },
    up(e) {
      const dragged = start && dist(e.screen, startScreen) >= TAP_PX;
      let [a0, b0, a1, b1] = box() ?? [e.at[0], e.at[1], e.at[0], e.at[1]];
      const view = e.view;
      start = current = null;
      redraw();
      if (!dragged) {
        // a tap places a ready-made size
        const w = cut ? (name === 'box' ? 30 : 14) : name === 'box' ? 36 : 28;
        const h = cut ? (name === 'box' ? 10 : 14) : name === 'box' ? 24 : 28;
        a0 = e.at[0] - w / 2;
        a1 = e.at[0] + w / 2;
        b0 = e.at[1] - h / 2;
        b1 = e.at[1] + h / 2;
      }
      if (a1 - a0 < 3 || b1 - b0 < 3) return;
      let id = '';
      const kind: PartKind = cut ? (name === 'box' ? 'box' : 'circle') : name;
      store.commit(cut ? 'Cut a hole' : 'Add a shape', (d) => {
        let p: Part;
        if (view === 'front') {
          p = newPart(d, { kind, outline: SHAPES[name](a0, b0, a1, b1), cut });
        } else {
          // seen from the side the drag gives depth across and height up
          const wide = Math.min(b1 - b0, 24);
          p = newPart(d, { kind, outline: SHAPES[name](-wide / 2, b0, wide / 2, b1), cut, z: round1((a0 + a1) / 2), depthMm: cut ? 80 : Math.max(8, a1 - a0) });
        }
        d.parts.push(p);
        id = p.id;
      });
      if (id) store.select([id]);
    },
    cancel() {
      start = current = null;
      redraw();
    },
    paint(ctx, vt) {
      const b = box();
      if (b) strokePath(ctx, vt, [[b[0], b[1]], [b[2], b[1]], [b[2], b[3]], [b[0], b[3]]], cut ? '#b42318' : '#2154c9', true);
    },
  };
}

// ---------- Tail or arm ----------

export function limbTool(store: Store, redraw: () => void): Tool {
  let pts: Vec2[] = [];
  let screenPts: Vec2[] = [];
  return {
    hint: copy.hintLimb,
    down(e) {
      pts = [e.at];
      screenPts = [e.screen];
    },
    move(e) {
      pts.push(e.at);
      screenPts.push(e.screen);
      redraw();
    },
    up(e) {
      const line = pts;
      const onScreen = screenPts;
      pts = [];
      screenPts = [];
      redraw();
      let length = 0;
      for (let i = 1; i < line.length; i++) length += dist(line[i - 1], line[i]);
      if (isTap(onScreen) || length < 8) {
        store.toast(copy.toastLongerLine);
        return;
      }
      let id = '';
      if (e.view === 'front') {
        store.commit('Add a tail or arm', (d) => {
          const p = newPart(d, { kind: 'limb', outline: limbOutline(line, 3.5) });
          d.parts.push(p);
          id = p.id;
        });
      } else {
        // the line is (depth, height): a thin part standing at the line's height, as deep as the line is long
        const ys = line.map((q) => q[1]);
        const zs = line.map((q) => q[0]);
        const y0 = Math.min(...ys);
        const y1 = Math.max(...ys);
        store.commit('Add a tail or arm', (d) => {
          const p = newPart(d, {
            kind: 'limb',
            outline: SHAPES.capsule(-4, y0, 4, Math.max(y1, y0 + 8)),
            z: round1((Math.min(...zs) + Math.max(...zs)) / 2),
            depthMm: Math.max(8, Math.max(...zs) - Math.min(...zs)),
          });
          d.parts.push(p);
          id = p.id;
        });
      }
      if (id) store.select([id]); // the view stays as it was
    },
    cancel() {
      pts = [];
      screenPts = [];
      redraw();
    },
    paint: (ctx, vt) => strokePath(ctx, vt, pts, '#6e56cf'),
  };
}

// ---------- Eyes and smile ----------

export function stampTool(store: Store, kind: 'eyes' | 'smile'): Tool {
  return {
    hint: kind === 'eyes' ? copy.hintEyes : copy.hintSmile,
    down() {},
    move() {},
    up(e) {
      if (e.view !== 'front') {
        store.toast(copy.toastFrontOnly);
        return;
      }
      const [x, y] = e.at;
      let id = '';
      store.commit(kind === 'eyes' ? 'Add eyes' : 'Add a smile', (d) => {
        if (kind === 'smile') {
          const p = newPart(d, { kind: 'smile', outline: smileOutline(x, y, 16), color: DARK, depthMm: 6, round: 0.8 });
          d.parts.push(p);
          id = p.id;
          return;
        }
        const eye = (cx: number) => newPart(d, { kind: 'eyes', outline: SHAPES.circle(cx - 4.5, y - 4.5, cx + 4.5, y + 4.5), color: DARK, depthMm: 8, round: 1 });
        const first = eye(x);
        d.parts.push(first);
        id = first.id;
        if (d.settings.symmetry && Math.abs(x) > 2) {
          const second = eye(-x);
          second.twinOf = first.id; // the other eye follows the first
          d.parts.push(second);
        }
      });
      if (id) store.select([id]);
    },
    cancel() {},
  };
}

// ---------- Crease ----------

export function creaseTool(store: Store, redraw: () => void): Tool {
  let pts: Vec2[] = [];
  let screenPts: Vec2[] = [];
  return {
    hint: copy.hintCrease,
    down(e) {
      pts = [e.at];
      screenPts = [e.screen];
    },
    move(e) {
      pts.push(e.at);
      screenPts.push(e.screen);
      redraw();
    },
    up(e) {
      const line = pts;
      const onScreen = screenPts;
      pts = [];
      screenPts = [];
      redraw();
      if (isTap(onScreen) || line.length < 2) return;
      const doc = store.doc.value;
      // carve into the front of the part under the start of the line
      const hit = hitTest(doc, e.view, line[0]);
      const part = effectiveParts(doc).find((p) => p.id === hit);
      const frontZ = part ? part.z + part.depthMm / 2 : 0;
      const thin = line.filter((_, i) => i % 2 === 0 || i === line.length - 1);
      const points: Vec3[] = thin.map(([a, y]) => (e.view === 'front' ? [a, y, frontZ] : [0, y, a]));
      store.commit('Carve a crease', (d) => {
        d.grooves.push({ points, radius: 1.8, mirror: d.settings.symmetry && e.view === 'front' });
      });
    },
    cancel() {
      pts = [];
      screenPts = [];
      redraw();
    },
    paint: (ctx, vt) => strokePath(ctx, vt, pts, '#b42318'),
  };
}

// ---------- Erase ----------

