// Tools that change what is already there: pick and move, erase, size, turn, reshape.
import type { Store } from '../app/state';
import { hitTest } from '../core/doc/partOps';
import { bbox } from '../core/geom/bounds';
import { effectiveParts } from '../core/geom/scene';
import type { Vec2 } from '../core/geom/vec';
import { copy } from '../ui/copy';
import { TAP_PX } from './gestures';
import type { View2D, Tool } from './toolKit';
import { dist, round1, selectedTargets, pickFirst, centreOf } from './toolKit';

// ---------- Pick and move ----------

export function selectTool(store: Store): Tool {
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


export function eraseTool(store: Store): Tool {
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

export function sizeTool(store: Store): Tool {
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

export function turnTool(store: Store): Tool {
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

export function reshapeTool(store: Store): Tool {
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
