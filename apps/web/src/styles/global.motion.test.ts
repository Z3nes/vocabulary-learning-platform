// @vitest-environment node
import { describe, expect, it } from 'vitest';
import css from './global.css?raw';

// jsdom neither loads stylesheets nor evaluates media queries, so these checks
// read the shipped CSS. Real rendering is verified manually in a browser.

/** Body of the first block opened by `prelude` (balanced braces). */
function block(source: string, prelude: string): string {
  const start = source.indexOf(prelude);
  if (start < 0) throw new Error(`global.css has no "${prelude}" block`);
  const open = source.indexOf('{', start);
  let depth = 0;
  for (let i = open; i < source.length; i++) {
    if (source[i] === '{') depth++;
    if (source[i] === '}' && --depth === 0) return source.slice(open + 1, i);
  }
  throw new Error(`Unbalanced block after "${prelude}"`);
}

const withoutComments = css.replace(/\/\*[\s\S]*?\*\//g, '');

describe('scroll behavior', () => {
  it('never makes viewport scrolling smooth, so route scroll restoration is immediate', () => {
    expect(withoutComments).not.toMatch(/scroll-behavior:\s*smooth/);
  });

  it('keeps the reduced-motion backstop for all animations and transitions', () => {
    const reduced = block(withoutComments, '@media (prefers-reduced-motion: reduce)');
    expect(reduced).toMatch(/animation-duration:\s*0\.01ms\s*!important/);
    expect(reduced).toMatch(/transition-duration:\s*0\.01ms\s*!important/);
    expect(reduced).toMatch(/scroll-behavior:\s*auto\s*!important/);
  });
});

/** Every block whose prelude is exactly `prelude`. */
function allBlocks(source: string, prelude: string): string[] {
  const parts: string[] = [];
  let rest = source;
  while (rest.includes(prelude)) {
    parts.push(block(rest, prelude));
    rest = rest.slice(rest.indexOf(prelude) + prelude.length);
  }
  return parts;
}

const blocks = (source: string, prelude: string) => allBlocks(source, prelude).join('\n');

/** The `prefers-reduced-motion: no-preference` block that styles `selector`. */
function motionAllowedBlock(selector: string): string {
  const found = allBlocks(withoutComments, '@media (prefers-reduced-motion: no-preference)').find(
    (body) => body.includes(selector),
  );
  if (!found) throw new Error(`No reduced-motion-gated block styles ${selector}`);
  return found;
}

describe('list card feedback', () => {
  const hover = blocks(withoutComments, '@media (hover: hover) {');
  const hoverMotion = block(
    withoutComments,
    '@media (hover: hover) and (prefers-reduced-motion: no-preference)',
  );

  it('highlights only while the stretched link is hovered, on hover-capable pointers', () => {
    expect(hover).toMatch(/\.list-card:has\(\.list-card-link:hover\)\s*\{[^}]*border-color/);
    // Outside the hover media query nothing reacts to :hover, so touch never sticks.
    const elsewhere = withoutComments.replace(hover, '').replace(hoverMotion, '');
    expect(elsewhere).not.toMatch(/\.list-card[^{]*:hover/);
    // Never keyed to hovering the card itself (which would include Rename/Delete).
    expect(withoutComments).not.toMatch(/\.list-card:hover/);
  });

  it('never moves or resizes the card, and nudges the arrow only without reduced motion', () => {
    const cardRules = [...withoutComments.matchAll(/\.list-card[^{]*\{([^}]*)\}/g)]
      .filter((match) => !match[0].includes('.list-card-arrow'))
      .map((match) => match[1])
      .join('\n');
    expect(cardRules).not.toMatch(/translate|scale|transform|margin|padding|width|height/);
    expect(hoverMotion).toMatch(/\.list-card-arrow\s*\{\s*translate:\s*0\.25rem 0;/);
    expect(hover).not.toMatch(/translate/);
  });

  it('gives a press state for touch and mouse, using token durations and easing', () => {
    const active = block(withoutComments, '.list-card:has(.list-card-link:active)');
    expect(active).toMatch(/background-color:\s*var\(--sem-surface-sunken\)/);
    const transition = block(withoutComments, '.list-card {');
    expect(transition).toMatch(/var\(--duration-base\) var\(--ease-standard\)/);
    expect(transition).toMatch(/var\(--duration-fast\) var\(--ease-standard\)/);
    expect(transition).not.toMatch(/\d+m?s\b/);
  });
});

describe('content fade', () => {
  it('fades by opacity only, once, and only without reduced motion', () => {
    const allowed = motionAllowedBlock('.fade-in');
    expect(allowed).toMatch(
      /\.fade-in\s*\{\s*animation:\s*fade-in var\(--duration-base\) var\(--ease-standard\);\s*\}/,
    );
    expect(withoutComments.replace(allowed, '')).not.toMatch(/\.fade-in\s*\{/);
    const from = block(block(withoutComments, '@keyframes fade-in'), 'from');
    expect([...from.matchAll(/([\w-]+):/g)].map((match) => match[1])).toEqual(['opacity']);
  });
});

describe('route entrance', () => {
  it('only animates when the user has not asked for reduced motion', () => {
    const allowed = motionAllowedBlock('.route-enter');
    expect(allowed).toMatch(
      /\.route-enter\s*\{\s*animation:\s*route-enter var\(--duration-base\) var\(--ease-standard\);\s*\}/,
    );
    // The class is not animated anywhere else.
    const outside = withoutComments.replace(allowed, '');
    expect(outside).not.toMatch(/\.route-enter\s*\{/);
  });

  it('fades and shifts slightly from a start state, then holds nothing afterwards', () => {
    const keyframes = block(withoutComments, '@keyframes route-enter');
    const from = block(keyframes, 'from');
    expect(from).toMatch(/opacity:\s*0;/);
    expect(from).toMatch(/translate:\s*0 0\.375rem;/);
    // Only composite-friendly properties, and no end state left on the wrapper.
    const properties = [...from.matchAll(/([\w-]+):/g)].map((match) => match[1]);
    expect(properties.sort()).toEqual(['opacity', 'translate']);
    expect(keyframes).not.toMatch(/\bto\b|100%/);
  });
});

describe('list and word dialog entrance', () => {
  const startingStyle = allBlocks(withoutComments, '@starting-style').find((body) =>
    body.includes('.list-dialog'),
  );

  it('fades and rises from @starting-style over the base duration, only without reduced motion', () => {
    const allowed = motionAllowedBlock('.list-dialog');
    const dialog = block(allowed, '.list-dialog {');
    expect(dialog).toMatch(/opacity var\(--duration-base\) var\(--ease-standard\)/);
    expect(dialog).toMatch(/translate var\(--duration-base\) var\(--ease-standard\)/);
    expect(block(allowed, '.list-dialog::backdrop')).toMatch(
      /background-color var\(--duration-base\) var\(--ease-standard\)/,
    );
    expect(startingStyle).toBeDefined();
    const from = block(startingStyle!, '.list-dialog[open] {');
    expect(from).toMatch(/opacity:\s*0;/);
    expect(from).toMatch(/translate:\s*0 0\.5rem;/);
    expect(block(startingStyle!, '.list-dialog[open]::backdrop')).toMatch(
      /background-color:\s*rgb\(16 17 20 \/ 0\)/,
    );
  });

  it('has no exit transition: closing stays instant because the dialogs unmount', () => {
    const dialogRules = [...withoutComments.matchAll(/\.list-dialog[^{]*\{([^}]*)\}/g)]
      .map((match) => match[1])
      .join('\n');
    expect(dialogRules).not.toMatch(/allow-discrete|(?:^|[;\s])(?:overlay|display)\s*:/);
    expect(withoutComments).not.toMatch(/\.list-dialog:not\(\[open\]\)/);
    // Outside the reduced-motion gate the dialog declares no transition at all.
    const ungated = withoutComments.replace(motionAllowedBlock('.list-dialog'), '');
    const base = block(ungated, '.list-dialog {');
    expect(base).not.toMatch(/transition/);
  });

  it('leaves the accepted drawer animation in place', () => {
    const drawer = allBlocks(withoutComments, '@starting-style').find((body) =>
      body.includes('.app-drawer'),
    );
    expect(drawer).toMatch(/\.app-drawer\[open\]\s*\{\s*translate:\s*-100% 0;/);
  });
});
