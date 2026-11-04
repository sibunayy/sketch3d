import { describe, expect, it } from 'vitest';
import { GestureRecogniser, TAP_PX, isTap } from '../../src/views2d/gestures';
import type { PointerLike } from '../../src/views2d/gestures';

let t = 0;
const ev = (type: PointerLike['type'], id: number, kind: PointerLike['pointerType'], x = 0, y = 0, button = 0): PointerLike => ({
  type,
  pointerId: id,
  pointerType: kind,
  x,
  y,
  button,
  time: (t += 16),
});

describe('GestureRecogniser: one finger', () => {
  it('a finger is a stroke', () => {
    const g = new GestureRecogniser();
    expect(g.feed(ev('pointerdown', 1, 'touch', 10, 10))).toBe('stroke');
    expect(g.feed(ev('pointermove', 1, 'touch', 30, 40))).toBe('stroke');
    expect(g.feed(ev('pointerup', 1, 'touch', 30, 40))).toBe('none');
  });

  it('a mouse is a stroke, and the right or middle button pans', () => {
    const g = new GestureRecogniser();
    expect(g.feed(ev('pointerdown', 1, 'mouse', 0, 0, 0))).toBe('stroke');
    g.feed(ev('pointerup', 1, 'mouse'));
    expect(g.feed(ev('pointerdown', 2, 'mouse', 0, 0, 2))).toBe('pan');
    g.feed(ev('pointerup', 2, 'mouse'));
    expect(g.feed(ev('pointerdown', 3, 'mouse', 0, 0, 1))).toBe('pan');
  });
});

describe('GestureRecogniser: review focus 5 (iPad touch quirks)', () => {
  it('a second finger landing during a stroke cancels the stroke without committing it, and starts a pinch', () => {
    const g = new GestureRecogniser();
    g.feed(ev('pointerdown', 1, 'touch', 10, 10));
    g.feed(ev('pointermove', 1, 'touch', 40, 40));
    expect(g.feed(ev('pointerdown', 2, 'touch', 100, 100))).toBe('pinch');
    expect(g.strokeCancelled).toBe(true);
    expect(g.feed(ev('pointermove', 2, 'touch', 120, 120))).toBe('pinch');
    expect(g.feed(ev('pointermove', 1, 'touch', 50, 50))).toBe('pinch');
  });

  it('after a pinch, the finger left on the screen does not start drawing', () => {
    const g = new GestureRecogniser();
    g.feed(ev('pointerdown', 1, 'touch', 10, 10));
    g.feed(ev('pointerdown', 2, 'touch', 100, 100));
    expect(g.feed(ev('pointerup', 2, 'touch'))).toBe('none');
    expect(g.feed(ev('pointermove', 1, 'touch', 80, 80))).toBe('none');
    g.feed(ev('pointerup', 1, 'touch'));
    expect(g.feed(ev('pointerdown', 3, 'touch', 5, 5))).toBe('stroke'); // a fresh touch draws again
    expect(g.strokeCancelled).toBe(false);
  });

  it('two fingers landing together is a pinch, not a stroke', () => {
    const g = new GestureRecogniser();
    g.feed(ev('pointerdown', 1, 'touch', 10, 10));
    expect(g.feed(ev('pointerdown', 2, 'touch', 60, 10))).toBe('pinch');
  });

  it('a pen stroke ignores simultaneous touch pointers (palm rejection)', () => {
    const g = new GestureRecogniser();
    expect(g.feed(ev('pointerdown', 1, 'pen', 50, 50))).toBe('stroke');
    expect(g.feed(ev('pointerdown', 2, 'touch', 300, 300))).toBe('stroke'); // palm: nothing changes
    expect(g.strokeCancelled).toBe(false);
    expect(g.feed(ev('pointermove', 2, 'touch', 310, 310))).toBe('stroke');
    expect(g.feed(ev('pointermove', 1, 'pen', 60, 60))).toBe('stroke');
    expect(g.feed(ev('pointerup', 2, 'touch'))).toBe('stroke');
    expect(g.feed(ev('pointerup', 1, 'pen'))).toBe('none');
  });

  it('a palm that landed first does not stop the pen from drawing', () => {
    const g = new GestureRecogniser();
    g.feed(ev('pointerdown', 2, 'touch', 300, 300));
    expect(g.feed(ev('pointerdown', 1, 'pen', 50, 50))).toBe('stroke');
    expect(g.strokeCancelled).toBe(false);
    expect(g.activePointerForStroke).toBe(1);
  });

  it('a lost pointer (pointercancel) ends the gesture', () => {
    const g = new GestureRecogniser();
    g.feed(ev('pointerdown', 1, 'touch', 10, 10));
    expect(g.feed(ev('pointercancel', 1, 'touch'))).toBe('none');
    expect(g.strokeCancelled).toBe(true);
  });

  it('ignores events for pointers it never saw go down', () => {
    const g = new GestureRecogniser();
    expect(g.feed(ev('pointermove', 9, 'touch', 1, 1))).toBe('none');
    expect(g.feed(ev('pointerup', 9, 'touch'))).toBe('none');
  });
});

describe('taps', () => {
  it('a stroke shorter than 6 px is treated as a tap, not a shape', () => {
    expect(TAP_PX).toBe(6);
    expect(isTap([[10, 10], [12, 11], [13, 12]])).toBe(true);
    expect(isTap([[10, 10]])).toBe(true);
    expect(isTap([[10, 10], [40, 10]])).toBe(false);
  });

  it('a long wiggle that ends where it began is not a tap', () => {
    expect(isTap([[0, 0], [30, 0], [30, 30], [0, 30], [1, 1]])).toBe(false);
  });
});
