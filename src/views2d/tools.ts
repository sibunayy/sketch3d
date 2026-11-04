import type { Store } from '../app/state';
import { hitTest, limbOutline, newPart, smileOutline } from '../core/doc/partOps';
import type { Doc, Part, PartKind } from '../core/doc/types';
import { bbox } from '../core/geom/bounds';
import { strokeToOutline } from '../core/geom/outline';
import { profileFromLoop } from '../core/geom/profile';
import { effectiveParts } from '../core/geom/scene';
import { SHAPES } from '../core/geom/shapes';
import type { ShapeName } from '../core/geom/shapes';
import type { Vec2, Vec3 } from '../core/geom/vec';
import { copy } from '../ui/copy';
import { TAP_PX, isTap } from './gestures';
import type { ViewTransform } from './viewTransform';

export type View2D = 'front' | 'side';

/** A pointer position in both spaces. `at` is in the view's own millimetres: (x, y) in Front, (z, y) in Side. */
export interface ToolPointer {
  at: Vec2;
  screen: Vec2;
  view: View2D;
  /** Shift held, or the Multi button on. */
  additive: boolean;
}

export interface Tool {
  hint: string;
  down(e: ToolPointer): void;
  move(e: ToolPointer): void;
  up(e: ToolPointer): void;
  /** Drop what is in progress without changing the toy (a second finger landed, or the pointer was lost). */
  cancel(): void;
  /** Draws feedback for what is in progress. */
  paint?(ctx: CanvasRenderingContext2D, vt: ViewTransform): void;
}

const DARK = '#1f2937';
const dist = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
const round1 = (v: number) => Math.round(v * 10) / 10;

// ---------- helpers shared by the tools ----------

/** With symmetry on, a twin is only a mirror image: edits go to the part it follows. */
function editTarget(doc: Doc, id: string): { id: string; mirrored: boolean } | null {
  const p = doc.parts.find((q) => q.id === id);
  if (!p) return null;
  return doc.settings.symmetry && p.twinOf ? { id: p.twinOf, mirrored: true } : { id, mirrored: false };
}

function selectedTargets(store: Store): { id: string; mirrored: boolean }[] {
  const out = new Map<string, { id: string; mirrored: boolean }>();
  for (const id of store.selection.value) {
    const t = editTarget(store.doc.value, id);
    if (t && !out.has(t.id)) out.set(t.id, t);
  }
  return [...out.values()];
}

function pickFirst(store: Store): { id: string; mirrored: boolean } | null {
  const [t] = selectedTargets(store);
  if (!t) store.toast(copy.toastPickFirst);
  return t ?? null;
}

/** The middle of a part as drawn in this view. */
function centreOf(part: Part, view: View2D): Vec2 {
  const b = bbox(part.outline);
  return view === 'front' ? [b.cx, b.cy] : [part.z, b.cy];
}

