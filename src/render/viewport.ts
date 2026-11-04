import {
  AmbientLight,
  BufferAttribute,
  BufferGeometry,
  Color,
  DirectionalLight,
  GridHelper,
  Mesh,
  PerspectiveCamera,
  Scene,
  WebGLRenderer,
} from 'three';
import type { Box3 } from '../core/geom/bounds';
import { BUILD_MM } from '../core/doc/types';
import type { MeshData } from '../core/geom/surfaceNets';
import { OrbitCamera } from './camera';
import type { CameraPreset } from './camera';
import { FrameScheduler } from './frameScheduler';
import { ghostMaterial, rgb, toyMaterial } from './materials';
import { projectToScreen, screenRay } from './picking';

export const MAX_PIXEL_RATIO = 2;
export const FOV_DEG = 40;

/** Lets an editing mode take over a finger or mouse press on the 3D view (instead of turning the camera). */
export interface ViewportInteraction {
  /** Return true to take over this pointer. */
  down(e: PointerEvent): boolean;
  move(e: PointerEvent): void;
  up(e: PointerEvent): void;
  /** A short press that did not move and was not taken over. */
  tap(e: PointerEvent): void;
}

export interface ViewportOptions {
  /** Smooth edges. Left off on weak devices. */
  antialias?: boolean;
}

/**
 * The 3D view. It draws only when something changes (`requestRender`), never in a constant loop.
 * One finger turns the model; two fingers slide it and pinch to zoom; the mouse wheel zooms.
 */
export class Viewport {
  readonly camera = new OrbitCamera();
  private readonly renderer: WebGLRenderer;
  private readonly scene = new Scene();
  private readonly three = new PerspectiveCamera(FOV_DEG, 1, 1, 2000);
  /** Things drawn on top of the toy (the gizmo). Depth is cleared first so they are never hidden inside it. */
  readonly overlay = new Scene();
  interaction: ViewportInteraction | null = null;
  private takenBy: number | null = null;
  private downInfo = new Map<number, { x: number; y: number; t: number; moved: boolean }>();
  private readonly beforeDraw: (() => void)[] = [];
  private readonly frames: FrameScheduler;
  private readonly toy: Mesh;
  private readonly ghost: Mesh;
  private readonly lostListeners: (() => void)[] = [];
  private readonly pointers = new Map<number, { x: number; y: number }>();
  private lastPinch = 0;
  private lost = false;
  /** Kept from when the context was healthy: a lost context will not hand out extensions. */
  private readonly loseExtension: { restoreContext(): void } | null;
  private readonly cleanups: (() => void)[] = [];

  constructor(private readonly canvas: HTMLCanvasElement, opts: ViewportOptions = {}) {
    this.renderer = new WebGLRenderer({ canvas, antialias: opts.antialias ?? true, alpha: false });
    this.renderer.autoClear = false;
    this.renderer.setClearColor(new Color('#eef1f4'));
    this.loseExtension = this.renderer.getContext().getExtension('WEBGL_lose_context');

    this.scene.add(new AmbientLight('#ffffff', 1.1));
    const sun = new DirectionalLight('#ffffff', 2.2);
    sun.position.set(60, 120, 90);
    this.scene.add(sun);

    // the build plate: the biggest a toy may be, in squares of 10 mm
    const plate = new GridHelper(BUILD_MM, BUILD_MM / 10, 0x9aa5b1, 0xc9d1d9);
    this.scene.add(plate);

    this.toy = new Mesh(new BufferGeometry(), toyMaterial());
    this.toy.frustumCulled = false;
    this.ghost = new Mesh(new BufferGeometry(), ghostMaterial());
    this.ghost.visible = false;
    this.ghost.frustumCulled = false;
    this.scene.add(this.toy, this.ghost);

    this.frames = new FrameScheduler((cb) => requestAnimationFrame(cb), () => this.draw());

    canvas.style.touchAction = 'none';
    this.listen(canvas, 'webglcontextlost', (e) => {
      e.preventDefault(); // lets the browser give the context back later
      this.lost = true;
      for (const cb of this.lostListeners) cb();
    });
    this.listen(canvas, 'webglcontextrestored', () => {
      this.lost = false;
      this.resize();
      this.requestRender();
    });
    this.listen(canvas, 'pointerdown', (e) => this.onDown(e as PointerEvent));
    this.listen(canvas, 'pointermove', (e) => this.onMove(e as PointerEvent));
    this.listen(canvas, 'pointerup', (e) => this.onUp(e as PointerEvent));
    this.listen(canvas, 'pointercancel', (e) => this.onUp(e as PointerEvent));
    this.listen(canvas, 'wheel', (e) => {
      e.preventDefault();
      this.camera.zoom(Math.exp((e as WheelEvent).deltaY * 0.0015));
      this.requestRender();
    });
    this.resize();
  }

