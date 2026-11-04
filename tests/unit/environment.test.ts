import { describe, expect, it } from 'vitest';

describe('unit test environment', () => {
  it('runs without a DOM, like src/core does', () => {
    expect(typeof document).toBe('undefined');
    expect(typeof window).toBe('undefined');
  });
});
