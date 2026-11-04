import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import legacyV2 from '../fixtures/legacy-v2.json';
import { DocError } from '../../src/core/doc/schema';
import { Autosave } from '../../src/storage/autosave';
import { MemoryBackend, ProjectStore, classifyError } from '../../src/storage/db';
import { exportProjectFile, importLegacyOnce, importProjectFile } from '../../src/storage/projectFile';
import { makeDoc, makePart } from './helpers/docs';

const docWith = (depth: number) => makeDoc([makePart({ depthMm: depth })]);
const thumb = () => new Blob(['x'], { type: 'image/png' });
const depthOf = async (store: ProjectStore, id = 'a') => (await store.load(id))?.parts[0].depthMm;

describe('ProjectStore: saving and loading', () => {
  it('round-trips a toy and lists it with its name', async () => {
    const s = new ProjectStore(new MemoryBackend());
    expect(await s.save('a', docWith(11), thumb(), 'My dino')).toEqual({ ok: true });
    expect(await depthOf(s)).toBe(11);
    const list = await s.list();
    expect(list).toHaveLength(1);
    expect(list[0]).toMatchObject({ id: 'a', name: 'My dino', parts: 1 });
  });

  it('keeps the newest save and lists the most recently saved toy first', async () => {
    const s = new ProjectStore(new MemoryBackend());
    await s.save('a', docWith(1), thumb(), 'First');
    await new Promise((r) => setTimeout(r, 5));
    await s.save('b', docWith(2), thumb(), 'Second');
    await s.save('a', docWith(3), thumb(), 'First');
    expect((await s.list()).map((p) => p.id)).toEqual(['a', 'b']);
    expect(await depthOf(s, 'a')).toBe(3);
  });

  it('loading something that was never saved gives null', async () => {
    expect(await new ProjectStore(new MemoryBackend()).load('nope')).toBeNull();
  });

  it('delete removes the toy and its picture', async () => {
    const backend = new MemoryBackend();
    const s = new ProjectStore(backend);
    await s.save('a', docWith(1), thumb());
    await s.delete('a');
    expect(await s.load('a')).toBeNull();
    expect(await s.list()).toEqual([]);
    expect([...backend.data.keys()].filter((k) => k.includes('a'))).toEqual([]);
  });

  it('remembers which toy was open last', async () => {
    const s = new ProjectStore(new MemoryBackend());
    expect(await s.currentId()).toBeNull();
    await s.setCurrent('a');
    expect(await s.currentId()).toBe('a');
  });

  it('a save that grows over many edits keeps only the last two copies', async () => {
    const backend = new MemoryBackend();
    const s = new ProjectStore(backend);
    for (let i = 1; i <= 8; i++) await s.save('a', docWith(i), thumb());
    expect([...backend.data.keys()].filter((k) => /^p:a:\d+$/.test(k))).toHaveLength(2);
    expect(await depthOf(s)).toBe(8);
  });
});

