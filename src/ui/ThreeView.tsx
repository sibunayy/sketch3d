import { useEffect, useRef, useState } from 'preact/hooks';
import { Edit3D } from '../app/edit3d';
import { latestMesh } from '../app/mesher';
import type { Mode3d, Store } from '../app/state';
import { viewportRef } from '../app/viewportRef';
import type { DabType } from '../core/doc/types';
import type { SculptSize, SculptStrength } from '../core/doc/sculpt';
import { Viewport } from '../render/viewport';
import { BUILD_MM } from '../core/doc/types';
import { meshSize } from '../core/print/check';
import { Button } from './components/Button';
import { Segmented } from './components/Segmented';
import { PALETTE } from '../core/doc/partOps';
import { copy } from './copy';

/** The 3D picture of the toy, with the tools for moving, sculpting and painting it. */
export function ThreeView({ store }: { store: Store }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const viewportRef_ = useRef<Viewport | null>(null);
  const editRef = useRef<Edit3D | null>(null);
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
    viewportRef_.current = viewport;
    viewportRef.current = viewport;
    editRef.current = new Edit3D(viewport, store, () => latestMesh.value?.mesh ?? null);
    viewport.onContextLost(() => setLost(true));
    canvas.addEventListener('webglcontextrestored', () => setLost(false));
    const watch = new ResizeObserver(() => viewport.resize());
    watch.observe(canvas);
    return () => {
      watch.disconnect();
      editRef.current?.dispose();
      editRef.current = null;
      viewport.dispose();
      viewportRef_.current = null;
      viewportRef.current = null;
    };
  }, [store]);

  const shown = latestMesh.value;
  const framed = useRef(false);
  useEffect(() => {
    if (!shown) return;
    const vp = viewportRef_.current;
    vp?.setMesh(shown.mesh, shown.colors);
    // the first time there is something to see, frame it; after that the child is in charge of the camera
    if (vp && !framed.current && shown.mesh.positions.length > 0) {
      vp.fitMesh(shown.mesh);
      framed.current = true;
    }
  }, [shown]);

  // keep the handles in step with what is picked and what the toy looks like
  const doc = store.doc.value;
  const selection = store.selection.value;
  const mode = store.mode3d.value;
  useEffect(() => {
    editRef.current?.refresh();
  }, [doc, selection, mode]);

  const gizmoOn = mode === 'view' && selection.size === 1;
  // how big the toy is, so the child can see it against the limit
  const size = shown && shown.mesh.positions.length > 0 ? meshSize(shown.mesh) : null;
  const tooBig = !!size && Math.max(size.w, size.h, size.d) > BUILD_MM + 0.5;
  const tip = mode === 'sculpt' ? copy.tipSculpt : mode === 'paint' ? copy.tipPaint : gizmoOn ? copy.tipGizmo : copy.tipPick;

  return (
    <div class="three-wrap">
      <div class="pane-bar">
        <Segmented<Mode3d>
          label={copy.labelModes}
          value={mode}
          options={[
            { value: 'view', label: copy.modeMove },
            { value: 'sculpt', label: copy.modeSculpt },
            { value: 'paint', label: copy.modePaint },
          ]}
          onChange={(m) => (store.mode3d.value = m)}
        />
        <div class="picker">
          {mode === 'sculpt' && <SculptOptions store={store} />}
          {mode === 'paint' && <PaintOptions store={store} />}
          {mode === 'view' && (
            <>
              <Button
                label={copy.viewHome}
                onClick={() => {
                  const m = latestMesh.value?.mesh;
                  if (m && m.positions.length) viewportRef_.current?.fitMesh(m);
                  else viewportRef_.current?.setCameraPreset('home');
                }}
              />
              <Button label={copy.viewFront} onClick={() => viewportRef_.current?.setCameraPreset('front')} />
              <Button label={copy.viewSide} onClick={() => viewportRef_.current?.setCameraPreset('side')} />
              <Button label={copy.viewTop} onClick={() => viewportRef_.current?.setCameraPreset('top')} />
            </>
          )}
        </div>
      </div>
      <div class="three">
        <canvas ref={canvasRef} aria-label="3D view of your toy" />
        {size && (
          <div class={`sizebadge ${tooBig ? 'warn' : ''}`} data-testid="size" data-toobig={tooBig}>
            {copy.sizeIs}: {Math.round(size.w)} × {Math.round(size.h)} × {Math.round(size.d)} mm{tooBig ? `. ${copy.sizeTooBig}` : ''}
          </div>
        )}
        {lost && (
          <button type="button" class="btn primary lost" onClick={() => viewportRef_.current?.restart()}>
            {copy.viewLost}
          </button>
        )}
      </div>
      <p class="toolhint">
        {gizmoOn && <span data-testid="gizmo" data-active={editRef.current?.active ?? 'move'} />}
        {tip}
      </p>
    </div>
  );
}

function SculptOptions({ store }: { store: Store }) {
  const tools: { value: DabType; label: string }[] = [
    { value: 'pull', label: copy.sculptPull },
    { value: 'push', label: copy.sculptPush },
    { value: 'smooth', label: copy.sculptSmooth },
    { value: 'grab', label: copy.sculptGrab },
  ];
  return (
    <>
      <Segmented<DabType> label={copy.labelSculptTool} value={store.sculptTool.value} options={tools} onChange={(v) => (store.sculptTool.value = v)} />
      <Segmented<SculptSize>
        label={copy.labelSculptSize}
        value={store.sculptSize.value}
        options={[
          { value: 's', label: copy.sizeSmall },
          { value: 'm', label: copy.sizeMedium },
          { value: 'l', label: copy.sizeLarge },
        ]}
        onChange={(v) => (store.sculptSize.value = v)}
      />
      <Segmented<SculptStrength>
        label={copy.labelSculptStrength}
        value={store.sculptStrength.value}
        options={[
          { value: 'gentle', label: copy.strengthGentle },
          { value: 'firm', label: copy.strengthFirm },
        ]}
        onChange={(v) => (store.sculptStrength.value = v)}
      />
    </>
  );
}

function PaintOptions({ store }: { store: Store }) {
  return (
    <>
      <Button
        label={copy.btnFill}
        onClick={() => {
          const ids = [...store.selection.value];
          if (ids.length === 0) {
            store.toast(copy.toastPickFirst);
            return;
          }
          const colour = store.paintColour.value;
          store.commit('Fill', (d) => {
            for (const p of d.parts) if (ids.includes(p.id)) p.color = colour;
          });
        }}
      />
      <div class="swatches">
        {PALETTE.map((c, i) => (
          <button
            key={c}
            type="button"
            class={`swatch ${store.paintColour.value === c ? 'on' : ''}`}
            style={{ background: c }}
            aria-label={`${copy.labelColour} ${i + 1}`}
            aria-pressed={store.paintColour.value === c}
            onClick={() => (store.paintColour.value = c)}
          />
        ))}
      </div>
    </>
  );
}
