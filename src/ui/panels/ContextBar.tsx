import { useState } from 'preact/hooks';
import type { Store } from '../../app/state';
import { Button } from '../components/Button';
import { copy } from '../copy';
import { ActionButtons, ColourFields, MeltFields, ShapeFields, StretchFields, TurnFields, usePartEditing } from './partFields';

type Group = 'shape' | 'stretch' | 'turn' | 'melt' | 'colour';

const GROUPS: { id: Group; label: string }[] = [
  { id: 'shape', label: copy.tabShape },
  { id: 'stretch', label: copy.tabStretch },
  { id: 'turn', label: copy.tabTurn },
  { id: 'melt', label: copy.tabMelt },
  { id: 'colour', label: copy.tabColour },
];

/** Every part as a chip in one scrolling row. Tap one to pick it. */
function PartsStrip({ store }: { store: Store }) {
  const doc = store.doc.value;
  const selection = store.selection.value;
  const multi = store.multi.value;
  return (
    <div class="partsstrip">
      <strong class="strip-title">{copy.panelParts}</strong>
      <ul>
        {doc.parts.map((p) => (
          <li key={p.id}>
            <button
              type="button"
              class={`layer ${selection.has(p.id) ? 'on' : ''}`}
              aria-pressed={selection.has(p.id)}
              onClick={() => store.select([p.id], multi)}
            >
              <i style={{ background: p.cut ? 'transparent' : p.color, borderStyle: p.cut ? 'dashed' : 'solid' }} />
              <span>{p.name}</span>
              {p.cut && <small>{copy.hole}</small>}
            </button>
          </li>
        ))}
      </ul>
      <Button label={copy.btnPickSeveral} on={multi} onClick={() => (store.multi.value = !multi)} />
    </div>
  );
}

/**
 * The part settings for wide screens, in a bar under the toy. Pick a part, then choose what to change:
 * only that group's controls show, large and close to the drawing. Nothing is hidden at the side.
 */
export function ContextBar({ store }: { store: Store }) {
  const [picked, setGroup] = useState<Group>('shape');
  const e = usePartEditing(store);
  const has = e.parts.length > 0;
  // a shape opened from a file keeps its own form, so it has no Shape or Stretch settings
  const fromFile = has && e.parts.every((p) => p.kind === 'import');
  const groups = fromFile ? GROUPS.filter((g) => g.id !== 'shape' && g.id !== 'stretch') : GROUPS;
  const group = groups.some((g) => g.id === picked) ? picked : groups[0].id;

  return (
    <section class="contextbar" aria-label={copy.labelContextBar}>
      <PartsStrip store={store} />
      <div class="ctx-tabs" role="group" aria-label={copy.labelWhatToChange}>
        {groups.map((g) => (
          <button
            key={g.id}
            type="button"
            class="ctx-tab"
            aria-pressed={has && group === g.id}
            disabled={!has}
            onClick={() => setGroup(g.id)}
          >
            {g.label}
          </button>
        ))}
        <span class="spacer" />
        {has && (
          <span class="ctx-name">{e.parts.length === 1 ? e.parts[0].name : copy.panelSeveral.replace('{n}', String(e.parts.length))}</span>
        )}
        {has && <ActionButtons e={e} />}
      </div>
      <div class="ctx-options" data-group={has ? group : 'none'}>
        {!has && <p class="hint">{copy.inspectorEmpty}</p>}
        {has && group === 'shape' && <ShapeFields e={e} />}
        {has && group === 'stretch' && <StretchFields e={e} />}
        {has && group === 'turn' && <TurnFields e={e} heading={false} />}
        {has && group === 'melt' && <MeltFields e={e} />}
        {has && group === 'colour' && <ColourFields e={e} />}
      </div>
    </section>
  );
}
