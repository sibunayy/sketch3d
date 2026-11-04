import { defineConfig } from 'vite';
import preact from '@preact/preset-vite';
import { VitePWA } from 'vite-plugin-pwa';

// GitHub Pages serves this project at /sketch3d/, so production builds need that base path.
export default defineConfig(({ command, isPreview }) => ({
  base: command === 'build' || isPreview ? '/sketch3d/' : '/', // previewing the build must use the same path as the build
  plugins: [
    preact(),
    VitePWA({
      // The page asks first, then restarts ("Update ready. Tap to restart."), so a child is never interrupted.
      registerType: 'prompt',
      injectRegister: false, // src/app/pwa.ts registers it, and only where service workers exist
      includeAssets: ['icons/*.webp', 'icons/*.png'],
      manifest: {
        name: 'Sketch3D',
        short_name: 'Sketch3D',
        description: 'Draw shapes, build a toy, and save it to 3D print.',
        start_url: './',
        scope: './',
        display: 'standalone',
        background_color: '#eef1f4',
        theme_color: '#2154c9',
        icons: [
          { src: 'icons/pwa-192.png', sizes: '192x192', type: 'image/png' },
          { src: 'icons/pwa-512.png', sizes: '512x512', type: 'image/png' },
          { src: 'icons/pwa-512.png', sizes: '512x512', type: 'image/png', purpose: 'maskable' },
        ],
      },
      workbox: {
        // keep everything the app needs, including the mesher worker, so it opens with no network
        globPatterns: ['**/*.{js,css,html,webp,png,webmanifest}'],
        navigateFallback: 'index.html',
        cleanupOutdatedCaches: true,
      },
      devOptions: { enabled: false },
    }),
  ],
  build: {
    target: 'es2020',
    sourcemap: false,
  },
  // The mesher worker is emitted as its own chunk.
  worker: { format: 'es' },
}));
