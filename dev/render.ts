// Test page for the 3D viewport. Playwright drives window.sketch3dRenderTest from tests/e2e/render.spec.ts.
import legacyV2 from '../tests/fixtures/legacy-v2.json';
import { migrate } from '../src/core/doc/migrate';
import { meshDocument } from '../src/worker/meshJob';
import { Viewport } from '../src/render/viewport';

const canvas = document.getElementById('view') as HTMLCanvasElement;
const lostButton = document.getElementById('lost') as HTMLButtonElement;
const viewport = new Viewport(canvas);
const doc = migrate(structuredClone(legacyV2));

viewport.onContextLost(() => {
  lostButton.style.display = 'block';
});
lostButton.addEventListener('click', () => {
  viewport.restart();
});
canvas.addEventListener('webglcontextrestored', () => {
  lostButton.style.display = 'none';
});

const api = {
  async show() {
    const mesh = await meshDocument(doc, 1.2, 'draft', {});
    if (!mesh) throw new Error('no mesh');
    viewport.setMesh(mesh, doc.parts.map((p) => p.color));
    viewport.fit({ min: [-30, 0, -15], max: [30, 60, 15] });
    return viewport.pixelStats();
  },
  stats: () => viewport.pixelStats(),
  loseContext() {
    canvas.getContext('webgl2')?.getExtension('WEBGL_lose_context')?.loseContext();
  },
  isLost: () => viewport.contextLost,
  orbitDistance: () => viewport.camera.distance,
};
(window as unknown as { sketch3dRenderTest: typeof api }).sketch3dRenderTest = api;
document.title = 'ready';