function strokePath(ctx: CanvasRenderingContext2D, vt: ViewTransform, pts: readonly Vec2[], colour: string, closed = false) {
  if (pts.length < 2) return;
  ctx.save();
  ctx.strokeStyle = colour;
  ctx.lineWidth = 3;
  ctx.lineJoin = 'round';
  ctx.lineCap = 'round';
  ctx.beginPath();
  pts.forEach((p, i) => {
    const [x, y] = vt.worldToScreen(p);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  if (closed) ctx.closePath();
  ctx.stroke();
  ctx.restore();
}

// ---------- Pick and move ----------

function selectTool(store: Store): Tool {
  type Orig = { outline: Vec2[]; z: number };
  let drag: { targets: { id: string; mirrored: boolean }[]; orig: Map<string, Orig>; start: Vec2; startScreen: Vec2; moved: boolean; view: View2D } | null = null;

  return {
    hint: copy.hintSelect,
    down(e) {
      const hit = hitTest(store.doc.value, e.view, e.at);
      const additive = e.additive || store.multi.value;
      if (hit) {
        if (additive) store.select([hit], true);
        else if (!store.selection.value.has(hit)) store.select([hit]);
      } else if (!additive) {
        store.select([]);
      }
      if (!hit || !store.selection.value.has(hit)) {
        drag = null;
        return;
      }
      const targets = selectedTargets(store);
      const orig = new Map<string, Orig>();
      for (const t of targets) {
        const p = store.doc.value.parts.find((q) => q.id === t.id);
        if (p) orig.set(t.id, { outline: p.outline.map((q) => [...q] as Vec2), z: p.z });
      }
      drag = { targets, orig, start: e.at, startScreen: e.screen, moved: false, view: e.view };
    },
    move(e) {
      if (!drag) return;
      if (!drag.moved && dist(e.screen, drag.startScreen) < TAP_PX) return;
      drag.moved = true;
      const dx = e.at[0] - drag.start[0];
      const dy = e.at[1] - drag.start[1];
      const d = drag;
      store.preview((draft) => {
        for (const t of d.targets) {
          const p = draft.parts.find((q) => q.id === t.id);
          const o = d.orig.get(t.id);
          if (!p || !o) continue;
          if (d.view === 'front') {
            const sx = t.mirrored ? -1 : 1; // a mirror image moves the other way sideways
            p.outline = o.outline.map(([x, y]): Vec2 => [round1(x + dx * sx), round1(y + dy)]);
          } else {
            p.z = round1(o.z + dx); // in the Side view, across is depth
            p.outline = o.outline.map(([x, y]): Vec2 => [x, round1(y + dy)]);
          }
        }
      });
    },
    up() {
      if (drag?.moved) store.commitPreview('Move');
      drag = null;
    },
    cancel() {
      if (drag?.moved) store.cancelPreview();
      drag = null;
    },
  };
}

// ---------- Draw ----------

function drawTool(store: Store, redraw: () => void): Tool {
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

function shapeTool(store: Store, redraw: () => void, name: ShapeName, cut: boolean): Tool {
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

function limbTool(store: Store, redraw: () => void): Tool {
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

function stampTool(store: Store, kind: 'eyes' | 'smile'): Tool {
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

function creaseTool(store: Store, redraw: () => void): Tool {
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

function eraseTool(store: Store): Tool {
  return {
    hint: copy.hintErase,
    down() {},
    move() {},
    up(e) {
      const hit = hitTest(store.doc.value, e.view, e.at);
      if (!hit) return;
      const ok = store.commit('Delete a part', (d) => {
        const gone = new Set([hit]);
        for (const p of d.parts) if (p.twinOf === hit) gone.add(p.id);
        d.parts = d.parts.filter((p) => !gone.has(p.id));
        d.dabs = d.dabs.filter((x) => !gone.has(x.partId));
      });
      if (ok) store.toast(copy.toastDeleted, { label: copy.btnUndo, run: store.undo });
    },
    cancel() {},
  };
}

// ---------- Size, Turn, Reshape ----------

function sizeTool(store: Store): Tool {
  let s: { id: string; centre: Vec2; d0: number; outline: Vec2[]; depth: number; cx: number; cy: number; moved: boolean } | null = null;
  return {
    hint: copy.hintSize,
    down(e) {
      const t = pickFirst(store);
      const p = t && store.doc.value.parts.find((q) => q.id === t.id);
      if (!t || !p) return;
      const b = bbox(p.outline);
      const centre = centreOf(p, e.view);
      s = { id: t.id, centre, d0: Math.max(dist(e.at, centre), 1), outline: p.outline.map((q) => [...q] as Vec2), depth: p.depthMm, cx: b.cx, cy: b.cy, moved: false };
    },
    move(e) {
      if (!s) return;
      const k = Math.min(5, Math.max(0.2, dist(e.at, s.centre) / s.d0));
      s.moved = true;
      const o = s;
      store.preview((d) => {
        const p = d.parts.find((q) => q.id === o.id);
        if (!p) return;
        p.outline = o.outline.map(([x, y]): Vec2 => [round1(o.cx + (x - o.cx) * k), round1(o.cy + (y - o.cy) * k)]);
        p.depthMm = Math.min(200, Math.max(1, round1(o.depth * k)));
      });
    },
    up() {
      if (s?.moved) store.commitPreview('Resize');
      s = null;
    },
    cancel() {
      if (s?.moved) store.cancelPreview();
      s = null;
    },
  };
}

function turnTool(store: Store): Tool {
  let s: { id: string; mirrored: boolean; centre: Vec2; a0: number; base: { x: number; y: number; z: number }; view: View2D; moved: boolean } | null = null;
  return {
    hint: copy.hintTurn,
    down(e) {
      const t = pickFirst(store);
      const p = t && store.doc.value.parts.find((q) => q.id === t.id);
      if (!t || !p) return;
      const centre = centreOf(p, e.view);
      s = { id: t.id, mirrored: t.mirrored, centre, a0: Math.atan2(e.at[1] - centre[1], e.at[0] - centre[0]), base: { ...p.rot }, view: e.view, moved: false };
    },
    move(e) {
      if (!s) return;
      const o = s;
      const deg = ((Math.atan2(e.at[1] - o.centre[1], e.at[0] - o.centre[0]) - o.a0) * 180) / Math.PI;
      o.moved = true;
      store.preview((d) => {
        const p = d.parts.find((q) => q.id === o.id);
        if (!p) return;
        const flip = o.mirrored && o.view === 'front' ? -1 : 1;
        if (o.view === 'front') p.rot = { ...o.base, z: round1(o.base.z + deg * flip) };
        else p.rot = { ...o.base, x: round1(o.base.x - deg) };
      });
    },
    up() {
      if (s?.moved) store.commitPreview('Turn');
      s = null;
    },
    cancel() {
      if (s?.moved) store.cancelPreview();
      s = null;
    },
  };
}

function reshapeTool(store: Store): Tool {
  let s: { id: string; mirrored: boolean; index: number; start: Vec2; outline: Vec2[]; moved: boolean } | null = null;
  const SPREAD = 6; // how many neighbouring points follow
  return {
    hint: copy.hintReshape,
    down(e) {
      if (e.view !== 'front') {
        store.toast(copy.toastFrontOnly);
        return;
      }
      const t = pickFirst(store);
      if (!t) return;
      const doc = store.doc.value;
      const shown = effectiveParts(doc).find((p) => p.id === [...store.selection.value][0]);
      const source = doc.parts.find((p) => p.id === t.id);
      if (!shown || !source) return;
      // find the nearest point of the outline as it is drawn
      let best = -1;
      let bestD = Infinity;
      shown.outline.forEach((q, i) => {
        const d = dist(q, e.at);
        if (d < bestD) {
          bestD = d;
          best = i;
        }
      });
      // a mirrored twin shows the source backwards, so the same point has the opposite index
      const index = t.mirrored ? source.outline.length - 1 - best : best;
      s = { id: t.id, mirrored: t.mirrored, index, start: e.at, outline: source.outline.map((q) => [...q] as Vec2), moved: false };
    },
    move(e) {
      if (!s) return;
      const o = s;
      o.moved = true;
      const dx = (e.at[0] - o.start[0]) * (o.mirrored ? -1 : 1);
      const dy = e.at[1] - o.start[1];
      const n = o.outline.length;
      store.preview((d) => {
        const p = d.parts.find((q) => q.id === o.id);
        if (!p) return;
        p.outline = o.outline.map((q, i): Vec2 => {
          const gap = Math.min(Math.abs(i - o.index), n - Math.abs(i - o.index));
          if (gap > SPREAD) return q;
          const w = 0.5 * (1 + Math.cos((Math.PI * gap) / (SPREAD + 1)));
          return [round1(q[0] + dx * w), round1(q[1] + dy * w)];
        });
      });
    },
    up() {
      if (s?.moved) store.commitPreview('Reshape');
      s = null;
    },
    cancel() {
      if (s?.moved) store.cancelPreview();
      s = null;
    },
  };
}

// ---------- registry ----------

export const SHAPE_NAMES: ShapeName[] = ['circle', 'box', 'star', 'heart', 'egg', 'capsule', 'triangle', 'drop', 'moon'];

/** Makes the tool for a tool id from the toolbar. `redraw` asks the canvas to draw again. */
export function createTool(id: string, store: Store, redraw: () => void): Tool {
  if (id.startsWith('shape:')) return shapeTool(store, redraw, id.slice(6) as ShapeName, false);
  if (id === 'hole:circle') return shapeTool(store, redraw, 'circle', true);
  if (id === 'hole:box') return shapeTool(store, redraw, 'box', true);
  switch (id) {
    case 'draw':
      return drawTool(store, redraw);
    case 'limb':
      return limbTool(store, redraw);
    case 'eyes':
      return stampTool(store, 'eyes');
    case 'smile':
      return stampTool(store, 'smile');
    case 'crease':
      return creaseTool(store, redraw);
    case 'erase':
      return eraseTool(store);
    case 'size':
      return sizeTool(store);
    case 'turn':
      return turnTool(store);
    case 'reshape':
      return reshapeTool(store);
    default:
      return selectTool(store);
  }
}

