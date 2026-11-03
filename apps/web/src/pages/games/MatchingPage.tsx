import {
  Fragment,
  useEffect,
  useId,
  useRef,
  useState,
  type ButtonHTMLAttributes,
  type CSSProperties,
  type Ref,
} from 'react';
import { Button } from '../../components/ui/Button';
import { Feedback, type FeedbackTone } from '../../components/ui/Feedback';
import { headwordClass } from '../../components/ui/Headword';
import { CheckIcon, CrossIcon, MatchingIcon } from '../../components/ui/icons';
import { cn } from '../../lib/cn';
import { useFocusOnChange } from '../../lib/focus';
import { distinctPairs, shuffle, type GameItem, type Snapshot } from '../../lib/games';
import { GameFrame, RoundProgress, Unsuitable } from './GameFrame';
import { boardClass, boardFooterClass, boardPromptClass, promptLabelClass } from './gameStyles';
import './matching.css';

export default function MatchingPage() {
  return <GameFrame type="matching" Play={Matching} />;
}

type Side = 'en' | 'tr';
type TileState = 'idle' | 'selected' | 'matched' | 'missed';

interface Point {
  x: number;
  y: number;
}

/** Where each tile's connector sits, in pixels of the board (for the lines). */
interface Ports {
  width: number;
  height: number;
  en: Map<string, Point>;
  tr: Map<string, Point>;
}

/** An S-curve across the column gap, from an English connector to a Turkish one. */
function linkPath(from: Point, to: Point) {
  const bend = (to.x - from.x) / 2;
  return `M${from.x} ${from.y}C${from.x + bend} ${from.y} ${to.x - bend} ${to.y} ${to.x} ${to.y}`;
}

/**
 * "koşmak / çalıştırmak", with quieter slashes; the text itself is unchanged.
 * The spaces stay bare text nodes: accessible names trim text inside elements.
 */
function Meanings({ meanings }: { meanings: string[] }) {
  return meanings.map((meaning, i) => (
    <Fragment key={i}>
      {i > 0 && (
        <>
          {' '}
          <span className="match-sep">/</span>{' '}
        </>
      )}
      {meaning}
    </Fragment>
  ));
}

/**
 * A word tile (styles in matching.css). Its connector faces the other column:
 * open while the word is unmatched, numbered once matched (the same number as
 * its partner) and crossed after a rejected try. The connector is decorative;
 * the button's name and its pressed/disabled states carry the meaning, and a
 * matched name ends in " ✓".
 */
function Tile({
  side,
  state,
  number,
  ready = false,
  children,
  ...props
}: Omit<ButtonHTMLAttributes<HTMLButtonElement>, 'type' | 'className'> & {
  side: Side;
  state: TileState;
  /** The pair's number once matched, otherwise 0. */
  number: number;
  /** An English word is chosen, so this open meaning can take the connection. */
  ready?: boolean;
  ref?: Ref<HTMLButtonElement>;
}) {
  return (
    <button
      type="button"
      className="match-tile"
      data-side={side}
      data-state={state}
      data-ready={ready || undefined}
      {...props}
    >
      <span className="match-face">
        <span
          className={cn(
            'match-word',
            side === 'en' ? cn(headwordClass, 'match-word-en') : 'match-word-tr',
          )}
        >
          {children}
          {state === 'matched' ? (
            <>
              {/* The space stays a bare text node, so the name reads "apple ✓", not "apple✓". */}{' '}
              <span className="sr-only">✓</span>
            </>
          ) : null}
        </span>
        <span aria-hidden="true" className="match-port">
          {state === 'matched' ? number : state === 'missed' ? <CrossIcon strokeWidth={3} /> : null}
        </span>
      </span>
    </button>
  );
}

