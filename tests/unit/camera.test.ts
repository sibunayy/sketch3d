import { describe, expect, it, vi } from 'vitest';
import { MAX_DISTANCE, MAX_ELEVATION, MIN_DISTANCE, OrbitCamera } from '../../src/render/camera';
import { FrameScheduler } from '../../src/render/frameScheduler';

describe('OrbitCamera', () => {
  it('zoom clamps to the min and max distance', () => {
    const c = new OrbitCamera();
    for (let i = 0; i < 100; i++) c.zoom(0.5);
    expect(c.distance).toBe(MIN_DISTANCE);
    for (let i = 0; i < 100; i++) c.zoom(2);
    expect(c.distance).toBe(MAX_DISTANCE);
  });

  it('zoom ignores nonsense', () => {
    const c = new OrbitCamera();
    const d = c.distance;
    c.zoom(NaN);
    c.zoom(0);
    c.zoom(-3);
    expect(c.distance).toBe(d);
  });

  it('orbit clamps elevation so the model never flips', () => {
    const c = new OrbitCamera();
    for (let i = 0; i < 200; i++) c.orbit(0, 50);
    expect(c.elevation).toBeLessThanOrEqual(MAX_ELEVATION);
    for (let i = 0; i < 400; i++) c.orbit(0, -50);
    expect(c.elevation).toBeGreaterThanOrEqual(-MAX_ELEVATION);
  });

  it('orbit turns around the model: dragging right turns it, and the eye stays the same distance away', () => {
    const c = new OrbitCamera();
    const before = c.position();
    const d0 = Math.hypot(...before.map((v, i) => v - c.target[i]));
    c.orbit(100, 0);
    const after = c.position();
    expect(after[0]).not.toBeCloseTo(before[0], 3);
    expect(Math.hypot(...after.map((v, i) => v - c.target[i]))).toBeCloseTo(d0, 6);
  });

  it('pan moves the target sideways on screen, further when zoomed out', () => {
    const near = new OrbitCamera();
    near.zoom(0.3);
    const far = new OrbitCamera();
    far.zoom(3);
    const n0 = [...near.target];
    const f0 = [...far.target];
    near.pan(50, 0);
    far.pan(50, 0);
    const moved = (a: number[], b: number[]) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
    expect(moved(near.target, n0)).toBeGreaterThan(0);
    expect(moved(far.target, f0)).toBeGreaterThan(moved(near.target, n0));
  });

  it('presets look at the model from the front, side and top, and home resets everything', () => {
    const c = new OrbitCamera();
    c.preset('front');
    expect(c.position()[2]).toBeGreaterThan(Math.abs(c.position()[0]) + 1);
    c.preset('side');
    expect(c.position()[0]).toBeGreaterThan(Math.abs(c.position()[2]) + 1);
    c.preset('top');
    expect(c.position()[1]).toBeGreaterThan(c.distance * 0.9);
    c.orbit(300, 100);
    c.pan(40, 40);
    c.zoom(2);
    c.preset('home');
    const fresh = new OrbitCamera();
    expect(c.position()).toEqual(fresh.position());
  });

  it('fits a box on screen', () => {
    const c = new OrbitCamera();
    c.fit({ min: [-30, 0, -10], max: [30, 80, 10] });
    expect(c.target[1]).toBeCloseTo(40, 6);
    expect(c.distance).toBeGreaterThan(80);
  });
});

describe('FrameScheduler', () => {
  it('coalesces many requests into one frame', () => {
    const frames: (() => void)[] = [];
    const raf = vi.fn((cb: () => void) => frames.push(cb));
    const draw = vi.fn();
    const s = new FrameScheduler(raf, draw);
    for (let i = 0; i < 50; i++) s.request();
    expect(raf).toHaveBeenCalledTimes(1);
    frames.shift()!();
    expect(draw).toHaveBeenCalledTimes(1);
  });

  it('draws again when asked after a frame has run', () => {
    const frames: (() => void)[] = [];
    const raf = vi.fn((cb: () => void) => frames.push(cb));
    const draw = vi.fn();
    const s = new FrameScheduler(raf, draw);
    s.request();
    frames.shift()!();
    s.request();
    s.request();
    frames.shift()!();
    expect(draw).toHaveBeenCalledTimes(2);
    expect(raf).toHaveBeenCalledTimes(2);
  });

  it('does not draw by itself: nothing runs without a request (no constant loop)', () => {
    const raf = vi.fn();
    new FrameScheduler(raf, vi.fn());
    expect(raf).not.toHaveBeenCalled();
  });

  it('a request made while drawing schedules one more frame, not a loop', () => {
    const frames: (() => void)[] = [];
    let s: FrameScheduler;
    let calls = 0;
    const draw = () => {
      if (calls++ === 0) s.request();
    };
    s = new FrameScheduler((cb) => frames.push(cb), draw);
    s.request();
    frames.shift()!();
    expect(frames).toHaveLength(1);
    frames.shift()!();
    expect(frames).toHaveLength(0);
    expect(calls).toBe(2);
  });

  it('stops drawing after cancel', () => {
    const frames: (() => void)[] = [];
    const draw = vi.fn();
    const s = new FrameScheduler((cb) => frames.push(cb), draw);
    s.request();
    s.cancel();
    frames.forEach((f) => f());
    expect(draw).not.toHaveBeenCalled();
  });
});
