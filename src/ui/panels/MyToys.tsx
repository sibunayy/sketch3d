import { useEffect, useRef, useState } from 'preact/hooks';
import type { Persistence } from '../../app/persist';
import { currentToyId } from '../../app/persist';
import type { ProjectMeta } from '../../storage/db';
import { PRESETS } from '../../core/doc/presets';
import { Button } from '../components/Button';
import { copy } from '../copy';

function when(t: number): string {
  try {
    return new Date(t).toLocaleDateString(undefined, { month: 'short', day: 'numeric' });
  } catch {
    return '';
  }
}

/** The saved toys. Tap one to open it. */
export function MyToys({ persistence, onClose }: { persistence: Persistence; onClose: () => void }) {
  const [items, setItems] = useState<(ProjectMeta & { url?: string })[] | null>(null);
  const [confirming, setConfirming] = useState<string | null>(null);
  const fileInput = useRef<HTMLInputElement>(null);

  const refresh = async () => {
    const list = await persistence.list();
    const withPictures = await Promise.all(
      list.map(async (m) => {
        const blob = await persistence.thumb(m.id);
        return { ...m, url: blob ? URL.createObjectURL(blob) : undefined };
      }),
    );
    setItems(withPictures);
  };

  useEffect(() => {
    void refresh();
  }, []);
  useEffect(() => () => items?.forEach((i) => i.url && URL.revokeObjectURL(i.url)), [items]);

  return (
    <div class="mytoys" role="dialog" aria-label={copy.panelMyToys}>
      <div class="mytoys-head">
        <h2>{copy.panelMyToys}</h2>
        <Button label={copy.btnClose} onClick={onClose} />
      </div>
      <div class="row">
        <Button
          label={copy.btnNewToy}
          variant="primary"
          onClick={async () => {
            await persistence.newToy();
            onClose();
          }}
        />
        <Button label={copy.btnOpenFile} onClick={() => fileInput.current?.click()} />
        <Button label={copy.btnSaveFile} onClick={() => persistence.saveFile()} />
        <input
          ref={fileInput}
          type="file"
          accept=".json,application/json"
          hidden
          onChange={async (e) => {
            const file = (e.currentTarget as HTMLInputElement).files?.[0];
            (e.currentTarget as HTMLInputElement).value = '';
            if (file) {
              await persistence.openFile(file);
              onClose();
            }
          }}
        />
      </div>

      <h3>{copy.panelPresets}</h3>
      <ul class="toylist presets">
        {PRESETS.filter((p) => p.id !== 'blank').map((p) => (
          <li key={p.id}>
            <div class="toyinfo">
              <strong>{p.name}</strong>
              <span>{p.description}</span>
            </div>
            <Button
              label={copy.btnUsePreset}
              onClick={async () => {
                await persistence.newToy(p.make());
                onClose();
              }}
            />
          </li>
        ))}
      </ul>

      <h3>{copy.panelMyToys}</h3>
      {items && items.length === 0 && <p class="hint">{copy.noToys}</p>}
      <ul class="toylist">
        {items?.map((m) => (
          <li key={m.id} class={m.id === currentToyId.value ? 'current' : ''}>
            {m.url ? <img src={m.url} alt="" width={64} height={64} /> : <span class="nopic" />}
            <div class="toyinfo">
              <strong>{m.name}</strong>
              <span>
                {(m.parts === 1 ? copy.partsOne : copy.partsMany).replace('{n}', String(m.parts))} · {when(m.updatedAt)}
              </span>
            </div>
            {confirming === m.id ? (
              <>
                <Button
                  label={copy.btnReallyDelete}
                  onClick={async () => {
                    await persistence.remove(m.id);
                    setConfirming(null);
                    await refresh();
                  }}
                />
                <Button label={copy.btnKeep} onClick={() => setConfirming(null)} />
              </>
            ) : (
              <>
                <Button
                  label={copy.btnOpen}
                  onClick={async () => {
                    await persistence.open(m.id);
                    onClose();
                  }}
                />
                <Button label={copy.btnDeleteToy} onClick={() => setConfirming(m.id)} />
              </>
            )}
          </li>
        ))}
      </ul>
    </div>
  );
}
