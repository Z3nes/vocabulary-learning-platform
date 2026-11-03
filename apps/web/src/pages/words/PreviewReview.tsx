import { useEffect, useId, useRef, useState } from 'react';
import type { Ref } from 'react';
import { Button } from '../../components/ui/Button';
import { headwordClass } from '../../components/ui/Headword';
import { InfoIcon } from '../../components/ui/icons';
import { StatGrid } from '../../components/ui/Stats';
import { ApiError } from '../../lib/api';
import { apiErrorMessage } from '../../lib/apiErrors';
import type { Preview, SimilarityDecision } from '../../lib/words';
import { MeaningSimilarityChoice } from './MeaningSimilarityChoice';

const statuses: Record<string, string> = {
  new: 'Yeni kelime',
  merge: 'Listendeki kelimeye yeni anlam',
  batch_merge: 'Bu gruptaki kelimeye yeni anlam',
  duplicate: 'Zaten var — atlanacak',
  review: 'Benzer anlam için seçim yap',
  skipped: 'Seçimine göre atlanacak',
};
const meaningStatuses: Record<string, string> = {
  new: 'Eklenecek',
  existing: 'Listende var — atlanacak',
  repeated: 'Bu girişte tekrar ediyor — atlanacak',
  possible_duplicate: 'Benzer olabilir — seçim bekliyor',
  similarity_skipped: 'Aynı anlam olarak işaretledin — atlanacak',
};
export function PreviewReview({
  preview,
  pending,
  confirm,
  decide,
  headingRef,
}: {
  preview: Preview;
  pending: boolean;
  confirm: () => void;
  decide: (decision: SimilarityDecision) => void;
  /** Lets the dialog bring the heading into view when a preview first appears. */
  headingRef?: Ref<HTMLHeadingElement>;
}) {
  const { counts } = preview;
  const id = useId();
  const chosenInput = useRef<HTMLInputElement | null>(null);
  // The decision whose server preview is in flight. It is only presentation: it is
  // shown while `pending` and dropped as soon as the request ends, whether the new
  // preview arrived or the request failed (the unchanged preview then shows again).
  const [inFlight, setInFlight] = useState<SimilarityDecision | null>(null);
  const [wasPending, setWasPending] = useState(pending);
  if (wasPending !== pending) {
    setWasPending(pending);
    if (!pending) setInFlight(null);
  }
  const allDuplicates =
    preview.rows.length > 0 &&
    !preview.invalid.length &&
    preview.rows.every((row) => row.status === 'duplicate');
  // The server allows saving only when something new remains. With every decision
  // made and no invalid rows, a blocked save means there is nothing left to write.
  const nothingToSave =
    !preview.canCommit && !preview.invalid.length && !preview.unresolvedDecisions;
  const saveBlocked =
    !preview.canCommit || preview.invalid.length > 0 || preview.unresolvedDecisions > 0;
  // Every visible reason the save button is unavailable, for its description.
  const blockedReasons = [
    preview.unresolvedDecisions > 0 && `${id}-unresolved`,
    preview.invalid.length > 0 && `${id}-invalid`,
    nothingToSave && `${id}-nothing`,
  ].filter(Boolean);
  useEffect(() => {
    if (pending || !chosenInput.current) return;
    const input = chosenInput.current;
    if (
      input.isConnected &&
      (document.activeElement === document.body || document.activeElement === input)
    )
      input.focus();
    chosenInput.current = null;
  }, [pending]);
  return (
    // Fades in once when it appears; recalculated previews update in place.
    <section
      aria-label="Ekleme önizlemesi"
      className="fade-in grid gap-4 border-t border-line pt-5"
    >
      <h3 ref={headingRef} className="text-h4">
        Kaydetmeden önce incele
      </h3>
      <StatGrid
        label="Ekleme özeti"
        items={[
          { label: 'Yeni kelime', value: counts.newWords, tone: 'success' },
          { label: 'Birleştirilen kelime', value: counts.mergedWords, tone: 'info' },
          { label: 'Yeni anlam', value: counts.newMeanings, tone: 'success' },
          { label: 'Atlanan anlam', value: counts.skippedMeanings, tone: 'neutral' },
        ]}
      />
      {preview.unresolvedDecisions > 0 ? (
        <p id={`${id}-unresolved`} role="status">
          Kaydetmek için {preview.unresolvedDecisions} anlamla ilgili seçimini tamamla.
        </p>
      ) : null}
      <ul className="grid gap-3">
        {preview.rows.map((row) => {
          const hasSimilarity = row.meanings.some((meaning) => meaning.similarity);
          return (
            <li
              key={row.line}
              className={
                hasSimilarity
                  ? 'min-w-0 wrap-anywhere'
                  : 'wrap-anywhere rounded-control bg-surface-sunken p-3'
              }
            >
              <p
                className={
                  hasSimilarity ? 'mb-2 text-small font-semibold text-fg-muted' : undefined
                }
              >
                {hasSimilarity ? (
                  <>
                    Satır {row.line} · <span lang="en">{row.english}</span>
                  </>
                ) : (
                  <>
                    <strong>
                      Satır {row.line}:{' '}
                      <span lang="en" className={headwordClass}>
                        {row.english}
                      </span>
                    </strong>{' '}
                    — {statuses[row.status] ?? row.status}
                  </>
                )}
              </p>
              <ul className={hasSimilarity ? 'grid gap-3' : 'mt-1 grid gap-1 text-small'}>
                {row.meanings.map((meaning, index) => (
                  <li key={index}>
                    {meaning.similarity ? (
                      <MeaningSimilarityChoice
                        line={row.line}
                        english={row.english}
                        entered={meaning.turkish}
                        similarity={meaning.similarity}
                        locked={pending}
                        pendingAction={
                          pending && inFlight?.id === meaning.similarity.id ? inFlight.action : null
                        }
                        decide={(decision, input) => {
                          if (pending) return;
                          chosenInput.current = input;
                          setInFlight(decision);
                          decide(decision);
                        }}
                      />
                    ) : (
                      <>
                        {meaning.turkish} — {meaningStatuses[meaning.status] ?? meaning.status}
                      </>
                    )}
                  </li>
                ))}
              </ul>
              {row.warnings.includes('COMMA_HINT') ? (
                <p className="mt-2 text-small">
                  Birden fazla anlam mı yazdın? Anlamları noktalı virgülle ayır.
                </p>
              ) : null}
            </li>
          );
        })}
        {preview.invalid.map((row) => (
          <li
            key={`invalid-${row.line}`}
            role="alert"
            className="wrap-anywhere rounded-control bg-danger-soft p-3 text-danger"
          >
            <strong>Satır {row.line}: Geçersiz.</strong>{' '}
            {row.codes
              .map((code) => apiErrorMessage(new ApiError('Invalid row', 400, code)))
              .join(' ')}
          </li>
        ))}
      </ul>
      {preview.invalid.length ? (
        <p id={`${id}-invalid`} className="text-danger">
          Hatalı satırları düzeltip yeniden önizle. Hiçbir kelime kaydedilmedi.
        </p>
      ) : null}
      {/* Next to the button it explains, and announced when a decision leaves nothing to save. */}
      {nothingToSave ? (
        <p
          id={`${id}-nothing`}
          role="status"
          className="flex items-start gap-2 rounded-control bg-surface-sunken p-3 text-small text-fg"
        >
          <InfoIcon className="mt-0.5 shrink-0 text-[1.1rem] text-accent" />
          <span>
            {allDuplicates
              ? 'Bu kelime ve anlam zaten listende var. Hiçbir değişiklik kaydedilmeyecek.'
              : preview.rows.some((row) => row.status === 'skipped')
                ? 'Seçimlerine göre bu anlamlar atlanacak. Kaydedilecek yeni anlam yok.'
                : 'Kaydedilecek yeni değişiklik yok.'}
          </span>
        </p>
      ) : null}
      <Button
        disabled={saveBlocked}
        aria-describedby={
          saveBlocked && blockedReasons.length ? blockedReasons.join(' ') : undefined
        }
        loading={pending}
        onClick={() => {
          setInFlight(null);
          confirm();
        }}
      >
        Onayla ve kaydet
      </Button>
    </section>
  );
}
