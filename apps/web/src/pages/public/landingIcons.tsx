import type { SVGProps } from 'react';

// A few decorative glyphs drawn inline, so the public page does not pull the
// application's shared icon module (and its icon library) into its bundle.
// They match the app's 24px grid, 2px stroke and round caps.

type GlyphProps = SVGProps<SVGSVGElement>;

function Glyph({ children, ...props }: GlyphProps) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...props}
    >
      {children}
    </svg>
  );
}

export const CheckGlyph = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Glyph>
);

export const CrossGlyph = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Glyph>
);

export const ArrowGlyph = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Glyph>
);

export const ArrowDownGlyph = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M12 5v14M6 13l6 6 6-6" />
  </Glyph>
);

export const EyeGlyph = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M2.5 12S6 5.5 12 5.5 21.5 12 21.5 12 18 18.5 12 18.5 2.5 12 2.5 12z" />
    <circle cx="12" cy="12" r="3" />
  </Glyph>
);

export const RestartGlyph = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M4 11a8 8 0 112.3 5.7" />
    <path d="M4 4v7h7" />
  </Glyph>
);

export const PlayGlyph = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M8 5.5v13l10.5-6.5z" fill="currentColor" />
  </Glyph>
);

export const SkipGlyph = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M5 6l8 6-8 6zM17 6v12" />
  </Glyph>
);

export const PlusGlyph = (p: GlyphProps) => (
  <Glyph {...p}>
    <path d="M12 5v14M5 12h14" />
  </Glyph>
);
