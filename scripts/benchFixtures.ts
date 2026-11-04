import legacyV2 from '../tests/fixtures/legacy-v2.json';
import { partFrame, worldToLocal, dirToLocal } from '../src/core/doc/frame';
import { migrate } from '../src/core/doc/migrate';
import { createDoc } from '../src/core/doc/schema';
import type { Dab, Doc, Part, PartKind } from '../src/core/doc/types';
import { SHAPES } from '../src/core/geom/shapes';
import type { ShapeName } from '../src/core/geom/shapes';
import type { Vec3 } from '../src/core/geom/vec';

export interface Fixture {
  name: string;
  description: string;
  doc: Doc;
}

/** Same numbers every run, so timings can be compared. */
function rng(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) / 2147483647);
}

/** A 6-part character: the prototype's "Chibi buddy" preset, as saved by the prototype. */
function character(): Doc {
  return migrate(structuredClone(legacyV2));
}

/** 20 parts of mixed shapes, half of them melted together, some turned and tapered. */
function stress20(): Doc {
  const doc = createDoc();
  const r = rng(5);
  const shapes: ShapeName[] = ['circle', 'box', 'capsule', 'star', 'egg', 'heart', 'drop', 'moon'];
  for (let i = 0; i < 20; i++) {
    const name = shapes[i % shapes.length];
    const col = i % 5;
    const row = Math.floor(i / 5);
    const cx = -36 + col * 18 + (r() - 0.5) * 4;
    const cy = row * 16 + 6 + (r() - 0.5) * 4;
    const w = 12 + r() * 8;
    const h = 12 + r() * 8;
    const part: Part = {
      id: `s${i}`,
      name: `${name} ${i}`,
      kind: (name === 'circle' || name === 'box' ? name : name) as PartKind,
      outline: SHAPES[name](cx - w / 2, cy - h / 2, cx + w / 2, cy + h / 2),
      color: '#46a758',
      depthMm: 10 + r() * 14,
      round: 0.4 + r() * 0.6,
      z: (r() - 0.5) * 8,
      blend: 5,
      melt: i % 2 === 0,
      cut: false,
      rot: { x: 0, y: 0, z: i % 3 === 0 ? 25 : 0 },
      taper: i % 4 === 0 ? 25 : 0,
      squash: 0,
    };
    doc.parts.push(part);
  }
  return doc;
}

/** The character with 300 sculpt dabs of every kind on its body and head. */
function sculptHeavy(): Doc {
  const doc = character();
  const r = rng(9);
  const targets = doc.parts.filter((p) => p.name === 'Body' || p.name === 'Head');
  for (let i = 0; i < 300; i++) {
    const part = targets[i % targets.length];
    const fr = partFrame(part);
    // a random direction, placed on the surface of an ellipse that roughly matches the part
    const a = r() * Math.PI * 2;
    const b = Math.acos(2 * r() - 1);
    const dir: Vec3 = [Math.sin(b) * Math.cos(a), Math.sin(b) * Math.sin(a), Math.cos(b)];
    const at: Vec3 = [dir[0] * 0.5, dir[1] * 0.5, dir[2] * 0.5];
    const kind = i % 10;
    const type: Dab['type'] = kind < 4 ? 'pull' : kind < 7 ? 'push' : kind < 9 ? 'smooth' : 'grab';
    const dab: Dab = { partId: part.id, type, at, radius: 1.5 + r() * 2.5, strength: 0.5 };
    if (type === 'grab') {
      const world = [dir[0] * 2, dir[1] * 2, dir[2] * 2] as Vec3;
      dab.radius = 6 + r() * 4;
      dab.drag = dirToLocal(fr, world);
      dab.at = worldToLocal(fr, [fr.origin[0] + dir[0] * fr.size[0] * 0.5, fr.origin[1] + dir[1] * fr.size[1] * 0.5, fr.origin[2] + dir[2] * fr.size[2] * 0.5]);
    }
    doc.dabs.push(dab);
  }
  return doc;
}

export function fixtures(): Fixture[] {
  return [
    { name: 'character', description: '6-part character (prototype preset)', doc: character() },
    { name: 'stress-20', description: '20 mixed parts, half melted', doc: stress20() },
    { name: 'sculpt-heavy', description: 'character with 300 sculpt dabs', doc: sculptHeavy() },
  ];
}
