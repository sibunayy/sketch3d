import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';

// GitHub Pages serves this project at /sketch3d/, so production builds need that base path.
export default defineConfig(({ command }) => ({
  base: command === 'build' ? '/sketch3d/' : '/',
  plugins: [preact()],
  build: {
    target: 'es2020',
    sourcemap: false,
  },
  // The mesher worker is emitted as its own chunk (see Task 7).
  worker: { format: 'es' },
}));
