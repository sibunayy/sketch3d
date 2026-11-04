import { render } from 'preact';
import { app } from './app/state';
import { latestMesh, startMesher } from './app/mesher';
import { viewportRef } from './app/viewportRef';
import { startPersistence } from './app/persist';
import { setupOffline } from './app/pwa';
import type { Persistence } from './app/persist';
import { Shell } from './ui/Shell';
import './ui/tokens.css';
import './ui/shell.css';

const root = document.getElementById('app');
if (root) {
  const show = (persistence: Persistence | null) => render(<Shell store={app} persistence={persistence} />, root);
  show(null);
  startMesher(app);
  if (import.meta.env.PROD) setupOffline(app); // not in development, where there is no service worker
  // bring back the last toy and start saving; the screen is already up while this happens
  startPersistence(app).then(show, () => show(null));
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__sketch3d = { app, latestMesh, screenOf: (p: [number, number, number]) => viewportRef.current?.screenOf(p) ?? null, cameraDistance: () => viewportRef.current?.camera.distance ?? 0 }; // lets the browser tests look inside
}
