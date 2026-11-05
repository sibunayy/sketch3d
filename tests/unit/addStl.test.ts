import { describe, expect, it } from 'vitest';
import { addStlFile, nameFromFile } from '../../src/app/importStl';
import { createStore } from '../../src/app/state';
import { createDoc } from '../../src/core/doc/schema';
import { validateDoc } from '../../src/core/doc/schema';
import { importStl } from '../../src/core/mesh/importStl';
import { ProjectStore, MemoryBackend } from '../../src/storage/db';
import { exportProjectFile, importProjectFile } from '../../src/storage/projectFile';
import { copy } from '../../src/ui/copy';

function boxStl(a = 30, b = 20, c = 10): ArrayBuffer {
  const v = [[0, 0, 0], [a, 0, 0], [a, b, 0], [0, b, 0], [0, 0, c], [a, 0, c], [a, b, c], [0, b, c]];
  const f = [[0, 3, 2], [0, 2, 1], [4, 5, 6], [4, 6, 7], [0, 1, 5], [0, 5, 4], [2, 3, 7], [2, 7, 6], [1, 2, 6], [1, 6, 5], [3, 0, 4], [3, 4, 7]];
  const buf = new ArrayBuffer(84 + 50 * f.length);
  const dv = new DataView(buf);
  dv.setUint32(80, f.length, true);
  f.forEach((t, i) => t.forEach((vi, j) => v[vi].forEach((x, k) => dv.setFloat32(84 + i * 50 + 12 + (j * 3 + k) * 4, x, true))));
  return buf;
}
const fileOf = (name: string, buf: ArrayBuffer) => ({ name, arrayBuffer: async () => buf }) as unknown as File;
const run = async (buf: ArrayBuffer, name: string) => importStl(buf, name);

describe('adding an STL file', () => {
  it('names parts after the file', () => {
    expect(nameFromFile('My_cool-dino.STL')).toBe('My cool dino');
    expect(nameFromFile('.stl')).toBe('Shape');
    expect(nameFromFile('x'.repeat(100) + '.stl').length).toBe(40);
  });

  it('adds one picked part in one undo step', async () => {
    const store = createStore(createDoc());
    expect(await addStlFile(store, fileOf('box.stl', boxStl()), run)).toBe(true);
    const d = store.doc.value;
    expect(d.parts).toHaveLength(1);
    expect(d.parts[0].kind).toBe('import');
    expect(d.parts[0].name).toBe('box');
    expect([...store.selection.value]).toEqual([d.parts[0].id]);
    expect(() => validateDoc(d)).not.toThrow();
    store.undo();
    expect(store.doc.value.parts).toHaveLength(0);
    store.redo();
    expect(store.doc.value.parts).toHaveLength(1);
  });

  it('says so when a shape was made smaller', async () => {
    const store = createStore(createDoc());
    await addStlFile(store, fileOf('big.stl', boxStl(300, 200, 100)), run);
    expect(store.toasts.value.map((t) => t.message)).toContain(copy.stlMadeSmaller);
  });

  it('shows a plain message for a bad file and leaves the toy alone', async () => {
    const store = createStore(createDoc());
    const ok = await addStlFile(store, fileOf('notes.stl', new TextEncoder().encode('hello there').buffer as ArrayBuffer), run);
    expect(ok).toBe(false);
    expect(store.doc.value.parts).toHaveLength(0);
    expect(store.toasts.value.map((t) => t.message)).toContain(copy.stlNotAShape);
    expect(store.canUndo.value).toBe(false);
  });

  it('survives saving and opening a toy file', async () => {
    const store = createStore(createDoc());
    await addStlFile(store, fileOf('box.stl', boxStl()), run);
    const doc = store.doc.value;
    const s = new ProjectStore(new MemoryBackend());
    const blob = exportProjectFile(doc);
    const back = await importProjectFile(new File([blob], 'box.sketch3d.json'));
    expect(back.parts[0].mesh?.data).toBe(doc.parts[0].mesh?.data);
    expect(await s.save('a', doc, new Blob(['x'], { type: 'image/png' }), 'Box toy')).toEqual({ ok: true });
    expect((await s.load('a'))?.parts[0].mesh?.data).toBe(doc.parts[0].mesh?.data);
  });
});
