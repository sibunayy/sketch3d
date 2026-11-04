import { useState } from 'preact/hooks';
import type { Store, ViewName } from '../app/state';
import { Segmented } from './components/Segmented';
import { Button } from './components/Button';
import { IconButton } from './components/IconButton';
import { Sheet } from './components/Sheet';
import { Toasts } from './components/Toast';
import { copy } from './copy';
import { ThreeView } from './ThreeView';

const TOOLS: { id: string; icon: string; label: string }[] = [
  { id: 'select', icon: 'select', label: copy.toolSelect },
  { id: 'draw', icon: 'draw', label: copy.toolDraw },
  { id: 'limb', icon: 'limb', label: copy.toolLimb },
  { id: 'reshape', icon: 'reshape', label: copy.toolReshape },
  { id: 'size', icon: 'size', label: copy.toolSize },
  { id: 'turn', icon: 'turn', label: copy.toolTurn },
  { id: 'eyes', icon: 'eyes', label: copy.toolEyes },
  { id: 'smile', icon: 'smile', label: copy.toolSmile },
  { id: 'crease', icon: 'crease', label: copy.toolCrease },
  { id: 'erase', icon: 'erase', label: copy.toolErase },
];

/**
 * The whole screen. Wide screens show the tools, the drawing view, the 3D view and the part settings side by side.
 * Narrower or taller screens show one view at a time, with a Draw / 3D switch and the settings in a sheet.
 */
export function Shell({ store }: { store: Store }) {
  const view = store.view.value;
  const [sheetOpen, setSheetOpen] = useState(false);
  const showing3d = view === '3d';

  return (
    <div class="app" data-view={view}>
      <header class="topbar">
        <img src={`${import.meta.env.BASE_URL}icons/logo.webp`} alt="" width={40} height={40} />
        <h1>{copy.appName}</h1>
        <span class="spacer" />
        <Button label={copy.btnSaveToPrint} icon="savebig" variant="primary" onClick={() => store.toast(copy.working)} />
      </header>

      <nav class="rail" aria-label={copy.labelTools}>
        {TOOLS.map((t) => (
          <IconButton key={t.id} icon={t.icon} label={t.label} on={store.tool.value === t.id} onClick={() => (store.tool.value = t.id)} testId={`tool-${t.id}`} />
        ))}
      </nav>

      <main class="stage">
        <section class="pane pane-draw" data-active={!showing3d} aria-label="Drawing view">
          <div class="pane-bar">
            <Segmented<'front' | 'side'>
              label={copy.labelViews}
              value={view === 'side' ? 'side' : 'front'}
              options={[
                { value: 'front', label: copy.tabFront },
                { value: 'side', label: copy.tabSide },
              ]}
              onChange={(v) => (store.view.value = v as ViewName)}
            />
          </div>
          <div class="draw-area">
            <p class="hint">{store.doc.value.parts.length === 0 ? copy.emptyToy : ''}</p>
          </div>
        </section>

        <section class="pane pane-3d" data-active={showing3d} aria-label="3D view">
          <ThreeView />
        </section>

        <div class="history" role="group" aria-label={copy.labelHistory}>
          <IconButton icon="undo" label={copy.btnUndo} disabled={!store.canUndo.value} onClick={store.undo} testId="undo" />
          <IconButton icon="redo" label={copy.btnRedo} disabled={!store.canRedo.value} onClick={store.redo} testId="redo" />
        </div>
      </main>

      <aside class="inspector" aria-label="Part settings">
        <p class="hint">{copy.inspectorEmpty}</p>
      </aside>

      <div class="switch">
        <Segmented<'draw' | '3d'>
          label={copy.labelViews}
          value={showing3d ? '3d' : 'draw'}
          options={[
            { value: 'draw', label: copy.btnDraw },
            { value: '3d', label: copy.btnSee3d },
          ]}
          onChange={(v) => (store.view.value = v === '3d' ? '3d' : 'front')}
        />
        <Button label={copy.btnEditPart} onClick={() => setSheetOpen(true)} />
      </div>

      <Sheet open={sheetOpen} onClose={() => setSheetOpen(false)}>
        <p class="hint">{copy.inspectorEmpty}</p>
      </Sheet>

      <Toasts store={store} />
    </div>
  );
}