  /** Shows a mesh. `colors[i]` is the colour of part number i. */
  setMesh(mesh: MeshData, colors: string[]): void {
    setGeometry(this.toy, mesh, colors);
    this.requestRender();
  }

  /** A see-through shape drawn over the toy, or null to hide it. */
  setGhost(mesh: MeshData | null): void {
    if (!mesh) {
      this.ghost.visible = false;
    } else {
      setGeometry(this.ghost, mesh, []);
      this.ghost.visible = true;
    }
    this.requestRender();
  }

  /** Centre the view on a mesh and back off far enough to see all of it. */
  fitMesh(mesh: MeshData): void {
    const p = mesh.positions;
    if (p.length === 0) return;
    const min: [number, number, number] = [Infinity, Infinity, Infinity];
    const max: [number, number, number] = [-Infinity, -Infinity, -Infinity];
    for (let i = 0; i < p.length; i += 3) {
      for (let a = 0; a < 3; a++) {
        if (p[i + a] < min[a]) min[a] = p[i + a];
        if (p[i + a] > max[a]) max[a] = p[i + a];
      }
    }
    this.fit({ min, max });
  }

  fit(box: Box3): void {
    this.camera.fit(box);
    this.requestRender();
  }

  setCameraPreset(name: CameraPreset): void {
    this.camera.preset(name);
    this.requestRender();
  }

  requestRender(): void {
    this.frames.request();
  }

