import { sideOutline } from '../core/doc/partOps';
import { BUILD_MM } from '../core/doc/types';
import type { Doc } from '../core/doc/types';
import { effectiveParts } from '../core/geom/scene';
import type { MeshData } from '../core/geom/surfaceNets';
import type { Vec2 } from '../core/geom/vec';
import type { View2D } from './tools';
import type { ViewTransform } from './viewTransform';

/** The biggest a toy may be, as it appears in each view: centred across, standing on the floor. */
export const BUILD_BOX = { x0: -BUILD_MM / 2, y0: 0, x1: BUILD_MM / 2, y1: BUILD_MM };

function polygon(ctx: CanvasRenderingContext2D, vt: ViewTransform, pts: readonly Vec2[]) {
  ctx.beginPath();
  pts.forEach((p, i) => {
    const [x, y] = vt.worldToScreen(p);
    if (i === 0) ctx.moveTo(x, y);
    else ctx.lineTo(x, y);
  });
  ctx.closePath();
}

function drawGrid(ctx: CanvasRenderingContext2D, vt: ViewTransform, w: number, h: number) {
  ctx.save();
  ctx.lineWidth = 1;
  const step = vt.scale >= 6 ? 10 : 20;
  const [wx0, wy1] = vt.screenToWorld([0, 0]);
  const [wx1, wy0] = vt.screenToWorld([w, h]);
  ctx.strokeStyle = '#e3e8ed';
  ctx.beginPath();
  for (let x = Math.ceil(wx0 / step) * step; x <= wx1; x += step) {
    const sx = vt.worldToScreen([x, 0])[0];
    ctx.moveTo(sx, 0);
    ctx.lineTo(sx, h);
  }
  for (let y = Math.ceil(wy0 / step) * step; y <= wy1; y += step) {
    const sy = vt.worldToScreen([0, y])[1];
    ctx.moveTo(0, sy);
    ctx.lineTo(w, sy);
  }
  ctx.stroke();
  // the middle line and the floor
  ctx.strokeStyle = '#b8c2cc';
  ctx.beginPath();
  const [mx] = vt.worldToScreen([0, 0]);
  const [, fy] = vt.worldToScreen([0, 0]);
  ctx.moveTo(mx, 0);
  ctx.lineTo(mx, h);
  ctx.moveTo(0, fy);
  ctx.lineTo(w, fy);
  ctx.stroke();
  // build area
  ctx.setLineDash([8, 6]);
  ctx.strokeStyle = '#8a97a5';
  ctx.lineWidth = 2;
  const [bx0, by0] = vt.worldToScreen([BUILD_BOX.x0, BUILD_BOX.y1]);
  const [bx1, by1] = vt.worldToScreen([BUILD_BOX.x1, 0]);
  ctx.strokeRect(bx0, by0, bx1 - bx0, by1 - by0);
  ctx.restore();
}

export interface Silhouette {
  canvas: HTMLCanvasElement;
  key: string;
}

/**
 * The true shape of the 3D toy in this view, as a faint pink area. It is made by stamping every
 * mesh vertex onto a bitmap, so it always agrees with the 3D result (including turned parts).
 */
export function buildSilhouette(mesh: MeshData, view: View2D, vt: ViewTransform, w: number, h: number): HTMLCanvasElement {
  const c = document.createElement('canvas');
  c.width = Math.max(1, Math.ceil(w));
  c.height = Math.max(1, Math.ceil(h));
  const g = c.getContext('2d');
  if (!g) return c;
  g.fillStyle = 'rgba(233, 61, 130, 0.30)';
  const n = mesh.positions.length / 3;
  const stride = Math.max(1, Math.ceil(n / 24000)); // keep it quick on big meshes
  const r = Math.max(1.5, vt.scale * 0.9);
  const p = mesh.positions;
  for (let i = 0; i < n; i += stride) {
    const a = view === 'front' ? p[i * 3] : p[i * 3 + 2];
    const [sx, sy] = vt.worldToScreen([a, p[i * 3 + 1]]);
    g.fillRect(sx - r, sy - r, r * 2, r * 2);
  }
  return c;
}

export interface Scene2D {
  doc: Doc;
  selection: ReadonlySet<string>;
  view: View2D;
  silhouette: HTMLCanvasElement | null;
}

export function renderScene(ctx: CanvasRenderingContext2D, vt: ViewTransform, w: number, h: number, s: Scene2D) {
  ctx.clearRect(0, 0, w, h);
  ctx.fillStyle = '#ffffff';
  ctx.fillRect(0, 0, w, h);
  drawGrid(ctx, vt, w, h);

  if (s.silhouette) ctx.drawImage(s.silhouette, 0, 0, w, h);

  for (const p of effectiveParts(s.doc)) {
    const outline = s.view === 'front' ? p.outline : sideOutline(p);
    if (outline.length < 3) continue;
    const selected = s.selection.has(p.id);
    polygon(ctx, vt, outline);
    if (p.cut) {
      ctx.fillStyle = 'rgba(180, 35, 24, 0.14)';
      ctx.fill();
      ctx.setLineDash([6, 5]);
      ctx.strokeStyle = '#b42318';
    } else {
      ctx.globalAlpha = 0.72;
      ctx.fillStyle = p.color;
      ctx.fill();
      ctx.globalAlpha = 1;
      ctx.setLineDash([]);
      ctx.strokeStyle = 'rgba(27, 36, 48, 0.55)';
    }
    ctx.lineWidth = 1.5;
    ctx.stroke();
    ctx.setLineDash([]);
    if (selected) {
      polygon(ctx, vt, outline);
      ctx.lineWidth = 4;
      ctx.strokeStyle = '#2154c9';
      ctx.stroke();
    }
  }
}
