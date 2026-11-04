import type { Store } from '../../app/state';
import { Button } from '../components/Button';
import { copy } from '../copy';

/** Every part, in the order they were made. Tap one to pick it. */
export function Layers({ store }: { store: Store }) {
  const doc = store.doc.value;
  const selection = store.selection.value;
  const multi = store.multi.value;
  return (
    <div class="layers">
      <div class="layers-head">
        <strong>{copy.panelParts}</strong>
        <Button label={copy.btnPickSeveral} on={multi} onClick={() => (store.multi.value = !multi)} />
      </div>
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
    </div>
  );
}
