import { useEffect, useRef, useState, type PointerEvent } from 'react';
import { entryCells, type PuzzleBoard } from '../../lib/puzzles';
import { cn } from '../../lib/cn';
import './puzzles.css';
import { Button } from '../../components/ui/Button';
import { headwordClass } from '../../components/ui/Headword';
import { ArrowLeftIcon, ArrowRightIcon, InfoIcon } from '../../components/ui/icons';

export function WordSearchBoard({
  board,
  busy,
  select,
  result = null,
}: {
  board: PuzzleBoard;
  busy: boolean;
  select: (start: number, end: number) => void;
  /** Outcome of the last selection; shown in the board's own status line. */
  result?: { correct: boolean } | null | undefined;
}) {
  const [anchor, setAnchor] = useState<number | null>(null);
  const [hover, setHover] = useState<number | null>(null);
  const [focus, setFocus] = useState(0);
  const drag = useRef<{ start: number; end: number; pointer: number } | null>(null);
  const gridRef = useRef<HTMLDivElement>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const [scroll, setScroll] = useState({ overflow: false, left: false, right: false });
  useEffect(() => {
    const viewport = scrollRef.current;
    const grid = gridRef.current;
    if (!viewport || !grid) return;
    const measure = () => {
      const max = Math.max(0, viewport.scrollWidth - viewport.clientWidth);
      // Clamp elastic overscroll; allow half a pixel for fractional browser offsets.
      const position = Math.min(max, Math.max(0, viewport.scrollLeft));
      const next = { overflow: max > 0, left: position > 0.5, right: max - position > 0.5 };
      setScroll((old) =>
        old.overflow === next.overflow && old.left === next.left && old.right === next.right
          ? old
          : next,
      );
    };
    // Measure after layout; observe both available space and intrinsic grid size.
    const frame = window.requestAnimationFrame(measure);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(viewport);
    observer?.observe(grid);
    viewport.addEventListener('scroll', measure);
    window.addEventListener('resize', measure);
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      viewport.removeEventListener('scroll', measure);
      window.removeEventListener('resize', measure);
    };
  }, [board.rows, board.cols]);
  const found = new Set(
    board.entries.filter((e) => e.solved).flatMap((e) => entryCells(e, board.cols)),
  );
  const cellAt = (e: PointerEvent<HTMLDivElement>) => {
    const hit = document.elementFromPoint?.(e.clientX, e.clientY) ?? e.target;
    if (!(hit instanceof Element)) return null;
    const cell = hit.closest<HTMLElement>('[data-cell]');
    return cell && gridRef.current?.contains(cell) ? Number(cell.dataset['cell']) : null;
  };
  function choose(index: number) {
    if (busy) return;
    if (anchor === null) {
      setAnchor(index);
      setHover(index);
    } else {
      select(anchor, index);
      setAnchor(null);
      setHover(null);
    }
  }
  const preview = new Set<number>();
  if (anchor !== null && hover !== null) {
    const ar = Math.floor(anchor / board.cols),
      ac = anchor % board.cols;
    const rr = Math.floor(hover / board.cols) - ar,
      cc = (hover % board.cols) - ac;
    if (!rr || !cc || Math.abs(rr) === Math.abs(cc))
      for (let i = 0; i <= Math.max(Math.abs(rr), Math.abs(cc)); i++)
        preview.add((ar + Math.sign(rr) * i) * board.cols + ac + Math.sign(cc) * i);
  }
  const solvedCount = board.entries.filter((e) => e.solved).length;
  // One status line above the board: the selection in progress, otherwise the
  // last result.
  const anchorText = (cell: number) =>
    `Başlangıç: satır ${Math.floor(cell / board.cols) + 1}, sütun ${(cell % board.cols) + 1}. Şimdi son harfi seç.`;
  const missText = 'Bu seçim eşleşmedi. Kelime başka bir yerde olabilir.';
  const line =
    anchor !== null
      ? { dot: 'bg-action', text: anchorText(anchor) }
      : result?.correct
        ? { dot: 'bg-success', text: 'Kelime bulundu. Sıradakini ara.' }
        : result
          ? { dot: 'bg-on-highlight', text: missText }
          : { dot: 'bg-line-strong', text: 'Başlangıç harfini seç.' };
  // An invisible copy of the longest message holds the line at its tallest
  // height, so the letters never move under a finger between two taps or
  // during a drag.
  const longest = [anchorText(board.grid.length - 1), missText].reduce((a, b) =>
    b.length > a.length ? b : a,
  );
  return (
    <section className="grid min-w-0 gap-5">
      <p id="search-help" className="flex max-w-prose items-start gap-2 text-small text-fg">
        <InfoIcon className="mt-0.5 shrink-0 text-[1.05rem] text-fg-muted" />
        İlk ve son harfi seç veya parmağınla/farenle düz bir çizgi çiz. Klavyede oklarla gez; Enter
        ya da boşlukla başlangıcı ve bitişi seç. Escape seçimi temizler. Kelimeler ters yönde de
        olabilir.
      </p>
      {/*
       * The board keeps its natural width; the clues sit beside it only while both
       * fit, otherwise they wrap below. A fixed two-column split would make large
       * boards scroll sideways even on laptop screens.
       */}
      <div className="flex min-w-0 flex-wrap items-start gap-x-8 gap-y-6">
        <div className="grid min-w-0 max-w-full flex-[0_1_auto] gap-3">
          <p
            role="status"
            className="flex min-h-11 items-center gap-2.5 rounded-control border border-line bg-surface-raised px-3.5 py-2 text-body font-semibold text-fg"
          >
            <span aria-hidden="true" className={cn('size-2.5 shrink-0 rounded-full', line.dot)} />
            <span
              data-sizer={longest}
              className="grid min-w-0 flex-1 after:invisible after:col-start-1 after:row-start-1 after:content-[attr(data-sizer)]"
            >
              <span className="col-start-1 row-start-1 self-center">{line.text}</span>
            </span>
          </p>
          {scroll.overflow ? (
            <div className="flex flex-wrap items-center gap-2">
              <Button
                variant="secondary"
                size="sm"
                icon={<ArrowLeftIcon />}
                disabled={!scroll.left}
                onClick={() => scrollRef.current?.scrollBy({ left: -240, behavior: 'auto' })}
              >
                Tahtayı sola kaydır
              </Button>
              <Button
                variant="secondary"
                size="sm"
                icon={<ArrowRightIcon />}
                disabled={!scroll.right}
                onClick={() => scrollRef.current?.scrollBy({ left: 240, behavior: 'auto' })}
              >
                Tahtayı sağa kaydır
              </Button>
              <p className="w-full text-small text-fg-muted">
                Dar ekranda ilk harfi seçip tahtayı kaydırabilir, sonra son harfi seçebilirsin.
              </p>
            </div>
          ) : null}
          <div
            className="puzzle-scroll word-search-scroll"
            ref={scrollRef}
            tabIndex={0}
            role="region"
            aria-label="Harf tahtası; dar ekranda yatay kaydırabilirsin"
          >
            <div
              ref={gridRef}
              role="group"
              aria-label="Kelime Avı harfleri"
              aria-describedby="search-help"
              className="puzzle-grid word-search-grid"
              style={{ gridTemplateColumns: `repeat(${board.cols}, 2.75rem)` }}
              onPointerDown={(e) => {
                if (busy || e.isPrimary === false || e.button > 0) return;
                const index = cellAt(e);
                if (index === null) return;
                drag.current = { start: index, end: index, pointer: e.pointerId };
                setAnchor((old) => old ?? index);
                setHover(index);
                e.currentTarget.setPointerCapture?.(e.pointerId);
              }}
              onPointerMove={(e) => {
                if (drag.current?.pointer !== e.pointerId) return;
                const index = cellAt(e);
                if (index !== null) {
                  drag.current.end = index;
                  setHover(index);
                }
              }}
              onPointerCancel={() => {
                drag.current = null;
                setAnchor(null);
                setHover(null);
              }}
              onPointerUp={(e) => {
                const current = drag.current;
                if (!current || current.pointer !== e.pointerId) return;
                drag.current = null;
                e.currentTarget.releasePointerCapture?.(e.pointerId);
                const end = cellAt(e) ?? current.end;
                if (end !== current.start || (anchor !== null && anchor !== end)) {
                  select(anchor ?? current.start, end);
                  setAnchor(null);
                  setHover(null);
                }
              }}
            >
              {board.grid.map((letter, i) => (
                <button
                  key={i}
                  type="button"
                  data-cell={i}
                  tabIndex={focus === i ? 0 : -1}
                  aria-disabled={busy}
                  aria-label={`Satır ${Math.floor(i / board.cols) + 1}, sütun ${(i % board.cols) + 1}: ${letter}${found.has(i) ? ', bulundu' : ''}`}
                  aria-pressed={preview.has(i)}
                  className={cn(
                    'puzzle-cell',
                    found.has(i) && 'puzzle-found',
                    preview.has(i) && 'puzzle-active',
                  )}
                  onFocus={() => setFocus(i)}
                  onClick={(e) => {
                    if (e.detail === 0) choose(i);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Escape') {
                      setAnchor(null);
                      setHover(null);
                    }
                    const delta = {
                      ArrowLeft: -1,
                      ArrowRight: 1,
                      ArrowUp: -board.cols,
                      ArrowDown: board.cols,
                    }[e.key];
                    if (delta === undefined) return;
                    e.preventDefault();
                    const next = i + delta;
                    if (
                      next < 0 ||
                      next >= board.grid.length ||
                      (Math.abs(delta) === 1 &&
                        Math.floor(next / board.cols) !== Math.floor(i / board.cols))
                    )
                      return;
                    gridRef.current
                      ?.querySelector<HTMLButtonElement>(`[data-cell="${next}"]`)
                      ?.focus();
                  }}
                >
                  {letter}
                  <span className="puzzle-cell-mark" aria-hidden="true">
                    {found.has(i) ? '✓' : ''}
                  </span>
                </button>
              ))}
            </div>
          </div>
        </div>
        <section
          aria-labelledby="search-clues"
          className="@container grid min-w-[min(100%,16rem)] flex-[1_1_16rem] content-start gap-3"
        >
          <div className="flex items-baseline justify-between gap-3">
            <h2 id="search-clues" className="text-h4 text-fg">
              Türkçe ipuçları
            </h2>
            <p className="text-small text-fg-muted tabular-nums">
              {solvedCount} / {board.entries.length} bulundu
            </p>
          </div>
          <ul className="grid gap-2 @xl:grid-cols-2">
            {board.entries.map((e) => (
              <li
                key={e.id}
                className={cn(
                  'rounded-card border px-3.5 py-2.5 text-body wrap-anywhere',
                  e.solved
                    ? 'border-success/40 bg-success-soft text-fg'
                    : 'border-line bg-surface-raised text-fg',
                )}
              >
                {e.solved ? <span className="font-semibold text-success">✓ Bulundu: </span> : null}
                {e.meanings.join(' / ')}
                {e.solved ? (
                  <>
                    {' '}
                    —{' '}
                    <span lang="en" className={cn(headwordClass, 'text-body-lg')}>
                      {e.english}
                    </span>
                  </>
                ) : (
                  <span className="text-fg-muted">{` (${e.segments.join(' + ')} harf)`}</span>
                )}
              </li>
            ))}
          </ul>
        </section>
      </div>
    </section>
  );
}
