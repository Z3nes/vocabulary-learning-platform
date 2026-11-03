import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Feedback, type FeedbackTone } from '../../components/ui/Feedback';
import { headwordClass } from '../../components/ui/Headword';
import { cn } from '../../lib/cn';
import { useFocusOnChange } from '../../lib/focus';
import {
  canAssemble,
  eligible,
  scrambled,
  shuffle,
  type GameItem,
  type Snapshot,
} from '../../lib/games';
import { GameFrame, RoundProgress, Unsuitable } from './GameFrame';
import {
  boardBodyClass,
  boardClass,
  boardFooterClass,
  boardPromptClass,
  promptLabelClass,
} from './gameStyles';

export default function AssemblyPage() {
  return <GameFrame type="assembly" Play={Assembly} />;
}

type Message = { kind: 'correct' | 'wrong' | 'invalid' } | { kind: 'revealed'; english: string };

const messageTones: Record<Message['kind'], FeedbackTone> = {
  correct: 'success',
  wrong: 'highlight',
  invalid: 'info',
  revealed: 'highlight',
};

function MessageText({ message }: { message: Message }) {
  if (message.kind === 'revealed')
    return (
      <p>
        Doğru cevap:{' '}
        <strong lang="en" className={cn(headwordClass, 'text-body-lg')}>
          {message.english}
        </strong>
      </p>
    );
  return (
    <p>
      {message.kind === 'correct'
        ? 'Doğru.'
        : message.kind === 'wrong'
          ? 'Henüz doğru değil. Harfleri düzeltebilir veya cevabı görebilirsin.'
          : 'Yalnızca verilen harfleri, sayıları kadar kullanabilirsin.'}
    </p>
  );
}

// Letter tiles: raised like board-game pieces, in the game's palette. A used
// tile becomes an empty dashed slot; it never moves while hovered.
const tileClass =
  'grid size-13 place-items-center rounded-[0.8rem] border border-(--mode-line) text-h3 font-bold text-(--mode-ink) ' +
  'bg-[linear-gradient(180deg,#ffffff_0%,var(--mode-tint)_100%)] shadow-[0_3px_0_var(--mode-soft),0_8px_14px_-8px_var(--mode-glow)] ' +
  'transition-[border-color,background-color,color,box-shadow,translate] duration-(--duration-fast) ease-standard ' +
  'enabled:hover:border-(--mode-deep) enabled:hover:shadow-[0_3px_0_var(--mode-soft),0_10px_18px_-8px_var(--mode-glow)] ' +
  'enabled:active:translate-y-0.5 enabled:active:shadow-none motion-reduce:enabled:active:translate-y-0 ' +
  'disabled:border-dashed disabled:border-line-strong/60 disabled:bg-none disabled:bg-surface-sunken disabled:text-fg-muted disabled:shadow-none';

