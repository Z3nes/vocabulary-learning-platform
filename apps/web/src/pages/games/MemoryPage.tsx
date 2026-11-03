import { useEffect, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Feedback, type FeedbackTone } from '../../components/ui/Feedback';
import { headwordClass } from '../../components/ui/Headword';
import { CheckIcon } from '../../components/ui/icons';
import { ModeIcon } from '../../components/ui/modeIcons';
import { cn } from '../../lib/cn';
import { useFocusOnChange } from '../../lib/focus';
import { distinctPairs, shuffle, type GameItem, type Snapshot } from '../../lib/games';
import { GameFrame, RoundProgress, Unsuitable } from './GameFrame';
import { boardClass, boardFooterClass, boardPromptClass } from './gameStyles';
import './memory.css';

export default function MemoryPage() {
  return <GameFrame type="memory" Play={Memory} />;
}

/** How long a mismatched pair stays open, and how long its face is kept while turning back. */
const MISMATCH_MS = 1000;
const TURN_BACK_MS = 400;

interface Card {
  word: Snapshot;
  pair: number;
  side: 'english' | 'turkish';
}

const cardText = (card: Card) =>
  card.side === 'english' ? card.word.english : card.word.meanings.join(' / ');

export function Memory({ words, done }: { words: Snapshot[]; done: (items: GameItem[]) => void }) {
  const [pairs] = useState(() => distinctPairs(shuffle(words), 6));
  const [cards] = useState(() =>
    shuffle(
      pairs.flatMap((word, pair): Card[] => [
        { word, pair, side: 'english' },
        { word, pair, side: 'turkish' },
      ]),
    ),
  );
  const [open, setOpen] = useState<number[]>([]);
  // Cards turning back after a mismatch keep their (hidden) text until the turn ends.
  const [closing, setClosing] = useState<number[]>([]);
  const [matched, setMatched] = useState<number[]>([]);
  const selection = useRef<number[]>([]);
  const resolved = useRef(new Set<number>());
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const turnBack = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);
  const [message, setMessage] = useState<{ text: string; tone: FeedbackTone } | null>(null);
  const attempts = useRef<Record<number, number>>({});
  const heading = useFocusOnChange<HTMLHeadingElement>(null);
  const finish = useRef<HTMLButtonElement>(null);
  const complete = pairs.length >= 2 && matched.length === pairs.length;
  useEffect(
    () => () => {
      clearTimeout(timer.current);
      clearTimeout(turnBack.current);
    },
    [],
  );
  useEffect(() => {
    if (complete) finish.current?.focus();
  }, [complete]);
  if (pairs.length < 2)
    return <Unsuitable>Anlamları kesişmeyen en az iki kelime gerekir.</Unsuitable>;
  const reveal = (index: number) => {
    if (
      selection.current.length === 2 ||
      selection.current.includes(index) ||
      resolved.current.has(cards[index]!.pair)
    )
      return;
    selection.current = [...selection.current, index];
    setOpen(selection.current);
    const card = cards[index]!;
    const text = cardText(card);
    setMessage({ text: `Açılan kart: ${text}`, tone: 'info' });
    if (selection.current.length < 2) return;
    const first = cards[selection.current[0]!]!;
    for (const pair of new Set([first.pair, card.pair]))
      attempts.current[pair] = Math.min(10000, (attempts.current[pair] ?? 0) + 1);
    if (first.pair === card.pair) {
      resolved.current.add(card.pair);
      setMatched([...resolved.current]);
      selection.current = [];
      setOpen([]);
      setMessage({
        text: `${card.word.english} — ${card.word.meanings.join(' / ')}: eşleşti.`,
        tone: 'success',
      });
    } else {
      setMessage({
        text: `${cardText(first)} ve ${text}: eşleşmedi. Kartlar birazdan kapanacak.`,
        tone: 'highlight',
      });
      timer.current = setTimeout(() => {
        const shown = selection.current;
        selection.current = [];
        setOpen([]);
        setClosing(shown);
        setMessage({ text: 'Eşleşmeyen kartlar kapandı. Yeni bir kart seç.', tone: 'neutral' });
        turnBack.current = setTimeout(() => setClosing([]), TURN_BACK_MS);
      }, MISMATCH_MS);
    }
  };
  return (
    <section data-mode="memory" className="grid gap-5">
      <RoundProgress value={matched.length} max={pairs.length}>
        {matched.length} / {pairs.length} çift eşleşti
      </RoundProgress>
      <div className={boardClass}>
        <div className={boardPromptClass}>
          <h2 ref={heading} tabIndex={-1} className="text-h2 text-fg">
            Kelime ve anlamını bul
          </h2>
          <p className="text-body text-fg">
            Her seferinde iki kart aç. İngilizce kelimeyi Türkçe anlamıyla eşleştir.
          </p>
        </div>
        {/* The table: the game's tint with a dot grid, so the cards read as pieces on a board. */}
        <div className="mode-art-stage grid grid-cols-2 gap-3 p-4 sm:grid-cols-3 sm:gap-4 sm:p-8 lg:grid-cols-4">
          {cards.map((card, index) => {
            const isMatched = matched.includes(card.pair);
            const visible = open.includes(index) || isMatched;
            const shown = visible || closing.includes(index);
            const english = card.side === 'english';
            return (
              <button
                key={index}
                type="button"
                className="memory-card group grid min-h-30 rounded-card text-left aria-disabled:cursor-default sm:min-h-36"
                data-revealed={visible}
                data-matched={isMatched}
                aria-disabled={isMatched || open.length === 2 || open.includes(index)}
                aria-label={visible ? undefined : `Kapalı kart ${index + 1}`}
                onClick={() => reveal(index)}
              >
                <span className="memory-inner">
                  <span
                    aria-hidden="true"
                    className="memory-face memory-back grid place-items-center"
                  >
                    <span className="grid size-12 place-items-center rounded-full bg-white/15 text-[1.55rem] text-white shadow-[inset_0_0_0_1.5px_rgb(255_255_255/0.4)]">
                      <ModeIcon mode="memory" />
                    </span>
                  </span>
                  <span
                    className={cn(
                      'memory-face memory-face-open grid content-center justify-items-center gap-1 rounded-card border-2 p-3 text-center wrap-anywhere',
                      isMatched
                        ? 'border-success bg-success-soft'
                        : 'border-(--mode-line) bg-surface-raised shadow-[0_12px_26px_-16px_var(--mode-glow),var(--shadow-card)]',
                    )}
                  >
                    {isMatched ? (
                      <span
                        aria-hidden="true"
                        className="absolute top-2 right-2 grid size-6 place-items-center rounded-full bg-success text-[0.8rem] text-white"
                      >
                        <CheckIcon strokeWidth={3} />
                      </span>
                    ) : null}
                    {shown ? (
                      <span aria-hidden={visible ? undefined : true} className="grid gap-1">
                        <span
                          aria-hidden="true"
                          className={cn(
                            'text-caption font-bold tracking-[0.08em] uppercase',
                            isMatched ? 'text-success' : 'text-(--mode-ink)',
                          )}
                        >
                          {english ? 'İngilizce' : 'Türkçe'}
                        </span>
                        <span
                          lang={english ? 'en' : undefined}
                          className={
                            english
                              ? cn(headwordClass, 'text-h2 text-fg')
                              : 'text-body-lg font-semibold text-fg'
                          }
                        >
                          {cardText(card)}
                          {/* The corner badge shows the match; the name keeps its " ✓". */}
                          {isMatched ? <span className="sr-only"> ✓</span> : null}
                        </span>
                      </span>
                    ) : null}
                  </span>
                </span>
              </button>
            );
          })}
        </div>
        <div className={boardFooterClass}>
          <div role="status" aria-live="polite" className="min-w-0 sm:flex-1">
            {message ? (
              <Feedback key={message.text} tone={message.tone}>
                <p>{message.text}</p>
              </Feedback>
            ) : (
              <p className="text-small text-fg-muted">
                Eşleşen çiftler açık kalır; eşleşmeyen kartlar bir saniye sonra kapanır.
              </p>
            )}
          </div>
          {complete ? (
            <Button
              ref={finish}
              size="lg"
              variant="mode"
              className="shrink-0"
              onClick={() =>
                done(
                  pairs.map((word, i) => ({
                    ...word,
                    outcome: 'matched',
                    attempts: attempts.current[i] ?? 1,
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
