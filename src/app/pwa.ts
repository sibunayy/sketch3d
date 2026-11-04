import { registerSW } from 'virtual:pwa-register';
import { copy } from '../ui/copy';
import type { Store } from './state';

/**
 * Lets the app open with no network, where the browser allows it. This is only ever a bonus:
 * some browsers (Chrome on an iPad, for one) may not offer service workers, and then the app just
 * carries on, loading from the network and the browser's normal cache.
 */
export function setupOffline(store: Store): void {
  try {
    if (!('serviceWorker' in navigator) || !navigator.serviceWorker) return;
    const update = registerSW({
      onNeedRefresh() {
        store.toast(copy.toastUpdate, { label: copy.btnRestart, run: () => void update(true) });
      },
      onRegisterError() {
        // not available here: nothing to do, and nothing to tell the child
      },
    });
  } catch {
    // never let this stop the app
  }
}