describe('review focus 4: storage that fails', () => {
  it('when IndexedDB is blocked, saving reports it and nothing throws', async () => {
    const backend = new MemoryBackend();
    backend.failAll = Object.assign(new Error('blocked'), { name: 'SecurityError' });
    const s = new ProjectStore(backend);
    expect(await s.save('a', docWith(5), thumb())).toEqual({ ok: false, reason: 'blocked' });
    expect(await s.load('a')).toBeNull();
    expect(await s.list()).toEqual([]);
  });

  it('a quota error keeps the previous save intact', async () => {
    const backend = new MemoryBackend();
    const s = new ProjectStore(backend);
    await s.save('a', docWith(10), thumb());
    backend.failSets = Object.assign(new Error('full'), { name: 'QuotaExceededError' });
    expect(await s.save('a', docWith(99), thumb())).toEqual({ ok: false, reason: 'quota' });
    backend.failSets = null;
    expect(await depthOf(s)).toBe(10);
  });

  it('a crash between the two writes of a save (simulated) leaves the last good project loadable', async () => {
    const backend = new MemoryBackend();
    const s = new ProjectStore(backend);
    await s.save('a', docWith(10), thumb());
    // the new copy is written, then the tab dies before the pointer moves
    backend.failAfterSets = 1;
    const result = await s.save('a', docWith(77), thumb());
    expect(result.ok).toBe(false);
    backend.failAfterSets = null;
    expect(await depthOf(s)).toBe(10);
    // and the next save works normally
    expect(await s.save('a', docWith(20), thumb())).toEqual({ ok: true });
    expect(await depthOf(s)).toBe(20);
  });

  it('if the newest copy is damaged, the one before it is used', async () => {
    const backend = new MemoryBackend();
    const s = new ProjectStore(backend);
    await s.save('a', docWith(10), thumb());
    await s.save('a', docWith(20), thumb());
    const newest = [...backend.data.keys()].filter((k) => /^p:a:\d+$/.test(k)).sort().pop()!;
    backend.data.set(newest, { doc: { not: 'a toy' }, name: 'x', updatedAt: 1 });
    expect(await depthOf(s)).toBe(10);
  });

  it('a failing picture does not fail the save', async () => {
    const backend = new MemoryBackend();
    backend.failKeys = /^t:/;
    const s = new ProjectStore(backend);
    expect(await s.save('a', docWith(4), thumb())).toEqual({ ok: true });
    expect(await depthOf(s)).toBe(4);
  });

  it('classifies errors into words the app can act on', () => {
    expect(classifyError(Object.assign(new Error(), { name: 'QuotaExceededError' }))).toBe('quota');
    expect(classifyError(Object.assign(new Error(), { name: 'SecurityError' }))).toBe('blocked');
    expect(classifyError(Object.assign(new Error(), { name: 'InvalidStateError' }))).toBe('blocked');
    expect(classifyError(new Error('who knows'))).toBe('unknown');
    expect(classifyError('text')).toBe('unknown');
  });
});

describe('Autosave', () => {
  beforeEach(() => vi.useFakeTimers());
  afterEach(() => vi.useRealTimers());

  const setup = (result: () => ReturnType<typeof ok> | ReturnType<typeof bad> = ok) => {
    const save = vi.fn(async () => result());
    const problems: string[] = [];
    const a = new Autosave(save, 500);
    a.onProblem((r) => problems.push(r));
    return { a, save, problems };
  };
  const ok = () => ({ ok: true as const });
  const bad = (reason: 'blocked' | 'quota' | 'unknown' = 'blocked') => ({ ok: false as const, reason });

  it('autosave debounces 10 edits within 500 ms into one write', async () => {
    const { a, save } = setup();
    for (let i = 0; i < 10; i++) {
      a.notify(docWith(i + 1));
      vi.advanceTimersByTime(40);
    }
    expect(save).not.toHaveBeenCalled();
    expect(a.status.value).toBe('saving');
    await vi.advanceTimersByTimeAsync(500);
    expect(save).toHaveBeenCalledTimes(1);
    expect((save.mock.calls[0] as unknown as [{ parts: { depthMm: number }[] }])[0].parts[0].depthMm).toBe(10); // the newest edit
    expect(a.status.value).toBe('saved');
  });

  it('flush writes immediately and resolves after the write', async () => {
    const { a, save } = setup();
    a.notify(docWith(3));
    const done = a.flush();
    expect(save).toHaveBeenCalledTimes(1);
    await done;
    expect(a.status.value).toBe('saved');
    await vi.advanceTimersByTimeAsync(2000);
    expect(save).toHaveBeenCalledTimes(1); // the pending timer was cancelled
  });

  it('flush with nothing waiting does nothing', async () => {
    const { a, save } = setup();
    await a.flush();
    expect(save).not.toHaveBeenCalled();
    expect(a.status.value).toBe('saved');
  });

  it('when IndexedDB is blocked, status becomes not-saved, the problem is reported once, and nothing throws', async () => {
    const { a, problems } = setup(() => bad('blocked'));
    a.notify(docWith(1));
    await vi.advanceTimersByTimeAsync(500);
    expect(a.status.value).toBe('not-saved');
    a.notify(docWith(2));
    await vi.advanceTimersByTimeAsync(500);
    a.notify(docWith(3));
    await vi.advanceTimersByTimeAsync(500);
    expect(problems).toEqual(['blocked']); // told once, not on every edit
  });

  it('recovers: after a failure a good save brings the status back to saved', async () => {
    let fail = true;
    const { a } = setup(() => (fail ? bad('quota') : ok()));
    a.notify(docWith(1));
    await vi.advanceTimersByTimeAsync(500);
    expect(a.status.value).toBe('not-saved');
    fail = false;
    a.notify(docWith(2));
    await vi.advanceTimersByTimeAsync(500);
    expect(a.status.value).toBe('saved');
  });

  it('never throws even if the save function does', async () => {
    const save = vi.fn(async () => {
      throw new Error('boom');
    });
    const a = new Autosave(save as never, 500);
    a.notify(docWith(1));
    await expect(a.flush()).resolves.toBeUndefined();
    expect(a.status.value).toBe('not-saved');
  });

  it('an edit made while a save is running is saved next, not lost', async () => {
    let release: (() => void) | undefined;
    const save = vi.fn(
      () =>
        new Promise<{ ok: true }>((resolve) => {
          release = () => resolve({ ok: true });
        }),
    );
    const a = new Autosave(save as never, 500);
    a.notify(docWith(1));
    const first = a.flush();
    a.notify(docWith(2));
    release?.();
    await first;
    await vi.advanceTimersByTimeAsync(500);
    release?.();
    await vi.advanceTimersByTimeAsync(0);
    expect(save).toHaveBeenCalledTimes(2);
  });
});

