import { AnimatePresence, animate, motion, useReducedMotion } from 'motion/react';
import { useState } from 'react';
import { cn } from '../../lib/cn';
import { CheckIcon, CrossIcon } from '../ui/icons';

interface Option {
  text: string;
  correct: boolean;
}

export interface AnswerFeedbackProps {
  term: string;
  options: Option[];
}

type Result = { option: string; correct: boolean; attempt: number } | null;

/**
 * Demonstrates answer feedback: a pop for correct answers, a short shake for
 * incorrect ones. Meaning is carried by icon + text, never by color alone, and
 * the result is announced through a polite live region.
 */
export function AnswerFeedback({ term, options }: AnswerFeedbackProps) {
  const [result, setResult] = useState<Result>(null);
  const reduceMotion = useReducedMotion();
  const correctTexts = options.filter((o) => o.correct).map((o) => `“${o.text}”`);

  const choose = (option: Option, element: HTMLElement) => {
    setResult((previous) => ({
      option: option.text,
      correct: option.correct,
      attempt: (previous?.attempt ?? 0) + 1,
    }));
    // Imperative so the animation replays on every attempt without remounting
    // (remounting would drop keyboard focus).
    if (reduceMotion) return;
    if (option.correct) {
      void animate(element, { scale: [1, 1.05, 1] }, { duration: 0.32, ease: 'easeOut' });
    } else {
      void animate(element, { x: [0, -9, 9, -6, 6, -2, 0] }, { duration: 0.42, ease: 'easeOut' });
    }
  };

  return (
    <div className="grid gap-4">
      <p className="text-body text-fg">
        <span lang="en" className="font-bold">
          {term}
        </span>{' '}
        kelimesinin anlamı hangisidir?
      </p>
      <div className="grid gap-2 sm:grid-cols-2">
        {options.map((option) => {
          const chosen = result?.option === option.text;
          return (
            <button
              key={option.text}
              type="button"
              onClick={(event) => choose(option, event.currentTarget)}
              className={cn(
                'flex items-center justify-between gap-3 rounded-control border-2 px-4 py-3 text-left text-body font-medium',
                'transition-colors duration-(--duration-fast) ease-standard',
                chosen && option.correct && 'border-success bg-success-soft text-success',
                chosen && !option.correct && 'border-danger bg-danger-soft text-danger',
                !chosen &&
                  'border-line-strong bg-surface-raised text-fg hover:border-accent hover:bg-accent-soft hover:text-on-accent-soft',
              )}
            >
              {option.text}
              {chosen ? (
                option.correct ? (
                  <CheckIcon className="shrink-0 text-[1.2em]" />
                ) : (
                  <CrossIcon className="shrink-0 text-[1.2em]" />
                )
              ) : null}
            </button>
          );
        })}
      </div>

      <div role="status" aria-live="polite" className="min-h-14">
        <AnimatePresence mode="wait" initial={false}>
          {result ? (
            <motion.p
              key={result.attempt}
              initial={{ opacity: 0, y: 8, scale: 0.96 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -6 }}
              transition={{ type: 'spring', stiffness: 420, damping: 30 }}
              className={cn(
                'flex items-center gap-2 rounded-control px-4 py-3 text-body font-semibold',
                result.correct ? 'bg-success-soft text-success' : 'bg-danger-soft text-danger',
              )}
            >
              {result.correct ? (
                <CheckIcon className="shrink-0" />
              ) : (
                <CrossIcon className="shrink-0" />
              )}
              {result.correct
                ? `Doğru! “${result.option}” bu kelimenin anlamlarından biri.`
                : `Yanlış. Doğru cevap: ${correctTexts.join(', ')}.`}
            </motion.p>
          ) : null}
        </AnimatePresence>
      </div>
    </div>
  );
}
