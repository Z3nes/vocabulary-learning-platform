import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { Feedback } from '../../components/ui/Feedback';
import { headwordClass } from '../../components/ui/Headword';
import { CheckIcon, CrossIcon } from '../../components/ui/icons';
import { cn } from '../../lib/cn';
import { useFocusOnChange } from '../../lib/focus';
import { quizQuestions, type GameItem, type Snapshot } from '../../lib/games';
import { GameFrame, RoundProgress, Unsuitable } from './GameFrame';
import {
  boardBodyClass,
  boardClass,
  boardFooterClass,
  boardPromptClass,
  choiceClass,
  choiceTones,
  promptLabelClass,
} from './gameStyles';

export default function QuizPage() {
  return <GameFrame type="quiz" Play={Quiz} />;
}

const optionKeys = ['A', 'B', 'C', 'D'];

export function Quiz({ words, done }: { words: Snapshot[]; done: (items: GameItem[]) => void }) {
  const [questions] = useState(() => quizQuestions(words));
  const [index, setIndex] = useState(0);
  const [answer, setAnswer] = useState<number | null>(null);
  const results = useRef<GameItem[]>([]);
  const advanced = useRef(-1);
  const locked = useRef(false);
  const heading = useFocusOnChange<HTMLHeadingElement>(index);
  const next = useRef<HTMLButtonElement>(null);
  const statusId = useId();
  const answered = answer !== null;
  // The answer replaces the choices' role; continue from the next-step button.
  useEffect(() => {
    if (answered) next.current?.focus();
  }, [answered]);
  const question = questions[index];
  if (!question)
    return (
      <Unsuitable>
        Birbiriyle anlamı kesişmeyen en az dört kelime gerekir. Aynı anlamı içeren seçenekler aynı
        soruda kullanılmaz.
      </Unsuitable>
    );
  const correct = answered && question.options[answer]!.wordId === question.target.wordId;
  const last = index + 1 === questions.length;
  return (
    <section data-mode="quiz" className="grid gap-5">
      <RoundProgress value={index + (answered ? 1 : 0)} max={questions.length}>
        Soru {index + 1} / {questions.length}
      </RoundProgress>
      <div className={boardClass}>
        <div key={index} className={cn(boardPromptClass, 'stage-enter')}>
          <p className={promptLabelClass}>İngilizce kelime</p>
          <h2
            ref={heading}
            tabIndex={-1}
            lang="en"
            className={cn(headwordClass, 'text-display wrap-anywhere text-fg')}
          >
            {question.target.english}
          </h2>
          <p className="text-body text-fg">Doğru Türkçe anlam grubunu seç.</p>
        </div>
        <div className={boardBodyClass}>
          <div className="grid gap-3 sm:grid-cols-2">
            {question.options.map((option, i) => {
              const isTarget = option.wordId === question.target.wordId;
              const chosen = answer === i;
              const tone = !answered
                ? choiceTones.idle
                : isTarget
                  ? choiceTones.correct
                  : chosen
                    ? choiceTones.missed
                    : choiceTones.muted;
              return (
                <button
                  key={i}
                  type="button"
                  className={cn(choiceClass, tone)}
                  aria-pressed={chosen}
                  aria-disabled={answered}
                  onClick={() => {
                    if (!locked.current) {
                      locked.current = true;
                      setAnswer(i);
                    }
                  }}
                >
                  <span
                    aria-hidden="true"
                    className={
                      answered && (isTarget || chosen)
                        ? cn(
                            'grid size-8 shrink-0 place-items-center rounded-control text-small font-bold',
                            isTarget
                              ? 'bg-success text-surface-raised'
                              : 'bg-on-highlight text-highlight',
                          )
                        : 'keycap shrink-0'
                    }
                  >
                    {answered && isTarget ? (
                      <CheckIcon strokeWidth={3} />
                    ) : answered && chosen ? (
                      <CrossIcon strokeWidth={3} />
                    ) : (
                      optionKeys[i]
                    )}
                  </span>
                  <span className="grid min-w-0 flex-1 gap-1">
                    <span>{option.meanings.join(' / ')}</span>
                    {answered && (isTarget || chosen) ? (
                      <span className="text-small font-semibold">
                        {isTarget ? 'Doğru cevap' : 'Senin seçimin'}
                      </span>
                    ) : null}
                  </span>
                </button>
              );
            })}
          </div>
        </div>
        <div className={boardFooterClass}>
          <div id={statusId} role="status" className="min-w-0 sm:flex-1">
            {answered ? (
              <Feedback tone={correct ? 'success' : 'highlight'}>
                <p className="font-semibold">
                  {correct
                    ? 'Doğru.'
                    : `Yanlış. Doğru cevap: ${question.target.meanings.join(' / ')}.`}
                </p>
              </Feedback>
            ) : null}
          </div>
          {answered ? (
            <Button
              ref={next}
              size="lg"
              variant="mode"
              aria-describedby={statusId}
              className="shrink-0"
              onClick={() => {
                if (!locked.current || advanced.current === index) return;
                advanced.current = index;
                results.current.push({
                  ...question.target,
                  outcome: correct ? 'correct' : 'incorrect',
                  attempts: 1,
                });
                if (last) {
                  done(results.current);
                } else {
                  setIndex(index + 1);
                  setAnswer(null);
                  locked.current = false;
                }
              }}
            >
              {last ? 'Turu tamamla' : 'Sonraki soru'}
            </Button>
          ) : (
            <p className="text-small text-fg-muted">Bir seçeneği seçtiğinde cevabı görürsün.</p>
          )}
        </div>
      </div>
    </section>
  );
}
