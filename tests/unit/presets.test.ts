import { describe, expect, it } from 'vitest';
import { PRESETS } from '../../src/core/doc/presets';
import { validateDoc } from '../../src/core/doc/schema';
import { checkPrintable, meshSize } from '../../src/core/print/check';
import { buildSceneField } from '../../src/core/geom/scene';
import { meshField } from '../../src/core/geom/surfaceNets';
import { printDoc } from '../../src/core/print/stl';

describe('PRESETS', () => {
  it('starts with a blank plate and has the prototype ready-made toys', () => {
    expect(PRESETS[0].id).toBe('blank');
    expect(PRESETS[0].make().parts).toEqual([]);
    const ids = PRESETS.map((p) => p.id);
    for (const id of ['chibi', 'robot', 'dino', 'rocket', 'cat', 'monster', 'car']) expect(ids).toContain(id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('every preset has a name and a description a child can read', () => {
    for (const p of PRESETS) {
      expect(p.name.length).toBeGreaterThan(1);
      expect(p.description.length).toBeGreaterThan(5);
    }
  });

  it('makes a fresh copy every time, so editing one does not change the next', () => {
    const p = PRESETS.find((x) => x.id === 'robot')!;
    const a = p.make();
    a.parts[0].name = 'Changed';
    expect(p.make().parts[0].name).not.toBe('Changed');
  });

  describe.each(PRESETS.filter((p) => p.id !== 'blank'))('$name', (preset) => {
    it('is a valid toy', () => {
      expect(() => validateDoc(preset.make())).not.toThrow();
      expect(preset.make().parts.length).toBeGreaterThanOrEqual(3);
    });

    it('is printable', () => {
      const doc = printDoc(preset.make(), { flatBase: true });
      const mesh = meshField(buildSceneField(doc, { voxelMm: 0.8 }), { voxelMm: 0.8 });
      const report = checkPrintable(doc, mesh);
      expect(report.issues.map((i) => `${i.code} ${i.partIds?.join(',') ?? ''} ${i.detail ?? ''}`)).toEqual([]);
      expect(report.ok).toBe(true);
      const s = meshSize(mesh);
      expect(Math.max(s.w, s.h, s.d)).toBeLessThanOrEqual(100);
    });
  });
});
