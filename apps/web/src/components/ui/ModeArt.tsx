import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';
import type { Mode } from './modeIcons';

/*
 * Small, static illustrations of each study mode: what the screen looks like in
 * miniature (a flipped card, a typed answer, letter tiles, a letter grid …).
 * They are decorative (aria-hidden): the card's title and description name and
 * explain the mode. Colors come from the surrounding `data-mode` (modes.css), so
 * every drawing follows its mode's palette.
 */

const Card = ({
  x,
  y,
  w,
  h,
  r = 11,
}: {
  x: number;
  y: number;
  w: number;
  h: number;
  r?: number;
}) => (
  <>
    <rect x={x + 3} y={y + 5} width={w} height={h} rx={r} className="ma-shadow" />
    <rect x={x} y={y} width={w} height={h} rx={r} className="ma-paper" />
  </>
);

function Flashcards() {
  return (
    <>
      <rect
        x="58"
        y="22"
        width="92"
        height="64"
        rx="11"
        className="ma-soft"
        transform="rotate(-9 104 54)"
      />
      <Card x={52} y={30} w={96} h={64} />
      <rect x="70" y="50" width="60" height="9" rx="4.5" className="ma-deep" />
      <rect x="82" y="67" width="36" height="6" rx="3" className="ma-soft" />
      <circle cx="146" cy="32" r="12.5" className="ma-solid" />
      <path
        d="M140.5 33.5a6 6 0 0 1 10.3-5.4M151.5 30.5a6 6 0 0 1-10.3 5.4"
        className="ma-stroke-paper"
      />
      <path d="M151.6 24.6v4.2h-4.2M140.4 39.4v-4.2h4.2" className="ma-stroke-paper" />
    </>
  );
}

function Written() {
  return (
    <>
      <Card x={40} y={20} w={120} h={78} />
      <rect x="56" y="34" width="58" height="7" rx="3.5" className="ma-soft" />
      <rect x="56" y="50" width="88" height="28" rx="8" className="ma-tint" />
      <rect x="56" y="50" width="88" height="28" rx="8" className="ma-stroke" />
      {[64, 76, 88, 100].map((x) => (
        <rect key={x} x={x} y="59" width="9" height="10" rx="2.5" className="ma-deep" />
      ))}
      <rect x="114" y="57" width="2.6" height="14" rx="1.3" className="ma-solid" />
      <g transform="rotate(38 150 92)">
        <rect x="128" y="86" width="34" height="11" rx="3" className="ma-solid" />
        <rect x="156" y="86" width="7" height="11" rx="2" className="ma-deep" />
        <path d="M128 86l-9 5.5 9 5.5z" className="ma-deep" />
      </g>
    </>
  );
}

function Listening() {
  const bars = [12, 24, 36, 20, 30, 42, 26, 16, 32, 20];
  return (
    <>
      <rect x="31" y="35" width="138" height="54" rx="27" className="ma-shadow" />
      <rect x="28" y="30" width="138" height="54" rx="27" className="ma-paper" />
      <circle cx="56" cy="57" r="17" className="ma-solid" />
      <path d="M51 48.5l13 8.5-13 8.5z" className="ma-paper" />
      {bars.map((h, i) => (
        <rect
          key={i}
          x={84 + i * 7.5}
          y={57 - h / 2}
          width="4.2"
          height={h}
          rx="2.1"
          className={i < 6 ? 'ma-deep' : 'ma-soft'}
        />
      ))}
      <path d="M70 22a30 30 0 0 1 60 0" className="ma-stroke" />
      <rect x="64" y="18" width="9" height="15" rx="4" className="ma-deep" />
      <rect x="127" y="18" width="9" height="15" rx="4" className="ma-deep" />
    </>
  );
}

function Review() {
  return (
    <>
      <Card x={36} y={20} w={118} h={78} />
      <rect x="52" y="35" width="80" height="6" rx="3" className="ma-soft" />
      <rect x="48" y="50" width="76" height="16" rx="4" className="ma-solid" opacity="0.55" />
      <rect x="54" y="55" width="62" height="6" rx="3" className="ma-ink" />
      <rect x="52" y="76" width="66" height="6" rx="3" className="ma-soft" />
      <g transform="rotate(-32 150 72)">
        <rect x="132" y="64" width="38" height="15" rx="4" className="ma-deep" />
        <rect x="132" y="64" width="12" height="15" rx="3" className="ma-solid" />
        <path d="M132 66.5l-9 3.2v4.6l9 3.2z" className="ma-solid" />
      </g>
    </>
  );
}

