import { describe, expect, it } from 'vitest';
import { copy } from '../../src/ui/copy';

/** Counts syllables the way a reading-level formula does: groups of vowels, with the usual silent-e rule. */
function syllables(word: string): number {
  const w = word.toLowerCase().replace(/[^a-z]/g, '');
  if (w.length === 0) return 0;
  if (w.length <= 3) return 1;
  const stripped = w.replace(/(?:[^laeiouy]es|ed|[^laeiouy]e)$/, '').replace(/^y/, '');
  const groups = stripped.match(/[aeiouy]{1,2}/g);
  return Math.max(1, groups ? groups.length : 1);
}

/** Flesch–Kincaid grade level of a piece of text. */
export function gradeLevel(text: string): number {
  const sentences = text.split(/[.!?]+(?:\s|$)/).filter((s) => s.trim().length > 0);
  const words = text.split(/\s+/).map((w) => w.replace(/[^A-Za-z0-9'’]/g, '')).filter((w) => /[A-Za-z]/.test(w));
  if (words.length === 0 || sentences.length === 0) return 0;
  const syl = words.reduce((n, w) => n + syllables(w), 0);
  return 0.39 * (words.length / sentences.length) + 11.8 * (syl / words.length) - 15.59;
}

/** Names and symbols that are allowed to be capitalised in the middle of a sentence. */
// (and the names of buttons and views that a sentence points at, and the word I)
const NAMES = new Set(['Sketch3D', 'STL', '3D', 'I', 'Save', 'Undo', 'Melt', 'Front', 'Side', 'Draw', 'Shapes']);

const entries = Object.entries(copy) as [string, string][];

describe('the scorer', () => {
  it('counts syllables sensibly', () => {
    expect(syllables('make')).toBe(1);
    expect(syllables('shape')).toBe(1);
    expect(syllables('toy')).toBe(1);
    expect(syllables('printer')).toBe(2);
    expect(syllables('colour')).toBe(2);
    expect(syllables('beautiful')).toBeGreaterThanOrEqual(3);
  });

  it('scores easy and hard sentences differently', () => {
    expect(gradeLevel('Draw a shape first.')).toBeLessThan(3);
    expect(gradeLevel('The extrusion depth parameterisation requires considerable recalibration.')).toBeGreaterThan(12);
  });
});

describe('copy.ts: every word the child sees', () => {
  it('has plenty of strings to check', () => {
    expect(entries.length).toBeGreaterThan(100);
    for (const [, v] of entries) expect(typeof v).toBe('string');
  });

  it.each(entries)('%s is under 90 characters', (_key, text) => {
    expect(text.length).toBeLessThan(90);
  });

  it.each(entries)('%s is in sentence case', (key, text) => {
    // every sentence starts with a capital, and nothing else is capitalised except names
    const sentences = text.split(/(?<=[.!?])\s+/);
    for (const s of sentences) {
      const words = s.split(/\s+/);
      expect(words[0][0], `${key}: "${s}"`).toBe(words[0][0].toUpperCase());
      for (const w of words.slice(1)) {
        const bare = w.replace(/[^A-Za-z0-9]/g, '');
        if (!bare || NAMES.has(bare)) continue;
        expect(bare[0], `${key}: "${w}" should not start with a capital`).not.toMatch(/[A-Z]/);
      }
    }
  });

  // A reading-level formula works on whole sentences, so it cannot score a label such as "Undo".
  // Real sentences (five words or more) are scored; short labels must be made of short, plain words.
  it.each(entries.filter(([k]) => k !== 'appName'))('%s reads at grade 5 or lower', (key, text) => {
    const words = text.split(/\s+/).filter((w) => /[A-Za-z]/.test(w));
    if (words.length >= 5) {
      expect(gradeLevel(text), key).toBeLessThanOrEqual(5);
    } else {
      for (const w of words) {
        expect(syllables(w), `${key}: "${w}"`).toBeLessThanOrEqual(3);
        expect(w.replace(/[^A-Za-z]/g, '').length, `${key}: "${w}"`).toBeLessThanOrEqual(10);
      }
    }
  });

  it.each(entries)('%s has none of the banned words', (_key, text) => {
    expect(text).not.toMatch(/\b(extrude|extrusion|sdf|mesh|vertex|vertices|boolean|parametric|manifold|watertight|polygon|algorithm|render)\b/i);
  });

  it('button labels start with a verb', () => {
    const VERBS = new Set([
      'undo', 'redo', 'save', 'draw', 'see', 'edit', 'close', 'make', 'delete', 'pick', 'reset', 'open', 'keep', 'show', 'melt',
      'start', 'add', 'check', 'download', 'fill', 'use', 'turn', 'move', 'next', 'back', 'finish', 'skip', 'play', 'try', 'help', 'restart',
    ]);
    const buttons = entries.filter(([k]) => k.startsWith('btn'));
    expect(buttons.length).toBeGreaterThan(10);
    for (const [key, text] of buttons) {
      expect(VERBS.has(text.split(/\s+/)[0].toLowerCase()), `${key}: "${text}" should start with a verb`).toBe(true);
    }
  });

  it('error and problem messages say what happened and never blame the child', () => {
    const messages = entries.filter(([k]) => /^(toast|print.*(Message|Fix)|changeFailed|scribble)/.test(k));
    expect(messages.length).toBeGreaterThan(8);
    for (const [key, text] of messages) {
      expect(text, key).not.toMatch(/\b(you did|your fault|wrong|invalid|error|illegal|you must|you failed|bad)\b/i);
    }
  });
});
