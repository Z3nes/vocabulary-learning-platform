import { useEffect, useId, useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { headwordClass } from '../../components/ui/Headword';
import { AlertIcon, EditIcon, ListIcon, PlusIcon } from '../../components/ui/icons';
import { ApiError } from '../../lib/api';
import { apiErrorMessage } from '../../lib/apiErrors';
import { cn } from '../../lib/cn';
import { focusMainHeading } from '../../lib/focus';
import { revealInContainer } from '../../lib/scroll';
import {
  useWordMutation,
  wordsApi,
  type Preview,
  type Submission,
  type Word,
  type WordInput,
} from '../../lib/words';
import { WordForm } from './WordForm';
import { PreviewReview } from './PreviewReview';

export type WordTarget =
  | { action: 'add' | 'bulk'; trigger: HTMLElement }
  | { action: 'edit' | 'delete'; word: Word; trigger: HTMLElement };
const titles = {
  add: 'Kelime ekle',
  bulk: 'Toplu kelime ekle',
  edit: 'Kelimeyi düzenle',
  delete: 'Kelimeyi sil',
};
const icons = {
  add: <PlusIcon />,
  bulk: <ListIcon />,
  edit: <EditIcon />,
  delete: <AlertIcon />,
};

/** Save confirmation that names only what actually happened (no "0 … atlandı"). */
function savedSummary(counts: Preview['counts']): string {
  const saved = [
    counts.newWords ? `${counts.newWords} yeni kelime` : '',
    counts.newMeanings ? `${counts.newMeanings} yeni anlam` : '',
  ].filter(Boolean);
  return [
    saved.length ? `${saved.join(' ve ')} kaydedildi.` : 'Değişikliklerin kaydedildi.',
    counts.mergedWords ? `${counts.mergedWords} kelimenin anlamları birleştirildi.` : '',
    counts.skippedMeanings ? `${counts.skippedMeanings} anlam atlandı.` : '',
  ]
    .filter(Boolean)
    .join(' ');
}

export function WordDialog({
  listId,
  target,
  close,
  saved,
}: {
  listId: string;
  target: WordTarget;
  close: () => void;
  saved: (notice: string) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  const textId = useId();
  const helpId = useId();
  const [text, setText] = useState('');
  // `reveal`: this preview was requested by the student (not a decision recalculation
  // or a stale-preview refresh), so the dialog brings it into view once.
  const [review, setReview] = useState<{
    submission: Submission;
    preview: Preview;
    reveal: boolean;
  }>();
  const [error, setError] = useState('');
  const [conflictWordId, setConflictWordId] = useState<string | null>(null);
  const focusWord = useRef<string | null>(null);
  const [pending, setPending] = useState(false);
  const busy = useRef(false);
  const removed = useRef(false);
  const previewHeading = useRef<HTMLHeadingElement>(null);
  const commit = useWordMutation(
    listId,
    ({ submission, token }: { submission: Submission; token: string }) =>
      wordsApi.commit(listId, submission, token),
  );
  const edit = useWordMutation(listId, (input: WordInput) =>
    wordsApi.edit(listId, 'word' in target ? target.word.id : '', input),
  );
  const remove = useWordMutation(listId, () =>
    wordsApi.remove(listId, 'word' in target ? target.word.id : ''),
  );
  useEffect(() => {
    dialog.current?.showModal();
    if (target.action === 'delete')
      dialog.current?.querySelector<HTMLButtonElement>('[data-cancel]')?.focus();
    else dialog.current?.querySelector<HTMLElement>('input, textarea')?.focus();
  }, [target]);
  useEffect(() => {
    if (review?.reveal && dialog.current && previewHeading.current)
      revealInContainer(dialog.current, previewHeading.current);
  }, [review]);
  async function perform(operation: () => Promise<void>) {
    if (busy.current) return;
    busy.current = true;
    setPending(true);
    setError('');
    try {
      await operation();
    } catch (cause) {
      setError(apiErrorMessage(cause));
    } finally {
      busy.current = false;
      setPending(false);
    }
  }
  async function preview(submission: Submission, reveal = false) {
    const result = await wordsApi.preview(listId, submission);
    setReview({ submission, preview: result, reveal });
  }
  function changed() {
    setReview(undefined);
    setError('');
    setConflictWordId(null);
  }
  function confirm() {
    if (!review) return;
    void perform(async () => {
      try {
        const result = await commit.mutateAsync({
          submission: review.submission,
          token: review.preview.token,
        });
        const actual = result;
        if (!actual.changed) {
          setError('Bu kelime ve anlam zaten listende var. Hiçbir değişiklik kaydedilmedi.');
          return;
        }
        saved(savedSummary(actual.counts));
        dialog.current?.close();
      } catch (cause) {
        if (cause instanceof ApiError && cause.code === 'PREVIEW_STALE') {
          setReview(undefined);
          const { decisions: _previousChoices, ...submission } = review.submission;
          await preview(submission);
          setError(apiErrorMessage(cause));
        } else throw cause;
      }
    });
  }
  return (
    <dialog
      ref={dialog}
      data-surface="light"
      data-size={target.action === 'bulk' ? 'wide' : undefined}
      className="list-dialog"
      aria-labelledby={titleId}
      onCancel={(event) => {
        if (busy.current) event.preventDefault();
      }}
      onClose={() => {
        const destination = focusWord.current
          ? document.getElementById(`word-${focusWord.current}`)?.querySelector('h2')
          : undefined;
        if (destination) destination.focus();
        else if (!removed.current && target.trigger.isConnected) target.trigger.focus();
        else focusMainHeading();
        close();
      }}
    >
      <div className="grid gap-5 p-5 sm:p-7">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className={cn(
              'grid size-10 shrink-0 place-items-center rounded-full text-[1.25rem]',
              target.action === 'delete'
                ? 'bg-danger-soft text-danger'
                : 'bg-accent-soft text-on-accent-soft',
            )}
          >
            {icons[target.action]}
          </span>
          <h2 id={titleId} className="text-h3">
            {titles[target.action]}
          </h2>
        </div>
        {target.action === 'delete' ? (
          <>
            <p className="wrap-anywhere">
              <strong lang="en" className={headwordClass}>
                {target.word.english}
              </strong>{' '}
              kelimesini tüm anlamlarıyla silmek istediğine emin misin? Bu işlemi geri alamazsın.
            </p>
          </>
        ) : target.action === 'bulk' ? (
          <form
            className="grid gap-3"
            onSubmit={(event) => {
              event.preventDefault();
              void perform(() => preview({ kind: 'bulk', text }, true));
            }}
          >
            <label htmlFor={textId} className="text-small font-semibold">
              Kelime ve anlamlarını yapıştır
            </label>
            <p id={helpId} className="text-small text-fg-muted">
              Her satıra bir İngilizce kelime veya ifade yaz. Kelime ile Türkçe anlamı = veya TAB
              karakteriyle ayır; birden fazla anlam için ; kullan. Excel veya Google Sheets’teki iki
              sütunu doğrudan yapıştırabilirsin. Kaydetmeden önce önizlemeyi incele. En fazla 500
              satır ve 100 KB.
            </p>
            <details className="rounded-control border border-line p-3 text-small">
              <summary className="cursor-pointer font-semibold">Örnek biçimi gör</summary>
              <pre className="mt-2 overflow-x-auto whitespace-pre-wrap text-fg">
                {'run = koşmak; çalışmak\nmemory = hafıza; bellek\nbinary search = ikili arama'}
              </pre>
            </details>
            <textarea
              id={textId}
              aria-describedby={helpId}
              rows={9}
              disabled={pending}
              className="w-full resize-y rounded-control border border-line-strong bg-surface-raised p-3 font-mono text-small leading-relaxed text-fg transition-[border-color] duration-(--duration-fast) ease-standard enabled:hover:border-fg"
              value={text}
              onChange={(event) => {
                setText(event.target.value);
                changed();
              }}
            />
            <Button type="submit" loading={pending}>
              Önizlemeyi göster
            </Button>
          </form>
        ) : (
          <WordForm
            initial={
              target.action === 'edit'
                ? {
                    english: target.word.english,
                    meanings: target.word.meanings.map((meaning) => meaning.turkish),
                  }
                : undefined
            }
            editing={target.action === 'edit'}
            pending={pending}
            changed={changed}
            submit={(input) =>
              perform(async () => {
                if (target.action === 'edit') {
                  try {
                    const result = await edit.mutateAsync(input);
                    saved(result.changed ? 'Kelimen güncellendi.' : 'Değişiklik yapmadın.');
                    dialog.current?.close();
                  } catch (cause) {
                    if (cause instanceof ApiError && cause.code === 'WORD_ALREADY_EXISTS') {
                      // Reuse the authoritative lookup engine only to locate the conflicting word.
                      try {
                        const lookup = await wordsApi.preview(listId, {
                          kind: 'single',
                          entry: input,
                        });
                        setConflictWordId(lookup.rows[0]?.existingWordId ?? null);
                      } catch {
                        /* Keep the original conflict feedback if lookup is unavailable. */
                      }
                    }
                    throw cause;
                  }
                } else await preview({ kind: 'single', entry: input }, true);
              })
            }
          />
        )}
        {error ? (
          <p role="alert" className="text-danger">
            {error}
          </p>
        ) : null}
        {conflictWordId ? (
          <a
            href={`#word-${conflictWordId}`}
            onClick={() => {
              focusWord.current = conflictWordId;
              dialog.current?.close();
            }}
          >
            Listendeki kelimeye git
          </a>
        ) : null}
        {review ? (
          <PreviewReview
            headingRef={previewHeading}
            preview={review.preview}
            pending={pending}
            confirm={confirm}
            decide={(decision) => {
              const submission = {
                ...review.submission,
                decisions: [
                  ...(review.submission.decisions ?? []).filter((item) => item.id !== decision.id),
                  decision,
                ],
              };
              void perform(() => preview(submission));
            }}
          />
        ) : null}
        <div className="flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:justify-end">
          <Button
            data-cancel
            variant="secondary"
            disabled={pending}
            onClick={() => dialog.current?.close()}
          >
            Vazgeç
          </Button>
          {target.action === 'delete' ? (
            <Button
              variant="danger"
              loading={pending}
              onClick={() => {
                void perform(async () => {
                  await remove.mutateAsync(undefined);
                  removed.current = true;
                  saved('Kelimen silindi.');
                  dialog.current?.close();
                });
              }}
            >
              Kelimeyi sil
            </Button>
          ) : null}
        </div>
      </div>
    </dialog>
  );
}
