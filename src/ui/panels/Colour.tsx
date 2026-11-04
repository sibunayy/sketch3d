import { PALETTE } from '../../core/doc/partOps';
import { copy } from '../copy';

/** A grid of colour chips. Each chip is a full-size button. */
export function Colour({ value, onPick }: { value: string | 'mixed'; onPick: (colour: string) => void }) {
  return (
    <div class="colour" role="group" aria-label={copy.labelColour}>
      <strong>{copy.labelColour}</strong>
      <div class="swatches">
        {PALETTE.map((c, i) => (
          <button
            key={c}
            type="button"
            class={`swatch ${value.toLowerCase() === c ? 'on' : ''}`}
            style={{ background: c }}
            aria-label={`${copy.labelColour} ${i + 1}`}
            aria-pressed={value.toLowerCase() === c}
            onClick={() => onPick(c)}
          />
        ))}
      </div>
    </div>
  );
}
