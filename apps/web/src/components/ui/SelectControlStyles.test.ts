// @vitest-environment node
import { describe, expect, it } from 'vitest';
import css from '../../styles/global.css?raw';

describe('shared select presentation', () => {
  it('keeps touch targets, scrolling, wrapping and a non-color keyboard indicator', () => {
    expect(css).toMatch(/\.select-option \{[^}]*min-height: 2\.75rem;/);
    expect(css).toMatch(
      /\.select-popup \{[^}]*overflow-y: auto;[^}]*overscroll-behavior: contain;/,
    );
    expect(css).toContain(".select-option[aria-selected='true']");
    expect(css).toContain('border-color: var(--sem-focus)');
    expect(css).toContain('@media (forced-colors: active)');
  });
});
