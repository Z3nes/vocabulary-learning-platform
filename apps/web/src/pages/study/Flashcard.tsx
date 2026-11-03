import { useId } from 'react';
import { Badge } from '../../components/ui/Badge';
import { Button } from '../../components/ui/Button';
import { headwordClass } from '../../components/ui/Headword';
import { EyeIcon, EyeOffIcon } from '../../components/ui/icons';
import { cn } from '../../lib/cn';
import type { CurrentCard, StudyDirection } from '../../lib/study';

const sideLabels = {
  english: 'İngilizce',
  turkish: 'Türkçe anlamları',
} as const;

/** The side's name as a small chip in the mode's ink. */
const sideLabelClass =
  'inline-flex w-fit items-center rounded-full bg-surface-raised px-3 py-1 text-caption font-bold tracking-[0.08em] text-(--mode-ink) uppercase shadow-[inset_0_0_0_1px_var(--mode-soft)]';

/** One side of the card: the English text, or every Turkish meaning together. */
function Side({
  language,
  values,
  prompt,
}: {
  language: 'en' | 'tr';
  values: string[];
  /** The prompt side is set larger than the revealed answer. */
  prompt: boolean;
}) {
  if (language === 'en')
    return (
      <p
        lang="en"
        className={cn(headwordClass, 'wrap-anywhere text-fg', prompt ? 'text-display' : 'text-h1')}
      >
        {values[0]}
      </p>
    );
  // All stored meanings, in their saved order; never a single random one.
  return (
    <ul className="grid justify-items-center gap-1.5">
      {values.map((meaning, index) => (
        <li
          key={`${index}-${meaning}`}
          className={cn('wrap-anywhere text-fg', prompt ? 'text-h2' : 'text-h3')}
        >
          {meaning}
        </li>
      ))}
    </ul>
  );
}

/**
 * The current study card, drawn as an index card: a labeled header strip, the
 * prompt, and a fold line below which the answer appears. The answer is not in
 * the DOM (nor the accessibility tree) until the student asks for it; revealing
 * is optional and never sent to the server. A new card (or a skipped card's
 * second appearance) mounts fresh content, which plays the stage entrance.
 */
export function Flashcard({
  card,
  direction,
  revealed,
  toggle,
  origin,
}: {
  card: CurrentCard;
  direction: StudyDirection;
  revealed: boolean;
  toggle: () => void;
  /** Source list title, shown for cards of an all-lists review session. */
  origin?: string | null | undefined;
}) {
  const id = useId();
  const englishFirst = direction === 'en-tr';
  const front = englishFirst ? sideLabels.english : sideLabels.turkish;
  const back = englishFirst ? sideLabels.turkish : sideLabels.english;
  const cardKey = `${card.id}:${card.appearance}`;
  return (
    <div className="relative pb-3">
      {/* The rest of the deck peeking out below the card. Decorative. */}
      <span
        aria-hidden="true"
        className="absolute inset-x-10 bottom-0 h-12 rounded-b-panel border border-line bg-surface-raised/70 shadow-card"
      />
      <span
        aria-hidden="true"
        className="absolute inset-x-5 bottom-1.5 h-12 rounded-b-panel border border-line bg-surface-raised shadow-card"
      />
      <section
        aria-labelledby={`${id}-front`}
        className="relative overflow-hidden rounded-panel border border-line bg-surface-raised text-center shadow-(--shadow-float)"
      >
        <div className="flex min-h-13 flex-wrap items-center justify-between gap-x-3 gap-y-1 border-b border-(--mode-soft) bg-(--mode-tint) px-5 py-2.5 text-start sm:px-7">
          <h2 id={`${id}-front`} className={sideLabelClass}>
            {front}
          </h2>
          <div className="flex flex-wrap items-center gap-2">
            {origin ? (
              <p className="text-small text-fg-muted">
                Kaynak liste: <span className="font-semibold text-fg">{origin}</span>
              </p>
            ) : null}
            {card.appearance === 2 ? <Badge tone="info">Atladığın kart</Badge> : null}
          </div>
        </div>
        {/* Faint ruled lines, like an index card. */}
        <div
          key={cardKey}
          className="stage-enter grid min-h-44 content-center justify-items-center bg-[repeating-linear-gradient(180deg,transparent_0_calc(2.25rem-1px),color-mix(in_srgb,var(--mode-soft)_55%,transparent)_calc(2.25rem-1px)_2.25rem)] px-5 py-9 sm:min-h-56 sm:px-10 sm:py-12"
        >
          <Side language={englishFirst ? 'en' : 'tr'} values={card.front} prompt />
        </div>
        <div id={`${id}-answer`} aria-live="polite">
          {revealed ? (
            <div
              key={cardKey}
              className="reveal-enter grid justify-items-center gap-3 border-t-2 border-dashed border-(--mode-soft) bg-(--mode-tint)/60 px-5 py-7 sm:px-10"
            >
              <h3 className={sideLabelClass}>{back}</h3>
              <Side language={englishFirst ? 'tr' : 'en'} values={card.back} prompt={false} />
            </div>
          ) : null}
        </div>
        <div className="border-t border-line bg-surface/60 px-5 py-3.5">
          <Button
            variant="mode-soft"
            aria-expanded={revealed}
            aria-controls={`${id}-answer`}
            icon={revealed ? <EyeOffIcon /> : <EyeIcon />}
            onClick={toggle}
          >
            {revealed ? 'Cevabı gizle' : 'Cevabı göster'}
          </Button>
        </div>
      </section>
    </div>
  );
}
