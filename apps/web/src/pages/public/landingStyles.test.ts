// @vitest-environment node
import { describe, expect, it } from 'vitest';
import css from './landing.css?raw';

/** The body of the first `@media`/`@supports` block whose prelude contains `prelude`. */
function block(prelude: string) {
  const start = css.indexOf(prelude);
  expect(start, prelude).toBeGreaterThan(-1);
  let depth = 0;
  for (let i = css.indexOf('{', start); i < css.length; i++) {
    if (css[i] === '{') depth++;
    else if (css[i] === '}' && --depth === 0) return css.slice(start, i + 1);
  }
  throw new Error(`Unclosed block: ${prelude}`);
}

describe('public responsive and motion stylesheet', () => {
  it('ships narrow single-column layouts and a usable disclosure navigation', () => {
    expect(block('@media (max-width: 960px)')).toMatch(/grid-template-columns: minmax\(0, 1fr\)/);
    expect(css).toMatch(/@media \(max-width: 760px\)/);
    expect(block('@media (max-width: 1100px)')).toContain('.lp-mobile-nav:not([hidden])');
    expect(css).toMatch(/min-height: 2\.75rem/);
  });
  it('shows the decorative mode fragments only where they fit beside the deck', () => {
    expect(css).toMatch(/\.lp-orbits \{[^}]*display: none;/);
    expect(block('@media (min-width: 1360px)')).toMatch(/\.lp-orbits \{\s*display: block;/);
  });
  it('cancels entrance, hover and reveal motion and restores visible content when reduced motion is requested', () => {
    const reduced = block('@media (prefers-reduced-motion: reduce)');
    expect(reduced).toMatch(/animation: none !important/);
    expect(reduced).toMatch(/transition: none !important/);
    expect(reduced).toMatch(/opacity: 1/);
    expect(reduced).toMatch(/transform: none/);
    expect(reduced).toContain(".lp-reveal-ready [data-visible='false']");
  });
  it('runs entrances only on request and keeps scroll-linked motion progressive', () => {
    const entrances = block('@media (prefers-reduced-motion: no-preference)');
    expect(entrances).toMatch(/\.lp-hero-visual \.lp-deck \{\s*animation:/);
    expect(entrances).toMatch(/\.lp-card-departing\[data-verdict='known'\]/);
    const scrollLinked = block('@supports (animation-timeline: view())');
    expect(scrollLinked).toContain('@media (prefers-reduced-motion: no-preference)');
    // Every scroll timeline lives inside that guarded block.
    expect(css.split('animation-timeline:').length).toBe(
      scrollLinked.split('animation-timeline:').length,
    );
  });
  it('keeps scroll reveals progressive and avoids continuous animation or smooth viewport scrolling', () => {
    expect(css).toMatch(/\.lp-reveal-ready \[data-visible='false'\]/);
    expect(css).not.toMatch(/\binfinite\b|scroll-behavior:\s*smooth/);
    expect(css).toContain('var(--duration-base)');
    expect(css).toContain('var(--ease-standard)');
  });
  it('builds on the shared brand palette rather than a separate one', () => {
    for (const token of ['--color-navy-950', '--color-blue-600', '--color-charcoal', '--color-ink'])
      expect(css).toContain(`var(${token}`);
  });
  it('stacks the approach and acknowledgements at narrow widths and wraps every contributor name', () => {
    const narrow = block('@media (max-width: 960px)');
    expect(narrow).toContain('.lp-approach-head');
    expect(narrow).toContain('.lp-acknowledgements-layout');
    expect(css).toMatch(/\.lp-contributors li \{[^}]*overflow-wrap: anywhere;/);
    expect(css).toMatch(/\.lp-department-name \{[^}]*overflow-wrap: anywhere;/);
    expect(css).not.toMatch(/lp-strikes|lp-manifesto/);
  });
});
