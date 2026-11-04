import { render } from 'preact';
import { app } from './app/state';
import { latestMesh, startMesher } from './app/mesher';
import { viewportRef } from './app/viewportRef';
import { Shell } from './ui/Shell';
import './ui/tokens.css';
import './ui/shell.css';

const root = document.getElementById('app');
if (root) {
  render(<Shell store={app} />, root);
  startMesher(app);
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__sketch3d = { app, latestMesh, screenOf: (p: [number, number, number]) => viewportRef.current?.screenOf(p) ?? null, cameraDistance: () => viewportRef.current?.camera.distance ?? 0 }; // lets the browser tests look inside
}
