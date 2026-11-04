// Types and small helpers shared by the 2D tools (see tools.ts for the list of tools).
import type { Store } from '../app/state';
import type { Doc, Part } from '../core/doc/types';
import { bbox } from '../core/geom/bounds';
import type { Vec2 } from '../core/geom/vec';
import { copy } from '../ui/copy';
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

export const DARK = '#1f2937';
export const dist = (a: Vec2, b: Vec2) => Math.hypot(a[0] - b[0], a[1] - b[1]);
export const round1 = (v: number) => Math.round(v * 10) / 10;

// ---------- helpers shared by the tools ----------

/** With symmetry on, a twin is only a mirror image: edits go to the part it follows. */
export function editTarget(doc: Doc, id: string): { id: string; mirrored: boolean } | null {
  const p = doc.parts.find((q) => q.id === id);
  if (!p) return null;
  return doc.settings.symmetry && p.twinOf ? { id: p.twinOf, mirrored: true } : { id, mirrored: false };
}

export function selectedTargets(store: Store): { id: string; mirrored: boolean }[] {
  const out = new Map<string, { id: string; mirrored: boolean }>();
  for (const id of store.selection.value) {
    const t = editTarget(store.doc.value, id);
    if (t && !out.has(t.id)) out.set(t.id, t);
  }
  return [...out.values()];
}

export function pickFirst(store: Store): { id: string; mirrored: boolean } | null {
  const [t] = selectedTargets(store);
  if (!t) store.toast(copy.toastPickFirst);
  return t ?? null;
}

/** The middle of a part as drawn in this view. */
export function centreOf(part: Part, view: View2D): Vec2 {
  const b = bbox(part.outline);
  return view === 'front' ? [b.cx, b.cy] : [part.z, b.cy];
}

export function strokePath(ctx: CanvasRenderingContext2D, vt: ViewTransform, pts: readonly Vec2[], colour: string, closed = false) {
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
