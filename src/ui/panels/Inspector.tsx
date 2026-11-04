import type { Store } from '../../app/state';
import { BLEND_STEPS, ROUND_STEPS, applyPatch, commonValue, copyParts, deleteParts, nearestRound } from '../../core/doc/edit';
import type { PartPatch } from '../../core/doc/edit';
import { effectiveParts } from '../../core/geom/scene';
import { Button } from '../components/Button';
import { Segmented } from '../components/Segmented';
import { Slider } from '../components/Slider';
import { copy } from '../copy';
import { Colour } from './Colour';
import { Layers } from './Layers';

/**
 * The settings for the picked part, or for all the picked parts at once. A value that differs between
 * them shows "Mixed"; moving its slider sets them all to the same value.
 */
export function Inspector({ store }: { store: Store }) {
  const doc = store.doc.value;
  const picked = store.selection.value;
  const ids = [...picked];
  const parts = effectiveParts(doc).filter((p) => picked.has(p.id));

  // while a slider moves, show the change at once; when it is let go, make it one undo step
  const live = (patch: PartPatch) => store.preview((d) => applyPatch(d, ids, patch));
  const finish = (label: string, patch: PartPatch) => {
    if (!store.commitPreview(label)) store.commit(label, (d) => applyPatch(d, ids, patch));
  };
  const set = (label: string, patch: PartPatch) => store.commit(label, (d) => applyPatch(d, ids, patch));

  if (parts.length === 0) {
    return (
      <div class="inspector-body">
        <p class="hint">{copy.inspectorEmpty}</p>
        <Layers store={store} />
      </div>
    );
  }

  const first = parts[0];
  const num = (read: (p: typeof first) => number) => commonValue(parts, read);
  const show = (v: number | 'mixed', fallback: number) => (v === 'mixed' ? fallback : v);

  const round = num((p) => p.round);
  const thick = num((p) => p.depthMm);
  const squash = num((p) => p.squash);
  const taper = num((p) => p.taper);
  const rotX = num((p) => p.rot.x);
  const rotY = num((p) => p.rot.y);
  const rotZ = num((p) => p.rot.z);
  const meltAll = commonValue(parts, (p) => p.melt);
  const blend = num((p) => p.blend);
  const colour = commonValue(parts, (p) => p.color);

  const meltValue = meltAll === 'mixed' || blend === 'mixed' ? '' : meltAll === false ? 'off' : String(BLEND_STEPS.reduce((b, s) => (Math.abs(s - blend) < Math.abs(b - blend) ? s : b)));
  const roundNames: Record<number, string> = { 0.04: copy.roundSquare, 0.4: copy.roundSoft, 0.8: copy.roundRound, 1: copy.roundPill };

  const angle = (label: string, key: 'x' | 'y' | 'z', value: number | 'mixed') => (
    <Slider
      label={label}
      value={show(value, 0)}
      min={-180}
      max={180}
      unit="°"
      display={value === 'mixed' ? copy.mixed : undefined}
      onInput={(v) => live({ rot: { [key]: v } })}
      onCommit={(v) => finish('Turn', { rot: { [key]: v } })}
    />
  );

  return (
    <div class="inspector-body">
      <h2>{parts.length === 1 ? parts[0].name : copy.panelSeveral.replace('{n}', String(parts.length))}</h2>

      <div class="field">
        <strong>{copy.labelRound}</strong>
        <Segmented<string>
          label={copy.labelRound}
          value={round === 'mixed' ? '' : String(nearestRound(round))}
          options={ROUND_STEPS.map((s) => ({ value: String(s), label: roundNames[s] }))}
          onChange={(v) => set('Change roundness', { round: Number(v) })}
        />
      </div>

      <Slider
        label={copy.labelThick}
        value={show(thick, first.depthMm)}
        min={2}
        max={80}
        unit="mm"
        display={thick === 'mixed' ? copy.mixed : undefined}
        onInput={(v) => live({ depthMm: v })}
        onCommit={(v) => finish('Change thickness', { depthMm: v })}
      />

      <div class="field">
        <strong>{copy.labelMelt}</strong>
        <Segmented<string>
          label={copy.labelMelt}
          value={meltValue}
          options={[
            { value: 'off', label: copy.meltOff },
            { value: '3', label: copy.meltLittle },
            { value: '8', label: copy.meltSome },
            { value: '15', label: copy.meltLot },
          ]}
          onChange={(v) => set('Change melt', v === 'off' ? { melt: false } : { melt: true, blend: Number(v) })}
        />
      </div>

      <div class="field">
        <strong>{copy.labelTurnGroup}</strong>
        {angle(copy.labelSpin, 'z', rotZ)}
        {angle(copy.labelTurn, 'y', rotY)}
        {angle(copy.labelTilt, 'x', rotX)}
        <Button label={copy.btnResetTurn} onClick={() => set('Reset turn', { rot: { x: 0, y: 0, z: 0 } })} />
      </div>

      <Slider
        label={copy.labelSquash}
        value={show(squash, 0)}
        min={-60}
        max={80}
        unit="%"
        display={squash === 'mixed' ? copy.mixed : undefined}
        onInput={(v) => live({ squash: v })}
        onCommit={(v) => finish('Squash or stretch', { squash: v })}
      />
      <Slider
        label={copy.labelTaper}
        value={show(taper, 0)}
        min={-100}
        max={100}
        unit="%"
        display={taper === 'mixed' ? copy.mixed : undefined}
        onInput={(v) => live({ taper: v })}
        onCommit={(v) => finish('Change taper', { taper: v })}
      />

      <Colour value={colour} onPick={(c) => set('Change colour', { color: c })} />

      <div class="row">
        <Button
          label={copy.btnCopy}
          onClick={() => {
            let made: string[] = [];
            if (store.commit('Make a copy', (d) => (made = copyParts(d, ids)))) {
              store.select(made);
              store.toast(copy.toastCopied);
            }
          }}
        />
        <Button
          label={copy.btnDelete}
          onClick={() => {
            if (store.commit('Delete', (d) => deleteParts(d, ids))) store.toast(copy.toastDeleted, { label: copy.btnUndo, run: store.undo });
          }}
        />
      </div>

      <Layers store={store} />
    </div>
  );
}
