import { useEffect } from 'preact/hooks';
import type { Store } from '../../app/state';

const SHOW_MS = 5000;

/** Short messages that fade away. Errors say what happened and what to do, and never blame. */
export function Toasts({ store }: { store: Store }) {
  const toasts = store.toasts.value;
  useEffect(() => {
    if (toasts.length === 0) return;
    const oldest = toasts[0];
    const t = setTimeout(() => store.dismissToast(oldest.id), oldest.action ? SHOW_MS + 3000 : SHOW_MS);
    return () => clearTimeout(t);
  }, [toasts, store]);

  return (
    <div class="toasts" role="status" aria-live="polite">
      {toasts.map((t) => (
        <div class="toast" key={t.id}>
          <span>{t.message}</span>
          {t.action && (
            <button
              type="button"
              class="btn"
              onClick={() => {
                t.action?.run();
                store.dismissToast(t.id);
              }}
            >
              {t.action.label}
            </button>
          )}
        </div>
      ))}
    </div>
  );
}