function Mixed() {
  return (
    <>
      <Card x={46} y={16} w={50} h={40} r={9} />
      <rect x="56" y="26" width="30" height="20" rx="4" className="ma-soft" />
      <rect x="62" y="33" width="18" height="5" rx="2.5" className="ma-deep" />

      <Card x={104} y={16} w={50} h={40} r={9} />
      <rect x="112" y="29" width="34" height="14" rx="4" className="ma-stroke" />
      <rect x="117" y="33.5" width="6" height="5" rx="1.5" className="ma-deep" />
      <rect x="125" y="33.5" width="6" height="5" rx="1.5" className="ma-deep" />
      <rect x="134" y="32" width="2" height="8" rx="1" className="ma-solid" />

      <Card x={46} y={64} w={50} h={40} r={9} />
      {[10, 18, 26, 14, 22, 12].map((h, i) => (
        <rect
          key={i}
          x={56 + i * 5.4}
          y={84 - h / 2}
          width="3"
          height={h}
          rx="1.5"
          className="ma-deep"
        />
      ))}

      <Card x={104} y={64} w={50} h={40} r={9} />
      <rect x="112" y="72" width="34" height="10" rx="5" className="ma-soft" />
      <rect x="112" y="86" width="34" height="10" rx="5" className="ma-solid" />
      <path d="M135 91l3 3 5-6" className="ma-stroke-paper" />
    </>
  );
}

function Quiz() {
  const options = [
    [36, 44],
    [104, 44],
    [36, 76],
    [104, 76],
  ] as const;
  return (
    <>
      <rect x="58" y="12" width="84" height="20" rx="10" className="ma-deep" />
      <rect x="74" y="19.5" width="52" height="5" rx="2.5" className="ma-paper" />
      {options.map(([x, y], i) => {
        const chosen = i === 3;
        return (
          <g key={i}>
            <rect x={x + 2} y={y + 3} width="60" height="25" rx="8" className="ma-shadow" />
            <rect
              x={x}
              y={y}
              width="60"
              height="25"
              rx="8"
              className={chosen ? 'ma-solid' : 'ma-paper'}
            />
            {chosen ? (
              <path d={`M${x + 9} ${y + 13}l3.5 3.5 6-7`} className="ma-stroke-paper" />
            ) : (
              <rect x={x + 7} y={y + 7} width="11" height="11" rx="3" className="ma-tint" />
            )}
            <rect
              x={x + 24}
              y={y + 10}
              width="28"
              height="5"
              rx="2.5"
              className={chosen ? 'ma-paper' : 'ma-soft'}
            />
          </g>
        );
      })}
    </>
  );
}

function Matching() {
  const rows = [24, 51, 78];
  return (
    <>
      <path d="M86 33C102 33 100 87 116 87" className="ma-stroke-solid" />
      <path d="M86 60C102 60 100 33 116 33" className="ma-stroke-solid" />
      <path d="M86 87C102 87 100 60 116 60" className="ma-stroke-soft" strokeDasharray="4 4" />
      {rows.map((y) => (
        <g key={`l${y}`}>
          <rect x="32" y={y + 3} width="54" height="19" rx="9.5" className="ma-shadow" />
          <rect x="30" y={y} width="54" height="19" rx="9.5" className="ma-paper" />
          <rect x="40" y={y + 7} width="30" height="5" rx="2.5" className="ma-deep" />
          <circle cx="86" cy={y + 9.5} r="3.6" className="ma-deep" />
        </g>
      ))}
      {rows.map((y) => (
        <g key={`r${y}`}>
          <rect x="118" y={y + 3} width="54" height="19" rx="9.5" className="ma-shadow" />
          <rect x="116" y={y} width="54" height="19" rx="9.5" className="ma-paper" />
          <rect x="128" y={y + 7} width="32" height="5" rx="2.5" className="ma-soft" />
          <circle cx="116" cy={y + 9.5} r="3.6" className="ma-solid" />
        </g>
      ))}
    </>
  );
}

function Memory() {
  const cells = Array.from({ length: 8 }, (_, i) => ({
    x: 36 + (i % 4) * 33,
    y: 16 + Math.floor(i / 4) * 46,
    i,
  }));
  return (
    <>
      {cells.map(({ x, y, i }) => {
        const open = i === 1;
        const matched = i === 6;
        return (
          <g key={i} transform={open ? `rotate(-6 ${x + 14} ${y + 20})` : undefined}>
            <rect x={x + 2} y={y + 4} width="28" height="40" rx="6" className="ma-shadow" />
            <rect
              x={x}
              y={y}
              width="28"
              height="40"
              rx="6"
              className={open ? 'ma-paper' : matched ? 'ma-soft' : 'ma-deep'}
            />
            {open ? (
              <rect x={x + 6} y={y + 17} width="16" height="5" rx="2.5" className="ma-deep" />
            ) : matched ? (
              <path d={`M${x + 8} ${y + 20}l4 4 8-9`} className="ma-stroke" />
            ) : (
              <path d={`M${x + 14} ${y + 13}l6 7-6 7-6-7z`} className="ma-solid" opacity="0.9" />
            )}
          </g>
        );
      })}
    </>
  );
}