export function Assembly({
  words,
  done,
}: {
  words: Snapshot[];
  done: (items: GameItem[]) => void;
}) {
  const [round] = useState(() =>
    shuffle(words.filter(eligible))
      .slice(0, 8)
      .map((word) => ({ word, letters: scrambled(word.english) })),
  );
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState('');
  const [attempts, setAttempts] = useState(0);
  const [outcome, setOutcome] = useState<'correct' | 'revealed' | null>(null);
  const [message, setMessage] = useState<Message | null>(null);
  const results = useRef<GameItem[]>([]);
  const advanced = useRef(-1);
  const heading = useFocusOnChange<HTMLHeadingElement>(index);
  const input = useRef<HTMLInputElement>(null);
  const next = useRef<HTMLButtonElement>(null);
  const id = useId();
  // The answer field and its buttons are closed once the word is resolved.
  useEffect(() => {
    if (outcome) next.current?.focus();
  }, [outcome]);
  const current = round[index];
  if (!current)
    return (
      <Unsuitable>
        Yalnızca A–Z harflerinden oluşan, 3–12 harf uzunluğundaki İngilizce kelimeler uygundur.
        Boşluk, tire, kesme işareti ve rakam içeren ifadeler kullanılmaz.
      </Unsuitable>
    );
  const { word, letters } = current;
  const used = new Map<string, number>();
  for (const letter of answer.toLowerCase()) used.set(letter, (used.get(letter) ?? 0) + 1);
  const seen = new Map<string, number>();
  const last = index + 1 === round.length;
  return (
    <section data-mode="assembly" className="grid gap-5">
      <RoundProgress value={index + (outcome ? 1 : 0)} max={round.length}>
        Kelime {index + 1} / {round.length}
      </RoundProgress>
      <div className={boardClass}>
        <div key={index} className={cn(boardPromptClass, 'stage-enter')}>
          <p className={promptLabelClass}>Türkçe anlamı</p>
          <h2
            ref={heading}
            id={`${id}-prompt`}
            tabIndex={-1}
            className="text-h2 wrap-anywhere text-fg"
          >
            {word.meanings.join(' / ')}
          </h2>
          <p className="text-body text-fg">
            Harfleri seç veya klavyeyle yaz. Yalnızca hedef kelime kabul edilir.
          </p>
        </div>
        <form
          className={boardBodyClass}
          onSubmit={(e) => {
            e.preventDefault();
            if (outcome) return;
            setAttempts(Math.min(10000, attempts + 1));
            if (answer.toLowerCase() === word.english.toLowerCase()) {
              setOutcome('correct');
              setMessage({ kind: 'correct' });
            } else setMessage({ kind: 'wrong' });
          }}
        >
          <div className="grid gap-2">
            <label htmlFor={`${id}-answer`} className="text-small font-semibold text-fg">
              İngilizce kelime
            </label>
            <input
              ref={input}
              id={`${id}-answer`}
              lang="en"
              autoComplete="off"
              autoCapitalize="none"
              spellCheck={false}
              aria-describedby={`${id}-prompt ${id}-count`}
              className={cn(
                'h-16 w-full rounded-card border-2 bg-surface-raised px-5 font-headword text-h2 font-semibold tracking-[0.22em] text-fg uppercase',
                'shadow-[inset_0_2px_4px_rgb(13_19_33/0.06)] transition-[border-color,box-shadow] duration-(--duration-fast) ease-standard',
                'focus-visible:border-(--mode-deep) focus-visible:shadow-[0_0_0_4px_var(--mode-soft)]',
                'disabled:bg-surface-sunken disabled:text-fg',
                outcome === 'correct' ? 'border-success bg-success-soft' : 'border-line-strong',
              )}
              value={answer}
              disabled={!!outcome}
              onChange={(e) => {
                if (canAssemble(e.target.value, word.english)) setAnswer(e.target.value);
                else setMessage({ kind: 'invalid' });
              }}
            />
            <p id={`${id}-count`} className="text-small text-fg-muted tabular-nums">
              {answer.length} / {word.english.length} harf
            </p>
          </div>
          <div role="group" aria-label="Karışık harfler" className="flex flex-wrap gap-2.5">
            {letters.map((letter, i) => {
              const n = (seen.get(letter) ?? 0) + 1;
              seen.set(letter, n);
              return (
                <button
                  type="button"
                  className={tileClass}
                  key={`${index}-${i}`}
                  disabled={!!outcome || n <= (used.get(letter) ?? 0)}
                  aria-label={`${letter.toUpperCase()} harfi ${i + 1}`}
                  onClick={() => {
                    setAnswer(answer + letter);
                    // The consumed tile becomes disabled; continue from the
                    // answer field so keyboard focus remains usable.
                    input.current?.focus();
                  }}
                >
                  {letter.toUpperCase()}
                </button>
              );
            })}
          </div>
          {!outcome && (
            <div className="flex flex-wrap gap-2">
              <Button type="submit" variant="mode">
                Kontrol et
              </Button>
              <Button variant="secondary" onClick={() => setAnswer(answer.slice(0, -1))}>
                Son harfi sil
              </Button>
              <Button
                variant="ghost"
                onClick={() => {
                  setOutcome('revealed');
                  setMessage({ kind: 'revealed', english: word.english });
                }}
              >
                Cevabı göster ve geç
              </Button>
            </div>
          )}
        </form>
        <div className={boardFooterClass}>
          <div id={`${id}-status`} role="status" className="min-w-0 sm:flex-1">
            {message ? (
              <Feedback
                key={`${index}-${message.kind}-${attempts}`}
                tone={messageTones[message.kind]}
              >
                <MessageText message={message} />
              </Feedback>
            ) : (
              <p className="text-small text-fg-muted">
                Takılırsan cevabı görüp geçebilirsin; o kelime sonuçta “Cevabı gösterilen” olarak
                sayılır.
              </p>
            )}
          </div>
          {outcome ? (
            <Button
              ref={next}
              size="lg"
              variant="mode"
              aria-describedby={`${id}-status`}
              className="shrink-0"
              onClick={() => {
                if (advanced.current === index) return;
                advanced.current = index;
                results.current.push({ ...word, outcome, attempts });
                if (last) done(results.current);
                else {
                  setIndex(index + 1);
                  setAnswer('');
                  setAttempts(0);
                  setOutcome(null);
                  setMessage(null);
                }
              }}
            >
              {last ? 'Turu tamamla' : 'Sonraki kelime'}
            </Button>
          ) : null}
        </div>
      </div>
    </section>
  );
}
