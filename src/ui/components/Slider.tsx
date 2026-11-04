import { useRef } from 'preact/hooks';

let nextSliderId = 1;

export interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step?: number;
  /** Shown after the number, such as "mm". */
  unit?: string;
  /** Shown instead of the number, such as "Mixed". */
  display?: string;
  /** Called on every move while dragging. */
  onInput: (value: number) => void;
  /** Called once when the finger lets go. */
  onCommit: (value: number) => void;
}

/** A slider with a big thumb, a live value, and one "done" moment when let go. */
export function Slider({ label, value, min, max, step = 1, unit = '', display, onInput, onCommit }: SliderProps) {
  // unique per slider, because the same panel can be on the page twice (side panel and sheet)
  const id = useRef(`slider-${nextSliderId++}`).current;
  return (
    <div class="slider">
      <label for={id}>
        <span>{label}</span>
        <strong>{display ?? `${Math.round(value * 10) / 10}${unit ? ` ${unit}` : ''}`}</strong>
      </label>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onInput={(e) => onInput(Number((e.currentTarget as HTMLInputElement).value))}
        onChange={(e) => onCommit(Number((e.currentTarget as HTMLInputElement).value))}
      />
    </div>
  );
}
