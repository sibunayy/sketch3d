import js from '@eslint/js';
import globals from 'globals';
import tseslint from 'typescript-eslint';

// Browser APIs that must never appear in src/core (it runs in a worker and in plain Node tests).
const DOM_GLOBALS = [
  'window', 'document', 'navigator', 'location', 'localStorage', 'sessionStorage',
  'indexedDB', 'requestAnimationFrame', 'cancelAnimationFrame', 'HTMLElement',
  'HTMLCanvasElement', 'CanvasRenderingContext2D', 'Image', 'Worker', 'Blob', 'File',
  'PointerEvent', 'MouseEvent', 'TouchEvent', 'Event',
];

export default tseslint.config(
  { ignores: ['dist', 'legacy', 'node_modules', 'playwright-report', 'test-results'] },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    files: ['src/**/*.{ts,tsx}'],
    languageOptions: { globals: globals.browser },
  },
  {
    files: ['*.{js,ts}', 'scripts/**/*.{ts,mjs}', 'tests/**/*.ts'],
    languageOptions: { globals: { ...globals.node } },
  },
  {
    // src/core is pure TypeScript: no three.js, no Preact, no DOM.
    files: ['src/core/**/*.ts'],
    languageOptions: { globals: {} },
    rules: {
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            { group: ['three', 'three/*'], message: 'src/core must not import three.js.' },
            { group: ['preact', 'preact/*', '@preact/*'], message: 'src/core must not import Preact.' },
          ],
        },
      ],
      'no-restricted-globals': [
        'error',
        ...DOM_GLOBALS.map((name) => ({ name, message: 'src/core must not use DOM globals.' })),
      ],
    },
  },
);
