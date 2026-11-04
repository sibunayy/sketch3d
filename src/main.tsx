import { render } from 'preact';
import { app } from './app/state';
import { latestMesh, startMesher } from './app/mesher';
import { Shell } from './ui/Shell';
import './ui/tokens.css';
import './ui/shell.css';

const root = document.getElementById('app');
if (root) {
  render(<Shell store={app} />, root);
  startMesher(app);
  if (import.meta.env.DEV) (window as unknown as Record<string, unknown>).__sketch3d = { app, latestMesh }; // lets the browser tests look inside
}
