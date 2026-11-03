import { useId } from 'react';
import { Spinner } from '../../components/ui/Button';
import { cn } from '../../lib/cn';
import type { Preview, SimilarityDecision } from '../../lib/words';

type Similarity = NonNullable<Preview['rows'][number]['meanings'][number]['similarity']>;

const choices = [
  { action: 'skip', title: 'Aynı anlam, ekleme', description: 'Mevcut anlamı koru.' },
  {
    action: 'keep',
    title: 'Farklı anlam olarak ekle',
    description: 'Yeni girişi ayrı anlam olarak kaydet.',
  },
] as const;

export function MeaningSimilarityChoice({
  line,
  english,
  entered,
  similarity,
  locked,
  pendingAction,
  decide,
}: {
  line: number;
  english: string;
  entered: string;
  similarity: Similarity;
  /** A server preview is being calculated; choices ignore input until it returns. */
  locked: boolean;
  /** This group's choice that is waiting for the server, shown as selected meanwhile. */
  pendingAction: SimilarityDecision['action'] | null;
  decide: (decision: SimilarityDecision, input: HTMLInputElement) => void;
}) {
  const id = useId();
  // The server's decision is authoritative; the pending choice only bridges the request.
  const shown = pendingAction ?? similarity.action;
  return (
    <div className="grid min-w-0 gap-3 rounded-control border border-line bg-surface-raised p-4 text-body text-fg">
      <h4 className="font-semibold">Benzer anlam bulundu</h4>
      <p id={`${id}-description`} className="text-small text-fg-muted">
        Bu iki anlam birbirine benziyor. Aynı olup olmadığına sen karar ver.
      </p>
      <dl className="grid min-w-0 gap-2 sm:grid-cols-2">
        <div className="min-w-0 rounded-control border border-line p-3">
          <dt className="text-caption text-fg-muted">Mevcut anlam</dt>
          <dd className="mt-1 wrap-anywhere font-semibold">{similarity.existing}</dd>
        </div>
        <div className="min-w-0 rounded-control bg-surface-sunken p-3">
          <dt className="text-caption text-fg-muted">Girdiğin anlam</dt>
          <dd className="mt-1 wrap-anywhere font-semibold">{entered}</dd>
        </div>
      </dl>
      {/*
       * Not `disabled` while locked: disabling would drop keyboard focus and grey out
       * both rows. The radios stay focusable and readable; changes are ignored until
       * the preview returns, and React keeps the shown selection in place.
       */}
      <fieldset
        aria-describedby={`${id}-description`}
        aria-busy={pendingAction ? true : undefined}
        className="min-w-0 border-0 p-0"
      >
        <legend className="sr-only">
          Satır {line} · {english} · {entered} için seçim
        </legend>
        <div className="grid gap-2">
          {choices.map(({ action, title, description }) => (
            <label
              key={action}
              htmlFor={`${id}-${action}`}
              className={cn(
                'flex min-h-14 min-w-0 items-start gap-3 rounded-control border p-3',
                'transition-[background-color,border-color,color] duration-(--duration-fast) ease-standard',
                'has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-offset-2 has-[:focus-visible]:outline-focus',
                locked ? 'cursor-progress' : 'cursor-pointer',
                shown === action
                  ? 'border-accent bg-accent-soft text-on-accent-soft'
                  : cn('border-line-strong bg-surface-raised', !locked && 'hover:border-accent'),
              )}
            >
              <input
                id={`${id}-${action}`}
                type="radio"
                name={`similarity-${id}-${similarity.id}`}
                aria-labelledby={`${id}-${action}-title`}
                aria-describedby={`${id}-${action}-hint`}
                checked={shown === action}
                className="mt-0.5 size-5 shrink-0 accent-action focus-visible:outline-none"
                onChange={(event) => {
                  if (!locked) decide({ id: similarity.id, action }, event.currentTarget);
                }}
              />
              <span className="grid min-w-0 flex-1 gap-0.5 wrap-anywhere">
                <span id={`${id}-${action}-title`} className="text-small font-semibold">
                  {title}
                </span>
                <span id={`${id}-${action}-hint`} className="text-small text-fg-muted">
                  {description}
                </span>
              </span>
              {/* Reserved slot, so the row never changes size when the spinner appears. */}
              <span aria-hidden="true" className="grid size-5 shrink-0 place-items-center">
                {pendingAction === action ? <Spinner /> : null}
              </span>
            </label>
          ))}
        </div>
      </fieldset>
      <p aria-live="polite" className="sr-only">
        {pendingAction ? 'Seçimin uygulanıyor, önizleme güncelleniyor.' : ''}
      </p>
    </div>
  );
}
