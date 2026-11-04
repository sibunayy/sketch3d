import type { Store } from '../../app/state';
import { copy } from '../copy';
import { Layers } from './Layers';
import { ActionButtons, ColourFields, MeltFields, ShapeFields, StretchFields, TurnFields, usePartEditing } from './partFields';

/**
 * All the settings for the picked part, or for all the picked parts at once, in one list.
 * Narrow screens show this in a sheet; wide screens use the context bar instead (see ContextBar.tsx).
 */
export function Inspector({ store }: { store: Store }) {
  const e = usePartEditing(store);
  const { parts } = e;

  if (parts.length === 0) {
    return (
      <div class="inspector-body">
        <p class="hint">{copy.inspectorEmpty}</p>
        <Layers store={store} />
      </div>
    );
  }

  return (
    <div class="inspector-body">
      <h2>{parts.length === 1 ? parts[0].name : copy.panelSeveral.replace('{n}', String(parts.length))}</h2>
      <ShapeFields e={e} />
      <MeltFields e={e} />
      <div class="field">
        <TurnFields e={e} />
      </div>
      <StretchFields e={e} />
      <ColourFields e={e} />
      <div class="row">
        <ActionButtons e={e} />
      </div>
      <Layers store={store} />
    </div>
  );
}
