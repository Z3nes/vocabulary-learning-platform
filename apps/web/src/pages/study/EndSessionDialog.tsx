import { useEffect, useId, useRef } from 'react';
import { Button } from '../../components/ui/Button';
import { apiErrorMessage } from '../../lib/apiErrors';
import { focusMainHeading } from '../../lib/focus';
import { isOutdatedError, resolvedCount, useEndSession, type StudySession } from '../../lib/study';

/**
 * The only confirmation in the study flow: ending the whole unfinished session.
 * Card evaluations never ask for confirmation. Same native dialog pattern as the
 * list dialogs (focus starts on "keep studying", returns to the trigger on close).
 */
export function EndSessionDialog({
  session,
  trigger,
  close,
  ended,
}: {
  session: StudySession;
  trigger: HTMLElement;
  close: () => void;
  ended: (session: StudySession) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const descriptionId = useId();
  const end = useEndSession(session.id);
  const done = useRef(false);
  const busy = useRef(false);
  const answered = resolvedCount(session.counts);
  const open = session.counts.unanswered;

  useEffect(() => {
    dialog.current?.showModal();
    dialog.current?.querySelector<HTMLButtonElement>('[data-cancel]')?.focus();
  }, []);

  async function confirm() {
    if (busy.current) return;
    busy.current = true;
    try {
      const result = await end.mutateAsync();
      // Reported directly: the stored result can already have unmounted this dialog
      // (the page swaps its content once the session is no longer active).
      done.current = true;
      ended(result.session);
      dialog.current?.close();
    } catch {
      /* Rendered below; outdated sessions are reloaded by the mutation. */
    } finally {
      busy.current = false;
    }
  }

  return (
    <dialog
      ref={dialog}
      data-surface="light"
      className="list-dialog"
      aria-labelledby={headingId}
      aria-describedby={descriptionId}
      onCancel={(event) => {
        if (end.isPending) event.preventDefault();
      }}
      onClose={() => {
        if (done.current) {
          /* The caller moves on (summary or setup form). */
        } else if (trigger.isConnected) trigger.focus();
        else focusMainHeading();
        close();
      }}
    >
      <div className="grid gap-5 p-5 sm:p-7">
        <h2 id={headingId} className="text-h3 text-fg">
          Çalışmayı bitirmek istiyor musun?
        </h2>
        <div id={descriptionId} className="grid gap-2 text-body text-fg">
          <p>
            Şimdiye kadar değerlendirdiğin {answered} kart kaydedildi ve korunur.
            {open
              ? ` Henüz değerlendirmediğin ${open} kart "Bilemedim" sayılmaz; sonuçlarda cevaplanmayan olarak görünür.`
              : null}
          </p>
          <p>Bitirdikten sonra bu listede yeni bir çalışma başlatabilirsin.</p>
        </div>
        {end.error ? (
          <p role="alert" className="text-danger">
            {apiErrorMessage(end.error)}
            {isOutdatedError(end.error) ? null : ' Çalışman olduğu gibi duruyor.'}
          </p>
        ) : null}
        <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
          <Button
            data-cancel
            variant="secondary"
            disabled={end.isPending}
            onClick={() => dialog.current?.close()}
          >
            Çalışmaya devam et
          </Button>
          <Button
            loading={end.isPending}
            onClick={() => {
              void confirm();
            }}
          >
            Çalışmayı bitir
          </Button>
        </div>
      </div>
    </dialog>
  );
}
