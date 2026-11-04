import { createStore, del, get, keys, set } from 'idb-keyval';
import { migrate } from '../core/doc/migrate';
import type { Doc } from '../core/doc/types';

export type SaveResult = { ok: true } | { ok: false; reason: 'blocked' | 'quota' | 'unknown' };

export interface ProjectMeta {
  id: string;
  name: string;
  updatedAt: number;
  parts: number;
}

/** What storage must be able to do. Real storage is IndexedDB; tests use MemoryBackend. */
export interface KVBackend {
  get(key: string): Promise<unknown>;
  set(key: string, value: unknown): Promise<void>;
  del(key: string): Promise<void>;
  keys(): Promise<string[]>;
}

/** Turns a storage error into something the app can act on. */
export function classifyError(e: unknown): 'blocked' | 'quota' | 'unknown' {
  const name = typeof e === 'object' && e !== null && 'name' in e ? String((e as { name: unknown }).name) : '';
  if (name === 'QuotaExceededError') return 'quota';
  // private browsing, school policy, or storage turned off
  if (name === 'SecurityError' || name === 'InvalidStateError' || name === 'NotAllowedError') return 'blocked';
  return 'unknown';
}

/** IndexedDB through idb-keyval. Opens lazily, so a blocked database fails when used, not at start-up. */
export class IdbBackend implements KVBackend {
  private store: ReturnType<typeof createStore> | null = null;
  private open() {
    try {
      if (this.store) return this.store;
      if (typeof indexedDB === 'undefined' || !indexedDB) throw new Error('IndexedDB is not available');
      this.store = createStore('sketch3d', 'kv');
      return this.store;
    } catch (e) {
      // private browsing, school policy or a browser that has storage turned off
      const name = e instanceof Error && e.name !== 'Error' ? e.name : 'SecurityError';
      throw Object.assign(new Error('Storage is not available'), { name });
    }
  }
  get = (key: string) => get(key, this.open());
  set = (key: string, value: unknown) => set(key, value, this.open());
  del = (key: string) => del(key, this.open());
  keys = async () => (await keys(this.open())).map(String);
}

/** Keeps everything in memory. Used by tests, and as a stand-in when real storage is blocked. */
export class MemoryBackend implements KVBackend {
  readonly data = new Map<string, unknown>();
  /** Test switches: make storage fail in different ways. */
  failAll: Error | null = null;
  failSets: Error | null = null;
  /** Let this many more writes succeed, then fail every write (a tab dying part way through a save). */
  failAfterSets: number | null = null;
  failKeys: RegExp | null = null;

  async get(key: string) {
    if (this.failAll) throw this.failAll;
    const v = this.data.get(key);
    return v instanceof Blob ? v : v === undefined ? undefined : structuredClone(v);
  }
  async set(key: string, value: unknown) {
    if (this.failAll) throw this.failAll;
    if (this.failKeys?.test(key)) throw new Error('this key cannot be written');
    if (this.failSets) throw this.failSets;
    if (this.failAfterSets !== null) {
      if (this.failAfterSets <= 0) throw new Error('the tab was closed part way through');
      this.failAfterSets--;
    }
    this.data.set(key, value instanceof Blob ? value : structuredClone(value));
  }
  async del(key: string) {
    if (this.failAll) throw this.failAll;
    this.data.delete(key);
  }
  async keys() {
    if (this.failAll) throw this.failAll;
    return [...this.data.keys()];
  }
}

interface Pointer {
  rev: number;
}
interface Envelope {
  doc: unknown;
  name: string;
  updatedAt: number;
}

const ptrKey = (id: string) => `p:${id}:ptr`;
const copyKey = (id: string, rev: number) => `p:${id}:${rev}`;

/**
 * Saved toys. A save writes a brand new copy first and only then moves the pointer to it, and the
 * copy before is kept, so a save that dies part way (full storage, a closed tab) never damages the
 * last good toy.
 */
export class ProjectStore {
  constructor(private readonly backend: KVBackend = new IdbBackend()) {}

  async save(id: string, doc: Doc, thumb: Blob | null, name = 'My toy'): Promise<SaveResult> {
    try {
      const ptr = (await this.backend.get(ptrKey(id))) as Pointer | undefined;
      const rev = (ptr?.rev ?? 0) + 1;
      const envelope: Envelope = { doc, name, updatedAt: Date.now() };
      await this.backend.set(copyKey(id, rev), envelope); // 1. the new copy
      await this.backend.set(ptrKey(id), { rev } satisfies Pointer); // 2. only now does it count
      if (rev > 2) await this.backend.del(copyKey(id, rev - 2)).catch(() => {}); // 3. tidy up, best effort
      if (thumb) await this.backend.set(`t:${id}`, thumb).catch(() => {}); // a missing picture is not a failed save
      return { ok: true };
    } catch (e) {
      return { ok: false, reason: classifyError(e) };
    }
  }

  async load(id: string): Promise<Doc | null> {
    const env = await this.readEnvelope(id);
    return env ? env.doc : null;
  }

  /** The newest copy that is a good toy, falling back to the one before it. */
  private async readEnvelope(id: string): Promise<(Envelope & { doc: Doc }) | null> {
    try {
      const ptr = (await this.backend.get(ptrKey(id))) as Pointer | undefined;
      if (!ptr) return null;
      for (const rev of [ptr.rev, ptr.rev - 1]) {
        if (rev < 1) continue;
        const env = (await this.backend.get(copyKey(id, rev))) as Envelope | undefined;
        if (!env) continue;
        try {
          return { ...env, doc: migrate(env.doc) };
        } catch {
          // this copy is damaged: try the one before
        }
      }
    } catch {
      // storage is not working
    }
    return null;
  }

  async list(): Promise<ProjectMeta[]> {
    let all: string[];
    try {
      all = await this.backend.keys();
    } catch {
      return [];
    }
    const ids = all.flatMap((k) => {
      const m = /^p:(.+):ptr$/.exec(k);
      return m ? [m[1]] : [];
    });
    const metas: ProjectMeta[] = [];
    for (const id of ids) {
      const env = await this.readEnvelope(id);
      if (env) metas.push({ id, name: env.name, updatedAt: env.updatedAt, parts: env.doc.parts.length });
    }
    return metas.sort((a, b) => b.updatedAt - a.updatedAt);
  }

  async delete(id: string): Promise<void> {
    try {
      const all = await this.backend.keys();
      for (const k of all) if (k.startsWith(`p:${id}:`) || k === `t:${id}`) await this.backend.del(k);
    } catch {
      // nothing more can be done
    }
  }

  async thumb(id: string): Promise<Blob | null> {
    try {
      const t = await this.backend.get(`t:${id}`);
      return t instanceof Blob ? t : null;
    } catch {
      return null;
    }
  }

  async currentId(): Promise<string | null> {
    try {
      const v = await this.backend.get('meta:current');
      return typeof v === 'string' ? v : null;
    } catch {
      return null;
    }
  }

  async setCurrent(id: string): Promise<void> {
    try {
      await this.backend.set('meta:current', id);
    } catch {
      // not worth stopping for
    }
  }
}

/** Asks the browser not to throw our saved toys away when the device is short of space. */
export async function requestPersistence(): Promise<boolean> {
  try {
    return (await navigator.storage?.persist?.()) ?? false;
  } catch {
    return false;
  }
}
