import { render } from 'preact';

function App() {
  return <h1>Sketch3D</h1>;
}

const root = document.getElementById('app');
if (root) render(<App />, root);
