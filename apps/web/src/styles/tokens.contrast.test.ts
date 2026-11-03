// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { contrastRatio } from './contrast';
import { contrastRequirements, surfaces, type Surface } from './contrastRequirements';
import css from './tokens.css?raw';

// Parses the semantic role values for each surface straight from tokens.css,
// so this test always checks the colors the app actually ships.
function readSurfaceTokens(): Record<Surface, Record<string, string>> {
  const result = {} as Record<Surface, Record<string, string>>;
  for (const surface of surfaces) {
    const pattern = String.raw`\[data-surface='${surface}'\]\s*\{([^}]*)\}`;
    const block = new RegExp(pattern).exec(css)?.[1];
    if (!block) throw new Error(`tokens.css has no [data-surface='${surface}'] block`);
    const entries = [...block.matchAll(/--sem-([\w-]+):\s*(#[0-9a-fA-F]{3,6})\s*;/g)].map(
      (m): [string, string] => [m[1] ?? '', m[2] ?? ''],
    );
    result[surface] = Object.fromEntries(entries);
  }
  return result;
}

const tokens = readSurfaceTokens();

describe('design token contrast (WCAG AA)', () => {
  it('defines the same semantic roles on every surface', () => {
    const roles = (s: Surface) => Object.keys(tokens[s]).sort();
    expect(roles('dark')).toEqual(roles('light'));
    expect(roles('navy')).toEqual(roles('light'));
  });

  describe.each(surfaces)('%s surface', (surface) => {
    it.each(contrastRequirements)('$label ($fg on $bg) ≥ $min:1', ({ fg, bg, min }) => {
      const fgValue = tokens[surface][fg];
      const bgValue = tokens[surface][bg];
      expect(fgValue, `--sem-${fg} missing`).toBeDefined();
      expect(bgValue, `--sem-${bg} missing`).toBeDefined();
      expect(contrastRatio(fgValue!, bgValue!)).toBeGreaterThanOrEqual(min);
    });
  });

  it('allows primary blue as a filled control on charcoal, but not as text', () => {
    // White label on a #1262b0 fill passes AA (text contrast is what WCAG 1.4.3 requires
    // for a text-labelled button; its fill needs no 3:1 against the page).
    expect(contrastRatio('#ffffff', '#1262b0')).toBeGreaterThanOrEqual(4.5);
    // As text or as the only state cue on charcoal it fails, so links, focus rings
    // and active indicators use the lighter blues on dark surfaces.
    expect(contrastRatio('#1262b0', '#171b22')).toBeLessThan(3);
    expect(tokens.dark['accent']).not.toBe('#1262b0');
    expect(tokens.dark['focus']).not.toBe('#1262b0');
    expect(tokens.dark['selected-indicator']).not.toBe('#1262b0');
  });

  it('matches the approved dark sidebar specification', () => {
    expect(tokens.dark['surface']).toBe('#171b22');
    expect(tokens.dark['selected']).toBe('#1262b0');
    expect(tokens.dark['on-selected']).toBe('#ffffff');
    expect(tokens.dark['selected-indicator']).toBe('#7cbbff');
  });
});

/** sRGB interpolation, as browsers transition legacy hex colors. */
function mix(from: string, to: string, t: number): string {
  const channels = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
  const a = channels(from);
  const b = channels(to);
  return `#${a
    .map((value, i) => Math.round(value + (b[i]! - value) * t))
    .map((value) => value.toString(16).padStart(2, '0'))
    .join('')}`;
}

// SidebarNavItem transitions the label color and its background together, with one
// duration and easing, so both always sit at the same progress t. The label must
// stay readable (AA) at every intermediate step, in both directions.
describe('sidebar selection color transition', () => {
  const dark = tokens.dark;
  const steps = Array.from({ length: 21 }, (_, i) => i / 20);
  const transitions = [
    {
      label: 'inactive → active',
      text: [dark['fg-muted']!, dark['on-selected']!],
      fill: [dark['surface']!, dark['selected']!],
    },
    {
      label: 'hovered inactive → active',
      text: [dark['fg']!, dark['on-selected']!],
      fill: [dark['surface-raised']!, dark['selected']!],
    },
  ] as const;

  it.each(transitions)('$label keeps text ≥ 4.5:1 at every step', ({ text, fill }) => {
    for (const t of steps) {
      const ratio = contrastRatio(mix(text[0], text[1], t), mix(fill[0], fill[1], t));
      expect(ratio, `t = ${t}`).toBeGreaterThanOrEqual(4.5);
    }
  });
});
