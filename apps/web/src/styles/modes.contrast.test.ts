// @vitest-environment node
import { describe, expect, it } from 'vitest';
import type { Mode } from '../components/ui/modeIcons';
import { contrastRatio } from './contrast';
import css from './modes.css?raw';

const modes: Mode[] = [
  'flashcards',
  'written',
  'listening',
  'review',
  'mixed',
  'quiz',
  'matching',
  'memory',
  'assembly',
  'word-search',
  'crossword',
];

// Reads each mode's roles straight from modes.css, so the shipped colors are checked.
function readMode(mode: Mode): Record<string, string> {
  const block = new RegExp(String.raw`\[data-mode='${mode}'\]\s*\{([^}]*)\}`).exec(css)?.[1];
  if (!block) throw new Error(`modes.css has no [data-mode='${mode}'] block`);
  return Object.fromEntries(
    [...block.matchAll(/--mode-([\w-]+):\s*(#[0-9a-fA-F]{6})\s*;/g)].map((m): [string, string] => [
      m[1] ?? '',
      m[2] ?? '',
    ]),
  );
}

describe('study mode colors (WCAG AA)', () => {
  it.each(modes)('%s defines every role', (mode) => {
    expect(Object.keys(readMode(mode)).sort()).toEqual(['deep', 'ink', 'soft', 'solid', 'tint']);
  });

  it.each(modes)('%s: ink text is readable on white, tint and soft (≥ 4.5:1)', (mode) => {
    const { ink, tint, soft } = readMode(mode);
    for (const background of ['#ffffff', tint!, soft!])
      expect(contrastRatio(ink!, background)).toBeGreaterThanOrEqual(4.5);
  });

  it.each(modes)('%s: white text on the deep fill is readable (≥ 4.5:1)', (mode) => {
    expect(contrastRatio('#ffffff', readMode(mode)['deep']!)).toBeGreaterThanOrEqual(4.5);
  });

  it('gives every mode its own hue', () => {
    const solids = modes.map((mode) => readMode(mode)['solid']);
    expect(new Set(solids).size).toBe(modes.length);
  });
});
