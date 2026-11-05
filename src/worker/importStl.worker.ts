import { importStl } from '../core/mesh/importStl';
import type { ImportedShape } from '../core/mesh/importStl';
import { STL_MESSAGES } from '../core/mesh/messages';
import { StlError } from '../core/mesh/stlRead';

/** Opens an STL file in the background, so the page does not freeze while a big shape is measured. */
export type ImportReply = { ok: true; shape: ImportedShape } | { ok: false; message: string };

const ctx = self as unknown as {
  onmessage: ((e: MessageEvent<{ buf: ArrayBuffer; name: string }>) => void) | null;
  postMessage(message: ImportReply): void;
};

ctx.onmessage = (e) => {
  try {
    ctx.postMessage({ ok: true, shape: importStl(e.data.buf, e.data.name) });
  } catch (err) {
    ctx.postMessage({ ok: false, message: err instanceof StlError ? err.message : STL_MESSAGES.broken });
  }
};
