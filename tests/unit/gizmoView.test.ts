import { describe, expect, it } from 'vitest';
import type { Material, Mesh } from 'three';
import { GizmoView } from '../../src/render/gizmo';

/** Every handle piece, with the handle it belongs to (set by GizmoView as `userData.handle`). */
function pieces(g: GizmoView): { handle: string; mesh: Mesh }[] {
  const out: { handle: string; mesh: Mesh }[] = [];
  g.group.traverse((o) => {
    const handle = (o as Mesh).userData.handle as string | undefined;
    if (handle) out.push({ handle, mesh: o as Mesh });
  });
  return out;
}
const opacity = (m: Mesh) => (m.material as Material).opacity;

describe('GizmoView', () => {
  it('draws every handle as a solid mesh (thin lines vanish under a finger)', () => {
    const p = pieces(new GizmoView());
    for (const h of ['move:x', 'move:y', 'move:z', 'turn:x', 'turn:y', 'turn:z', 'resize']) {
      expect(p.some((x) => x.handle === h), h).toBe(true);
    }
    for (const { mesh } of p) expect((mesh as unknown as { isMesh?: boolean }).isMesh).toBe(true);
  });

  it('the handle being held stays bright and the others fade', () => {
    const g = new GizmoView();
    g.setActive('turn:y');
    for (const { handle, mesh } of pieces(g)) {
      if (handle === 'turn:y') expect(opacity(mesh)).toBe(1);
      else expect(opacity(mesh)).toBeLessThan(0.5);
    }
    g.setActive(null);
    for (const { mesh } of pieces(g)) expect(opacity(mesh)).toBeGreaterThanOrEqual(0.85);
  });
});
