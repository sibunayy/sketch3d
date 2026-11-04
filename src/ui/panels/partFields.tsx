import type { Store } from '../../app/state';
import { BLEND_STEPS, ROUND_STEPS, applyPatch, commonValue, copyParts, deleteParts, nearestRound } from '../../core/doc/edit';
import type { PartPatch } from '../../core/doc/edit';
import { effectiveParts } from '../../core/geom/scene';
import { Button } from '../components/Button';
import { Segmented } from '../components/Segmented';
import { Slider } from '../components/Slider';
import { copy } from '../copy';
import { Colour } from './Colour';

/**
 * Everything the part settings need to read and change the picked parts. A value that differs between
 * the picked parts shows "Mixed"; moving its control sets them all to the same value.
 */
export function usePartEditing(store: Store) {
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
  return { store, ids, parts, live, finish, set };
}
export type PartEditing = ReturnType<typeof usePartEditing>;

const show = (v: number | 'mixed', fallback: number) => (v === 'mixed' ? fallback : v);
const ROUND_NAMES: Record<number, string> = { 0.04: copy.roundSquare, 0.4: copy.roundSoft, 0.8: copy.roundRound, 1: copy.roundPill };

/** How round and how thick. */
export function ShapeFields({ e }: { e: PartEditing }) {
  const { parts, live, finish, set } = e;
  const round = commonValue(parts, (p) => p.round);
  const thick = commonValue(parts, (p) => p.depthMm);
  return (
    <>
      <div class="field">
        <strong>{copy.labelRound}</strong>
        <Segmented<string>
          label={copy.labelRound}
          value={round === 'mixed' ? '' : String(nearestRound(round))}
          options={ROUND_STEPS.map((s) => ({ value: String(s), label: ROUND_NAMES[s] }))}
          onChange={(v) => set('Change roundness', { round: Number(v) })}
        />
      </div>
      <Slider
        label={copy.labelThick}
        value={show(thick, parts[0].depthMm)}
        min={2}
        max={80}
        unit="mm"
        display={thick === 'mixed' ? copy.mixed : undefined}
        onInput={(v) => live({ depthMm: v })}
        onCommit={(v) => finish('Change thickness', { depthMm: v })}
      />
    </>
  );
}

/** Squash and stretch, and the top thinner or wider. */
export function StretchFields({ e }: { e: PartEditing }) {
  const { parts, live, finish } = e;
  const squash = commonValue(parts, (p) => p.squash);
  const taper = commonValue(parts, (p) => p.taper);
  return (
    <>
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
    </>
  );
}

/** The three turns and a reset. */
export function TurnFields({ e, heading = true }: { e: PartEditing; heading?: boolean }) {
  const { parts, live, finish, set } = e;
  const angle = (label: string, key: 'x' | 'y' | 'z') => {
    const value = commonValue(parts, (p) => p.rot[key]);
    return (
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
  };
  return (
    <>
      {heading && <strong>{copy.labelTurnGroup}</strong>}
      {angle(copy.labelSpin, 'z')}
      {angle(copy.labelTurn, 'y')}
      {angle(copy.labelTilt, 'x')}
      <Button label={copy.btnResetTurn} onClick={() => set('Reset turn', { rot: { x: 0, y: 0, z: 0 } })} />
    </>
  );
}

/** How much a part melts into the ones it touches. */
export function MeltFields({ e }: { e: PartEditing }) {
  const { parts, set } = e;
  const meltAll = commonValue(parts, (p) => p.melt);
  const blend = commonValue(parts, (p) => p.blend);
  const value =
    meltAll === 'mixed' || blend === 'mixed'
      ? ''
      : meltAll === false
        ? 'off'
        : String(BLEND_STEPS.reduce((b, s) => (Math.abs(s - blend) < Math.abs(b - blend) ? s : b)));
  return (
    <div class="field">
      <strong>{copy.labelMelt}</strong>
      <Segmented<string>
        label={copy.labelMelt}
        value={value}
        options={[
          { value: 'off', label: copy.meltOff },
          { value: '3', label: copy.meltLittle },
          { value: '8', label: copy.meltSome },
          { value: '15', label: copy.meltLot },
        ]}
        onChange={(v) => set('Change melt', v === 'off' ? { melt: false } : { melt: true, blend: Number(v) })}
      />
    </div>
  );
}

/** The colour chips. */
export function ColourFields({ e }: { e: PartEditing }) {
  const colour = commonValue(e.parts, (p) => p.color);
  return <Colour value={colour} onPick={(c) => e.set('Change colour', { color: c })} />;
}

/** Make a copy, and delete. */
export function ActionButtons({ e }: { e: PartEditing }) {
  const { store, ids } = e;
  return (
    <>
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
    </>
  );
}
