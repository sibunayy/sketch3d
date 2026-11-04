import { useEffect, useMemo, useRef } from 'preact/hooks';
import { latestMesh } from '../app/mesher';
import type { Store } from '../app/state';
import { FrameScheduler } from '../render/frameScheduler';
import { GestureRecogniser } from '../views2d/gestures';
import type { PointerLike } from '../views2d/gestures';
import { BUILD_BOX, buildSilhouette, renderScene } from '../views2d/render2d';
import { createTool } from '../views2d/tools';
import type { ToolPointer, View2D } from '../views2d/tools';
import { ViewTransform } from '../views2d/viewTransform';

const MAX_PIXEL_RATIO = 2;

// each view remembers where it was zoomed and slid to
const transforms: Record<View2D, ViewTransform | null> = { front: null, side: null };

function toLike(e: PointerEvent, canvas: HTMLCanvasElement): PointerLike {
  const r = canvas.getBoundingClientRect();
  return {
    type: e.type as PointerLike['type'],
    pointerId: e.pointerId,
    pointerType: (e.pointerType || 'mouse') as PointerLike['pointerType'],
    x: e.clientX - r.left,
    y: e.clientY - r.top,
    button: e.button,
    time: e.timeStamp,
  };
}

/** The Front or Side drawing. Touch, mouse and pen all take the same path (pointer events). */
export function DrawCanvas({ store, view }: { store: Store; view: View2D }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const redrawRef = useRef<() => void>(() => {});
  const vt = (transforms[view] ??= new ViewTransform());

  // reading the signals here makes the canvas draw again when they change
  const doc = store.doc.value;
  const selection = store.selection.value;
  const toolId = store.tool.value;
  const mesh = latestMesh.value;

  const tool = useMemo(() => createTool(toolId, store, () => redrawRef.current()), [toolId, store, view]);
  const toolRef = useRef(tool);
  toolRef.current = tool;

  const state = useRef({ doc, selection, mesh, view, silhouette: null as HTMLCanvasElement | null, silKey: '' });
  state.current.doc = doc;
  state.current.selection = selection;
  state.current.mesh = mesh;
  state.current.view = view;

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;
    let width = 0;
    let height = 0;
    // until the child zooms or slides the view, keep it fitted as the layout settles
    let touched = false;

    const draw = () => {
      if (width === 0) return;
      const s = state.current;
      const key = `${s.view}|${vt.scale.toFixed(3)}|${vt.ox.toFixed(1)}|${vt.oy.toFixed(1)}|${width}x${height}`;
      const meshChanged = s.silhouette && (s.silhouette as HTMLCanvasElement & { mesh?: unknown }).mesh !== s.mesh;
      if (s.mesh && (s.silKey !== key || meshChanged || !s.silhouette)) {
        s.silhouette = buildSilhouette(s.mesh.mesh, s.view, vt, width, height);
        (s.silhouette as HTMLCanvasElement & { mesh?: unknown }).mesh = s.mesh;
        s.silKey = key;
      }
      renderScene(ctx, vt, width, height, { doc: s.doc, selection: s.selection, view: s.view, silhouette: s.mesh ? s.silhouette : null });
      toolRef.current.paint?.(ctx, vt);
    };
    const frames = new FrameScheduler((cb) => requestAnimationFrame(cb), draw);
    redrawRef.current = () => frames.request();

    const resize = () => {
      const dpr = Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO);
      width = canvas.clientWidth;
      height = canvas.clientHeight;
      if (width === 0 || height === 0) return;
      canvas.width = Math.round(width * dpr);
      canvas.height = Math.round(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      if (!touched) vt.fit(BUILD_BOX, width, height, 28);
      frames.request();
    };
    const watch = new ResizeObserver(resize);
    watch.observe(canvas);
    resize();

    // ---- pointers ----
    const recogniser = new GestureRecogniser();
    const touches = new Map<number, { x: number; y: number }>();
    let mode: ReturnType<GestureRecogniser['feed']> = 'none';
    let lastPan: { x: number; y: number } | null = null;

    const pointer = (e: PointerEvent): ToolPointer => {
      const r = canvas.getBoundingClientRect();
      const screen: [number, number] = [e.clientX - r.left, e.clientY - r.top];
      return { at: vt.screenToWorld(screen), screen, view: state.current.view, additive: e.shiftKey };
    };
    const centre = () => {
      const pts = [...touches.values()];
      return { x: pts.reduce((a, p) => a + p.x, 0) / pts.length, y: pts.reduce((a, p) => a + p.y, 0) / pts.length, d: pts.length > 1 ? Math.hypot(pts[0].x - pts[1].x, pts[0].y - pts[1].y) : 0 };
    };
    let pinch: { x: number; y: number; d: number } | null = null;

    const onDown = (e: PointerEvent) => {
      e.preventDefault();
      canvas.setPointerCapture?.(e.pointerId);
      const like = toLike(e, canvas);
      if (like.pointerType === 'touch') touches.set(e.pointerId, { x: like.x, y: like.y });
      const next = recogniser.feed(like);
      if (recogniser.strokeCancelled) toolRef.current.cancel(); // a second finger landed: drop the stroke
      if (next === 'pinch') pinch = centre();
      if (next === 'pan') lastPan = { x: like.x, y: like.y };
      if (next === 'stroke' && recogniser.activePointerForStroke === e.pointerId) toolRef.current.down(pointer(e));
      mode = next;
    };
    const onMove = (e: PointerEvent) => {
      const like = toLike(e, canvas);
      if (touches.has(e.pointerId)) touches.set(e.pointerId, { x: like.x, y: like.y });
      const next = recogniser.feed(like);
      if (next === 'stroke' && recogniser.activePointerForStroke === e.pointerId) {
        const events = e.getCoalescedEvents?.() ?? [];
        for (const ce of events.length ? events : [e]) toolRef.current.move(pointer(ce));
      } else if (next === 'pinch' && pinch && touches.size >= 2) {
        const c = centre();
        touched = true;
        if (pinch.d > 0 && c.d > 0) vt.zoomAt([c.x, c.y], c.d / pinch.d);
        vt.pan(c.x - pinch.x, c.y - pinch.y);
        pinch = c;
        frames.request();
      } else if (next === 'pan' && lastPan) {
        touched = true;
        vt.pan(like.x - lastPan.x, like.y - lastPan.y);
        lastPan = { x: like.x, y: like.y };
        frames.request();
      }
    };
    const onUp = (e: PointerEvent) => {
      const like = toLike(e, canvas);
      const wasStroker = recogniser.activePointerForStroke === e.pointerId;
      const before = mode;
      touches.delete(e.pointerId);
      const next = recogniser.feed(like);
      if (before === 'stroke' && wasStroker) {
        if (e.type === 'pointercancel' || recogniser.strokeCancelled) toolRef.current.cancel();
        else toolRef.current.up(pointer(e));
      }
      if (next !== 'pinch') pinch = null;
      if (next !== 'pan') lastPan = null;
      mode = next;
    };
    const onWheel = (e: WheelEvent) => {
      e.preventDefault();
      touched = true;
      const r = canvas.getBoundingClientRect();
      vt.zoomAt([e.clientX - r.left, e.clientY - r.top], Math.exp(-e.deltaY * 0.0015));
      frames.request();
    };
    const onContext = (e: Event) => e.preventDefault();

    canvas.addEventListener('pointerdown', onDown);
    canvas.addEventListener('pointermove', onMove);
    canvas.addEventListener('pointerup', onUp);
    canvas.addEventListener('pointercancel', onUp);
    canvas.addEventListener('wheel', onWheel, { passive: false });
    canvas.addEventListener('contextmenu', onContext);
    return () => {
      toolRef.current.cancel();
      frames.cancel();
      watch.disconnect();
      canvas.removeEventListener('pointerdown', onDown);
      canvas.removeEventListener('pointermove', onMove);
      canvas.removeEventListener('pointerup', onUp);
      canvas.removeEventListener('pointercancel', onUp);
      canvas.removeEventListener('wheel', onWheel);
      canvas.removeEventListener('contextmenu', onContext);
    };
  }, [view, vt]);

  // draw again whenever the toy, selection, tool or mesh changed
  useEffect(() => {
    redrawRef.current();
  }, [doc, selection, toolId, mesh, view]);

  return <canvas ref={canvasRef} class="draw-canvas" aria-label={view === 'front' ? 'Front view drawing' : 'Side view drawing'} data-testid={`canvas-${view}`} />;
}