describe('project files', () => {
  it('export then import gives the same toy back', async () => {
    const doc = docWith(14);
    const file = new File([exportProjectFile(doc)], 'toy.sketch3d.json');
    expect(await importProjectFile(file)).toEqual(doc);
  });

  it("importProjectFile rejects a file that is not a Sketch3D project with \"That file isn't a Sketch3D toy.\"", async () => {
    for (const text of ['hello', '{"a":1}', '[1,2,3]', '', 'null']) {
      const err = await importProjectFile(new File([text], 'x.json')).catch((e) => e);
      expect(err).toBeInstanceOf(DocError);
      expect((err as DocError).message).toBe("That file isn't a Sketch3D toy.");
    }
  });

  it('opens a project from the prototype too', async () => {
    const doc = await importProjectFile(new File([JSON.stringify(legacyV2)], 'old.json'));
    expect(doc.parts).toHaveLength(6);
  });

  it('refuses a toy made by a newer Sketch3D with a clear message', async () => {
    const file = new File([JSON.stringify({ app: 'sketch3d', format: 1, doc: { version: 99, parts: [] } })], 'future.json');
    const err = await importProjectFile(file).catch((e) => e);
    expect((err as DocError).message).toMatch(/newer/);
  });
});

describe("the prototype's saved toy (localStorage sketch3d.v2)", () => {
  function fakeStorage(items: Record<string, string> = {}): Storage {
    const m = new Map(Object.entries(items));
    return {
      get length() {
        return m.size;
      },
      clear: () => m.clear(),
      getItem: (k) => m.get(k) ?? null,
      key: (i) => [...m.keys()][i] ?? null,
      removeItem: (k) => void m.delete(k),
      setItem: (k, v) => void m.set(k, v),
    };
  }

  it("is imported once and then marked done, so a toy you deleted never comes back", () => {
    const storage = fakeStorage({ 'sketch3d.v2': JSON.stringify(legacyV2) });
    const first = importLegacyOnce(storage);
    expect(first?.parts).toHaveLength(6);
    expect(storage.getItem('sketch3d.v2.imported')).toBe('1');
    expect(importLegacyOnce(storage)).toBeNull();
  });

  it('does nothing when there is no old toy, and copes with a damaged one', () => {
    expect(importLegacyOnce(fakeStorage())).toBeNull();
    const broken = fakeStorage({ 'sketch3d.v2': '{not json' });
    expect(importLegacyOnce(broken)).toBeNull();
    expect(broken.getItem('sketch3d.v2.imported')).toBe('1'); // do not try again every time
  });

  it('copes with storage that is not allowed at all', () => {
    const denied = {
      getItem() {
        throw new Error('denied');
      },
    } as unknown as Storage;
    expect(importLegacyOnce(denied)).toBeNull();
  });
});
