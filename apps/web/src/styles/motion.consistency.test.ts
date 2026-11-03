// @vitest-environment node
import { describe, expect, it } from 'vitest';

// Source scan of shipped UI components (the dev-only design-system pages excluded).
// jsdom cannot evaluate media queries, so this checks the class names themselves.
const sources = import.meta.glob<string>(['../**/*.tsx', '!../**/*.test.tsx', '!../pages/dev/**'], {
  query: '?raw',
  import: 'default',
  eager: true,
});

const classTokens = (source: string) => source.split(/[\s'"`{}()]+/).filter(Boolean);

describe('motion consistency in production UI', () => {
  it('scans the shipped components', () => {
    expect(Object.keys(sources).length).toBeGreaterThan(20);
  });

  it.each(Object.entries(sources))(
    '%s: hover movement is cancelled under reduced motion',
    (_, source) => {
      const tokens = new Set(classTokens(source));
      for (const token of tokens) {
        const match = /^((?:[\w-]+:)*(?:group-)?hover:)-?translate-([xy])-(?!0$)[\w.[\]]+$/.exec(
          token,
        );
        if (!match || token.startsWith('motion-reduce:')) continue;
        expect(tokens, `${token} needs a reduced-motion override`).toContain(
          `motion-reduce:${match[1]}translate-${match[2]}-0`,
        );
      }
    },
  );

  it.each(Object.entries(sources))('%s: CSS transitions use duration tokens', (_, source) => {
    for (const line of source.split('\n')) {
      if (/^\s*(\/\/|\/?\*|\{\/\*)/.test(line)) continue; // comments
      // Tailwind transition utilities (not Motion's `transition={...}` prop).
      if (!/(?:^|[\s'"`])transition(?:-[\w[\],-]+)?(?=[\s'"`]|$)/.test(line)) continue;
      expect(line, line.trim()).toMatch(/duration-\(--duration-(fast|base|slow)\)/);
    }
  });
});
