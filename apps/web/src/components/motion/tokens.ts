/**
 * Motion (JavaScript) mirror of the motion tokens in styles/tokens.css, which
 * remain the single source of truth. tokens.test.ts parses tokens.css and fails
 * if these values drift. CSS-driven motion uses the CSS variables directly; use
 * these only where the Motion library needs numbers.
 */

/** Durations in seconds (Motion's unit): --duration-fast / -base / -slow. */
export const motionDuration = {
  fast: 0.12,
  base: 0.2,
  slow: 0.36,
} as const;

/** Cubic-bézier easings: --ease-standard / -emphasized / -exit. */
export const motionEase = {
  standard: [0.2, 0, 0, 1],
  emphasized: [0.3, 0, 0, 1.15],
  exit: [0.4, 0, 1, 1],
} as const satisfies Record<string, readonly [number, number, number, number]>;