export function Matching({
  words,
  done,
}: {
  words: Snapshot[];
  done: (items: GameItem[]) => void;
}) {
  const [pairs] = useState(() => distinctPairs(shuffle(words), 5));
  const [right] = useState(() => shuffle(pairs));
  const [selected, setSelected] = useState<string | null>(null);
  const [matched, setMatched] = useState<string[]>([]);
  const [missed, setMissed] = useState<string | null>(null);
  const resolved = useRef(new Set<string>());
  const attempts = useRef<Record<string, number>>({});
  const [message, setMessage] = useState<{ text: string; tone: FeedbackTone } | null>(null);
  const heading = useFocusOnChange<HTMLHeadingElement>(null);
  const englishButtons = useRef(new Map<string, HTMLButtonElement>());
  const turkishButtons = useRef(new Map<string, HTMLButtonElement>());
  const finish = useRef<HTMLButtonElement>(null);
  const board = useRef<HTMLDivElement>(null);
  const [ports, setPorts] = useState<Ports | null>(null);
  // The open meaning under the pointer or keyboard focus. While an English word
  // is chosen, a dotted line previews the connection a click would try; it is
  // drawn for every open meaning alike, so it never hints at the answer.
  const [pointed, setPointed] = useState<string | null>(null);
  const [focused, setFocused] = useState<string | null>(null);
  const id = useId();
  // A matched answer is disabled, so focus moves on: to the next open word, or
  // to "Turu tamamla" once every pair is matched.
  useEffect(() => {
    if (!matched.length) return;
    const open = pairs.find((word) => !matched.includes(word.wordId!));
    if (open) englishButtons.current.get(open.wordId!)?.focus();
    else finish.current?.focus();
  }, [matched, pairs]);
  // The lines join the tiles' connectors, so they need the tiles' positions.
  // Measure after layout and whenever the board changes size (viewport, fonts,
  // wrapping text). Rows share their height, so no tile moves otherwise.
  useEffect(() => {
    const node = board.current;
    if (!node) return;
    const measure = () => {
      const box = node.getBoundingClientRect();
      if (!box.width || !box.height) return; // Not laid out (jsdom): no lines.
      const at = (buttons: Map<string, HTMLButtonElement>, side: Side) =>
        new Map(
          [...buttons].map(([wordId, button]): [string, Point] => {
            const tile = button.getBoundingClientRect();
            return [
              wordId,
              {
                x: (side === 'en' ? tile.right : tile.left) - box.left - node.clientLeft,
                y: tile.top + tile.height / 2 - box.top - node.clientTop,
              },
            ];
          }),
        );
      setPorts({
        width: node.clientWidth,
        height: node.clientHeight,
        en: at(englishButtons.current, 'en'),
        tr: at(turkishButtons.current, 'tr'),
      });
    };
    const frame = window.requestAnimationFrame(measure);
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(node);
    window.addEventListener('resize', measure);
    return () => {
      window.cancelAnimationFrame(frame);
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);
  if (pairs.length < 2)
    return <Unsuitable>Anlamları kesişmeyen en az iki kelime gerekir.</Unsuitable>;
  const pairNumber = (wordId: string | null) => matched.indexOf(wordId!) + 1;
  const selectedWord = pairs.find((word) => word.wordId === selected);
  const complete = matched.length === pairs.length;
  const aim = pointed ?? focused;
  const previewFrom = selected ? ports?.en.get(selected) : undefined;
  const previewTo =
    aim && aim !== missed && !matched.includes(aim) ? ports?.tr.get(aim) : undefined;
  return (
    <section data-mode="matching" className="grid gap-5">
      <RoundProgress value={matched.length} max={pairs.length}>
        {matched.length} / {pairs.length} çift eşleşti
      </RoundProgress>
      <div className={boardClass}>
        <div className={boardPromptClass}>
          <h2 ref={heading} tabIndex={-1} className="text-h2 text-fg">
            {complete ? 'Bütün çiftler eşleşti' : 'Kelimeleri eşleştir'}
          </h2>
          <p className="text-body text-fg">
            {complete
              ? 'Her kelimeyi anlamına bağladın. Sonucunu kaydetmek için turu tamamla.'
              : 'Önce İngilizce kelimeyi, sonra onun Türkçe anlam grubunu seç.'}
          </p>
        </div>
        {/* The table: the game's tint with a dot grid, as on the memory board. */}
        <div className="mode-art-stage match-stage">
          <div
            ref={board}
            className="match-board"
            style={{ '--match-rows': pairs.length } as CSSProperties}
          >
            <svg
              aria-hidden="true"
              focusable="false"
              className="match-links"
              viewBox={ports ? `0 0 ${ports.width} ${ports.height}` : undefined}
            >
              {ports
                ? matched.map((wordId) => {
                    const from = ports.en.get(wordId);
                    const to = ports.tr.get(wordId);
                    if (!from || !to) return null;
                    const path = linkPath(from, to);
                    return (
                      <g key={wordId} className="match-link">
                        <path d={path} pathLength={1} className="match-link-casing" />
                        <path d={path} pathLength={1} className="match-link-line" />
                      </g>
                    );
                  })
                : null}
              {previewFrom && previewTo ? (
                <path
                  key={`${selected}-${aim}`}
                  d={linkPath(previewFrom, previewTo)}
                  className="match-link-preview"
                />
              ) : null}
            </svg>
            <div role="group" aria-labelledby={`${id}-en`} className="match-column" data-side="en">
              <p id={`${id}-en`} className={cn(promptLabelClass, 'match-label')}>
                İngilizce
              </p>
              {pairs.map((word) => {
                const number = pairNumber(word.wordId);
                return (
                  <Tile
                    key={word.wordId}
                    ref={(node) => {
                      if (node) englishButtons.current.set(word.wordId!, node);
                      else englishButtons.current.delete(word.wordId!);
                    }}
                    side="en"
                    lang="en"
                    state={number ? 'matched' : selected === word.wordId ? 'selected' : 'idle'}
                    number={number}
                    aria-pressed={selected === word.wordId}
                    disabled={number > 0}
                    onClick={() => {
                      setSelected(word.wordId);
                      setMissed(null);
                      // A new choice starts a new attempt; the guidance below replaces old feedback.
                      setMessage(null);
                    }}
                  >
                    {word.english}
                  </Tile>
                );
              })}
            </div>
            <span
              aria-hidden="true"
              className={cn('match-hub', complete && 'celebrate')}
              data-complete={complete || undefined}
              style={{ '--match-progress': matched.length / pairs.length } as CSSProperties}
            >
              <svg viewBox="0 0 40 40" focusable="false" className="match-hub-ring">
                <circle cx="20" cy="20" r="18" className="match-hub-track" />
                <circle cx="20" cy="20" r="18" pathLength={1} className="match-hub-value" />
              </svg>
              {complete ? <CheckIcon strokeWidth={3} /> : <MatchingIcon />}
            </span>
            <div role="group" aria-labelledby={`${id}-tr`} className="match-column" data-side="tr">
              <p id={`${id}-tr`} className={cn(promptLabelClass, 'match-label')}>
                Türkçe
              </p>
              {right.map((word) => {
                const number = pairNumber(word.wordId);
                const state: TileState = number
                  ? 'matched'
                  : missed === word.wordId
                    ? 'missed'
                    : 'idle';
                return (
                  <Tile
                    key={word.wordId}
                    ref={(node) => {
                      if (node) turkishButtons.current.set(word.wordId!, node);
                      else turkishButtons.current.delete(word.wordId!);
                    }}
                    side="tr"
                    state={state}
                    number={number}
                    ready={!!selected && state === 'idle'}
                    disabled={number > 0}
                    onPointerEnter={(event) => {
                      // Touch has no hover; a tap goes straight to the answer.
                      if (event.pointerType !== 'touch') setPointed(word.wordId);
                    }}
                    onPointerLeave={() =>
                      setPointed((current) => (current === word.wordId ? null : current))
                    }
                    onFocus={() => setFocused(word.wordId)}
                    onBlur={() =>
                      setFocused((current) => (current === word.wordId ? null : current))
                    }
                    onClick={() => {
                      if (!selected || resolved.current.has(selected)) {
                        setMessage({ text: 'Önce bir İngilizce kelime seç.', tone: 'info' });
                        return;
                      }
                      attempts.current[selected] = Math.min(
                        10000,
                        (attempts.current[selected] ?? 0) + 1,
                      );
                      if (selected === word.wordId) {
                        resolved.current.add(selected);
                        setMatched([...resolved.current]);
                        setMessage({
                          text: `${word.english} — ${word.meanings.join(' / ')}: doğru eşleşme.`,
                          tone: 'success',
                        });
                        setSelected(null);
                        setMissed(null);
                      } else {
                        setMessage({
                          text: 'Bu ikisi eşleşmiyor. Tekrar dene.',
                          tone: 'highlight',
                        });
                        setMissed(word.wordId);
                      }
                    }}
                  >
                    <Meanings meanings={word.meanings} />
                  </Tile>
                );
              })}
            </div>
          </div>
        </div>
        <div className={boardFooterClass}>
          <div role="status" className="min-w-0 sm:flex-1">
            {message ? (
              <Feedback key={message.text} tone={message.tone}>
                <p>{message.text}</p>
                {complete ? <p className="sr-only">Bütün çiftler eşleşti.</p> : null}
              </Feedback>
            ) : selectedWord ? (
              <p className="text-body text-fg">
                Seçtiğin kelime:{' '}
                <strong lang="en" className={cn(headwordClass, 'text-body-lg')}>
                  {selectedWord.english}
                </strong>
                . Şimdi Türkçe anlamını seç.
              </p>
            ) : matched.length < pairs.length ? (
              <p className="text-small text-fg-muted">
                Eşleşen çiftler aynı numarayla birbirine bağlanır.
              </p>
            ) : null}
          </div>
          {matched.length === pairs.length ? (
            <Button
              ref={finish}
              size="lg"
              variant="mode"
              className="shrink-0"
              onClick={() =>
                done(
                  pairs.map((word) => ({
                    ...word,
                    outcome: 'matched',
                    attempts: attempts.current[word.wordId!] ?? 1,
                  })),
                )
              }
            >
              Turu tamamla
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