  /** Match the canvas to its size on the page. Call when the page layout changes. */
  resize(): void {
    const w = Math.max(1, this.canvas.clientWidth);
    const h = Math.max(1, this.canvas.clientHeight);
    this.renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, MAX_PIXEL_RATIO));
    this.renderer.setSize(w, h, false);
    this.three.aspect = w / h;
    this.three.updateProjectionMatrix();
    this.requestRender();
  }

  /** Called just before every draw, so overlays can follow the camera. */
  onBeforeDraw(cb: () => void): void {
    this.beforeDraw.push(cb);
  }

  /** The ray from the camera through a point on the page. */
  rayAt(clientX: number, clientY: number) {
    const r = this.canvas.getBoundingClientRect();
    const ndc: [number, number] = [((clientX - r.left) / r.width) * 2 - 1, 1 - ((clientY - r.top) / r.height) * 2];
    return screenRay(this.camera, FOV_DEG, r.width / r.height, ndc);
  }

  /** Where a point of the toy is on the page, or null if it is behind the camera. */
  screenOf(p: [number, number, number]): [number, number] | null {
    const r = this.canvas.getBoundingClientRect();
    const s = projectToScreen(this.camera, FOV_DEG, r.width / r.height, r.width, r.height, p);
    return s ? [r.left + s[0], r.top + s[1]] : null;
  }

  canvasRect(): DOMRect {
    return this.canvas.getBoundingClientRect();
  }

  get size(): { width: number; height: number } {
    const r = this.canvas.getBoundingClientRect();
    return { width: r.width, height: r.height };
  }

  onContextLost(cb: () => void): void {
    this.lostListeners.push(cb);
  }

  get contextLost(): boolean {
    return this.lost;
  }

  /** Asks the browser to bring the 3D back after it was lost. */
  restart(): void {
    this.loseExtension?.restoreContext();
  }

  /** A small picture of what is on screen, for the "My toys" list. */
  snapshotBlob(maxSize = 160): Promise<Blob | null> {
    if (this.lost) return Promise.resolve(null);
    this.draw(); // draw and copy in the same moment, while the picture is still there
    const w = this.canvas.width;
    const h = this.canvas.height;
    if (w === 0 || h === 0) return Promise.resolve(null);
    const k = Math.min(1, maxSize / Math.max(w, h));
    const small = document.createElement('canvas');
    small.width = Math.max(1, Math.round(w * k));
    small.height = Math.max(1, Math.round(h * k));
    const g = small.getContext('2d');
    if (!g) return Promise.resolve(null);
    g.drawImage(this.canvas, 0, 0, small.width, small.height);
    return new Promise((resolve) => small.toBlob((b) => resolve(b), 'image/png'));
  }

  /** Draws right now and counts the colours on screen. Used by tests. */
  pixelStats(): { colours: number; nonBackground: number; total: number } {
    this.draw();
    const gl = this.renderer.getContext();
    const w = gl.drawingBufferWidth;
    const h = gl.drawingBufferHeight;
    const px = new Uint8Array(w * h * 4);
    gl.readPixels(0, 0, w, h, gl.RGBA, gl.UNSIGNED_BYTE, px);
    const seen = new Set<number>();
    let non = 0;
    const bg = [0xee, 0xf1, 0xf4];
    for (let i = 0; i < px.length; i += 4) {
      seen.add((px[i] << 16) | (px[i + 1] << 8) | px[i + 2]);
      if (Math.abs(px[i] - bg[0]) > 6 || Math.abs(px[i + 1] - bg[1]) > 6 || Math.abs(px[i + 2] - bg[2]) > 6) non++;
    }
    return { colours: seen.size, nonBackground: non, total: w * h };
  }

  dispose(): void {
    this.frames.cancel();
    this.cleanups.forEach((f) => f());
    this.toy.geometry.dispose();
    this.ghost.geometry.dispose();
    this.renderer.dispose();
  }

  private draw(): void {
    if (this.lost) return;
    const [x, y, z] = this.camera.position();
    this.three.position.set(x, y, z);
    this.three.lookAt(this.camera.target[0], this.camera.target[1], this.camera.target[2]);
    for (const cb of this.beforeDraw) cb();
    this.renderer.clear();
    this.renderer.render(this.scene, this.three);
    this.renderer.clearDepth();
    this.renderer.render(this.overlay, this.three);
  }

  private listen(target: EventTarget, type: string, fn: (e: Event) => void): void {
    target.addEventListener(type, fn);
    this.cleanups.push(() => target.removeEventListener(type, fn));
  }

  private onDown(e: PointerEvent): void {
    this.canvas.setPointerCapture?.(e.pointerId);
    this.downInfo.set(e.pointerId, { x: e.clientX, y: e.clientY, t: e.timeStamp, moved: false });
    if (this.pointers.size === 0 && this.takenBy === null && this.interaction?.down(e)) {
      this.takenBy = e.pointerId; // an editing mode has this finger
      return;
    }
    this.pointers.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (this.pointers.size === 2) this.lastPinch = this.pinchDistance();
  }

  private onMove(e: PointerEvent): void {
    const info = this.downInfo.get(e.pointerId);
    if (info && Math.hypot(e.clientX - info.x, e.clientY - info.y) > 6) info.moved = true;
    if (this.takenBy === e.pointerId) {
      this.interaction?.move(e);
      return;
    }
    const p = this.pointers.get(e.pointerId);
    if (!p) return;
    const dx = e.clientX - p.x;
    const dy = e.clientY - p.y;
    p.x = e.clientX;
    p.y = e.clientY;
    if (this.pointers.size === 1) {
      this.camera.orbit(dx, dy);
    } else if (this.pointers.size === 2) {
      // two fingers: slide with their average movement, zoom with how far apart they are
      this.camera.pan(dx / 2, dy / 2);
      const d = this.pinchDistance();
      if (this.lastPinch > 0 && d > 0) this.camera.zoom(this.lastPinch / d);
      this.lastPinch = d;
    }
    this.requestRender();
  }

  private onUp(e: PointerEvent): void {
    const info = this.downInfo.get(e.pointerId);
    this.downInfo.delete(e.pointerId);
    if (this.takenBy === e.pointerId) {
      this.takenBy = null;
      this.interaction?.up(e);
      return;
    }
    if (info && !info.moved && e.type === 'pointerup' && e.timeStamp - info.t < 500 && this.pointers.size <= 1) this.interaction?.tap(e);
    this.pointers.delete(e.pointerId);
    this.lastPinch = this.pointers.size === 2 ? this.pinchDistance() : 0;
  }

  private pinchDistance(): number {
    const [a, b] = [...this.pointers.values()];
    return a && b ? Math.hypot(a.x - b.x, a.y - b.y) : 0;
  }
}

function setGeometry(mesh: Mesh, data: MeshData, colors: string[]): void {
  const old = mesh.geometry;
  const g = new BufferGeometry();
  g.setAttribute('position', new BufferAttribute(data.positions, 3));
  g.setAttribute('normal', new BufferAttribute(data.normals, 3));
  if (colors.length) {
    const nv = data.partIds.length;
    const col = new Float32Array(nv * 3);
    for (let i = 0; i < nv; i++) {
      const c = rgb(colors[data.partIds[i]] ?? '#889096');
      col[i * 3] = c[0];
      col[i * 3 + 1] = c[1];
      col[i * 3 + 2] = c[2];
    }
    g.setAttribute('color', new BufferAttribute(col, 3));
  }
  g.setIndex(new BufferAttribute(data.indices, 1));
  mesh.geometry = g;
  old.dispose();
}
