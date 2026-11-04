import { useEffect, useRef, useState } from 'preact/hooks';
import { latestMesh } from '../app/mesher';
import { Viewport } from '../render/viewport';
import { copy } from './copy';

/** The 3D picture of the toy. */
export function ThreeView() {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef = useRef<Viewport | null>(null);
  const [lost, setLost] = useState(false);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    let viewport: Viewport;
    try {
      viewport = new Viewport(canvas);
    } catch {
      setLost(true); // no 3D available on this device
      return;
    }
    viewportRef.current = viewport;
    viewport.onContextLost(() => setLost(true));
    canvas.addEventListener('webglcontextrestored', () => setLost(false));
    const watch = new ResizeObserver(() => viewport.resize());
    watch.observe(canvas);
    return () => {
      watch.disconnect();
      viewport.dispose();
      viewportRef.current = null;
    };
  }, []);

  const shown = latestMesh.value;
  useEffect(() => {
    if (shown) viewportRef.current?.setMesh(shown.mesh, shown.colors);
  }, [shown]);

  return (
    <div class="three">
      <canvas ref={canvasRef} aria-label="3D view of your toy" />
      {lost && (
        <button type="button" class="btn primary lost" onClick={() => viewportRef.current?.restart()}>
          {copy.viewLost}
        </button>
      )}
    </div>
  );
}