function Assembly() {
  const letters = ['R', 'A', 'E', 'N', 'L'];
  return (
    <>
      {letters.map((letter, i) => {
        const lifted = i === 2;
        const x = 19 + i * 34;
        const y = lifted ? 22 : 42;
        return (
          <g key={letter} transform={lifted ? `rotate(-10 ${x + 15} ${y + 16})` : undefined}>
            <rect
              x={x}
              y={y + 4.5}
              width="30"
              height="32"
              rx="7"
              className="ma-deep"
              opacity="0.28"
            />
            <rect
              x={x}
              y={y}
              width="30"
              height="32"
              rx="7"
              className={lifted ? 'ma-solid' : 'ma-paper'}
            />
            <text
              x={x + 15}
              y={y + 16.5}
              className={lifted ? 'ma-text ma-text-lg ma-text-paper' : 'ma-text ma-text-lg'}
            >
              {letter}
            </text>
          </g>
        );
      })}
      {letters.map((_, i) => (
        <rect
          key={i}
          x={22 + i * 34}
          y="94"
          width="24"
          height="4.5"
          rx="2.25"
          className="ma-solid"
          opacity="0.45"
        />
      ))}
    </>
  );
}

function WordSearch() {
  const grid = ['QSTACK', 'ARRAYE', 'XHEAPY', 'LISTOZ'];
  const size = 17;
  const gap = 3;
  const left = 100 - (6 * size + 5 * gap) / 2;
  const top = 60 - (4 * size + 3 * gap) / 2;
  const cell = (col: number) => left + col * (size + gap);
  const row = (r: number) => top + r * (size + gap);
  return (
    <>
      <rect
        x={left - 9}
        y={top - 9}
        width={6 * size + 5 * gap + 18}
        height={4 * size + 3 * gap + 18}
        rx="12"
        className="ma-shadow"
      />
      <rect
        x={left - 11}
        y={top - 12}
        width={6 * size + 5 * gap + 18}
        height={4 * size + 3 * gap + 18}
        rx="12"
        className="ma-paper"
      />
      {/* A found word (ARRAY, filled) and the current selection (STACK, outlined). */}
      <rect
        x={cell(0) - 2}
        y={row(1) - 2}
        width={5 * size + 4 * gap + 4}
        height={size + 4}
        rx={(size + 4) / 2}
        className="ma-solid"
        opacity="0.4"
      />
      <rect
        x={cell(1) - 2}
        y={row(0) - 2}
        width={5 * size + 4 * gap + 4}
        height={size + 4}
        rx={(size + 4) / 2}
        className="ma-stroke"
      />
      {grid.map((letters, r) =>
        [...letters].map((letter, c) => (
          <text
            key={`${r}-${c}`}
            x={cell(c) + size / 2}
            y={row(r) + size / 2 + 0.5}
            className="ma-text ma-text-sm"
          >
            {letter}
          </text>
        )),
      )}
    </>
  );
}

function Crossword() {
  const s = 21;
  const pitch = 24;
  // Column c (0–4) and row r (−2…1) relative to the across word.
  const at = (c: number, r: number) => ({ x: 40 + c * pitch, y: 12 + (r + 2) * pitch });
  const square = (
    c: number,
    r: number,
    letter: string,
    state: 'solved' | 'active' | 'open',
    number?: number,
  ) => {
    const { x, y } = at(c, r);
    return (
      <g key={`${c}:${r}`}>
        <rect x={x + 1.5} y={y + 3} width={s} height={s} rx="4" className="ma-shadow" />
        <rect
          x={x}
          y={y}
          width={s}
          height={s}
          rx="4"
          className={state === 'solved' ? 'ma-soft' : 'ma-paper'}
        />
        {state === 'active' ? (
          <rect x={x} y={y} width={s} height={s} rx="4" className="ma-stroke" />
        ) : null}
        {number ? (
          <text x={x + 2.8} y={y + 4.6} className="ma-text ma-text-xs">
            {number}
          </text>
        ) : null}
        {letter ? (
          <text x={x + s / 2} y={y + s / 2 + 1} className="ma-text">
            {letter}
          </text>
        ) : null}
      </g>
    );
  };
  // ARRAY across (solved), CARD down through its first R, KEY down through its Y (active).
  return (
    <>
      {square(1, -2, 'C', 'open', 1)}
      {square(1, -1, 'A', 'open')}
      {square(1, 1, '', 'open')}
      {square(4, -2, '', 'active', 3)}
      {square(4, -1, '', 'active')}
      {['A', 'R', 'R', 'A', 'Y'].map((letter, c) =>
        square(c, 0, letter, 'solved', c === 0 ? 2 : undefined),
      )}
    </>
  );
}

const drawings: Record<Mode, () => ReactNode> = {
  flashcards: Flashcards,
  written: Written,
  listening: Listening,
  review: Review,
  mixed: Mixed,
  quiz: Quiz,
  matching: Matching,
  memory: Memory,
  assembly: Assembly,
  'word-search': WordSearch,
  crossword: Crossword,
};

/** A mode's miniature, drawn in its own colors. Decorative. */
export function ModeArt({ mode, className }: { mode: Mode; className?: string | undefined }) {
  const Drawing = drawings[mode];
  return (
    <svg
      viewBox="0 0 200 120"
      aria-hidden="true"
      focusable="false"
      data-mode={mode}
      className={cn('mode-art block h-full w-full', className)}
    >
      <Drawing />
    </svg>
  );
}
