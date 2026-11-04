import { useState } from 'preact/hooks';
import type { Store, ViewName } from '../app/state';
import { Segmented } from './components/Segmented';
import { Button } from './components/Button';
import { IconButton } from './components/IconButton';
import { Sheet } from './components/Sheet';
import { Toasts } from './components/Toast';
import { copy } from './copy';
import { DrawCanvas } from './DrawCanvas';
import { ThreeView } from './ThreeView';
import { SHAPE_NAMES, createTool } from '../views2d/tools';

const TOOLS: { id: string; icon: string; label: string }[] = [
  { id: 'select', icon: 'select', label: copy.toolSelect },
  { id: 'draw', icon: 'draw', label: copy.toolDraw },
  { id: 'shape:circle', icon: 'circle', label: copy.toolShapes },
  { id: 'hole:circle', icon: 'holeC', label: copy.toolHoles },
  { id: 'limb', icon: 'limb', label: copy.toolLimb },
  { id: 'reshape', icon: 'reshape', label: copy.toolReshape },
  { id: 'size', icon: 'size', label: copy.toolSize },
  { id: 'turn', icon: 'turn', label: copy.toolTurn },
  { id: 'eyes', icon: 'eyes', label: copy.toolEyes },
  { id: 'smile', icon: 'smile', label: copy.toolSmile },
  { id: 'crease', icon: 'crease', label: copy.toolCrease },
  { id: 'erase', icon: 'erase', label: copy.toolErase },
];

/** Shapes and holes are families of tools: the button stays on for any of them. */
function isOn(current: string, id: string): boolean {
  if (id.startsWith('shape:')) return current.startsWith('shape:');
  if (id.startsWith('hole:')) return current.startsWith('hole:');
  return current === id;
}

/** The little row of shapes (or holes) to choose from. */
function Picker({ store }: { store: Store }) {
  const tool = store.tool.value;
  if (tool.startsWith('shape:')) {
    return (
      <div class="picker" role="group" aria-label={copy.toolShapes}>
        {SHAPE_NAMES.map((n) => (
          <IconButton key={n} icon={n} label={n[0].toUpperCase() + n.slice(1)} on={tool === 'shape:' + n} onClick={() => (store.tool.value = 'shape:' + n)} />
        ))}
      </div>
    );
  }
  if (tool.startsWith('hole:')) {
    return (
      <div class="picker" role="group" aria-label={copy.toolHoles}>
        <IconButton icon="holeC" label={copy.holeRound} on={tool === 'hole:circle'} onClick={() => (store.tool.value = 'hole:circle')} />
        <IconButton icon="holeB" label={copy.holeSlot} on={tool === 'hole:box'} onClick={() => (store.tool.value = 'hole:box')} />
      </div>
    );
  }
  return <div class="picker" />; // kept even when empty, so nothing around it moves
}

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
          <IconButton key={t.id} icon={t.icon} label={t.label} on={isOn(store.tool.value, t.id)} onClick={() => (store.tool.value = t.id)} testId={`tool-${t.id}`} />
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
            <Picker store={store} />
          </div>
          <div class="draw-area">
            <DrawCanvas store={store} view={view === 'side' ? 'side' : 'front'} key={view === 'side' ? 'side' : 'front'} />
          </div>
          <p class="toolhint" data-testid="hint">{store.doc.value.parts.length === 0 && store.tool.value === 'select' ? copy.emptyToy : hintFor(store.tool.value, store)}</p>
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

/** The short help line for the chosen tool. */
function hintFor(tool: string, store: Store): string {
  return createTool(tool, store, () => {}).hint;
}
