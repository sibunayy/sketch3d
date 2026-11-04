import { render } from 'preact';
import { app } from './app/state';
import { startMesher } from './app/mesher';
import { Shell } from './ui/Shell';
import './ui/tokens.css';
import './ui/shell.css';

const root = document.getElementById('app');
if (root) {
  render(<Shell store={app} />, root);
  startMesher(app);
}
