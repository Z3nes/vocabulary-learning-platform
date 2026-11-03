import { useEffect, useId, useRef } from 'react';
import { Button } from '../../components/ui/Button';
import { AlertIcon, BookIcon } from '../../components/ui/icons';
import { apiErrorMessage } from '../../lib/apiErrors';
import { focusMainHeading } from '../../lib/focus';
import { useDeleteList, useRenameList, type WordList } from '../../lib/lists';
import { TitleForm } from './TitleForm';

export interface ListDialogTarget {
  list: WordList;
  action: 'rename' | 'delete';
  trigger: HTMLElement;
}

export function ListDialog({
  target,
  close,
  onDeleted,
}: {
  target: ListDialogTarget;
  close: () => void;
  onDeleted: () => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const headingId = useId();
  const descriptionId = useId();
  const rename = useRenameList();
  const remove = useDeleteList();
  const busy = useRef(false);
  const deleted = useRef(false);
  const pending = rename.isPending || remove.isPending;
  useEffect(() => {
    dialog.current?.showModal();
    if (target.action === 'rename') dialog.current?.querySelector('input')?.focus();
    else dialog.current?.querySelector<HTMLButtonElement>('[data-cancel]')?.focus();
  }, [target]);

  async function deleteList() {
    if (busy.current) return;
    busy.current = true;
    try {
      await remove.mutateAsync(target.list.id);
      deleted.current = true;
      dialog.current?.close();
    } catch {
      /* Error is rendered below. */
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
        if (pending) event.preventDefault();
      }}
      onClose={() => {
        if (deleted.current) onDeleted();
        else if (target.trigger.isConnected) target.trigger.focus();
        else focusMainHeading();
        close();
      }}
    >
      <div className="grid gap-5 p-5 sm:p-7">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className={
              target.action === 'delete'
                ? 'grid size-10 shrink-0 place-items-center rounded-full bg-danger-soft text-[1.25rem] text-danger'
                : 'grid size-10 shrink-0 place-items-center rounded-full bg-accent-soft text-[1.25rem] text-on-accent-soft'
            }
          >
            {target.action === 'delete' ? <AlertIcon /> : <BookIcon />}
          </span>
          <h2 id={headingId} className="text-h3 text-fg">
            {target.action === 'rename' ? 'Listeyi yeniden adlandır' : 'Listeyi sil'}
          </h2>
        </div>
        <p id={descriptionId} className="wrap-anywhere text-body text-fg">
          <strong>{target.list.title}</strong>
          {target.action === 'delete'
            ? ' adlı listeni silmek istediğine emin misin? Bu işlemi geri alamazsın.'
            : ' adlı listenin başlığını değiştir.'}
        </p>
        {target.action === 'rename' ? (
          <TitleForm
            initialTitle={target.list.title}
            pending={pending}
            serverError={rename.error}
            submitLabel="Kaydet"
            cancel={() => dialog.current?.close()}
            submit={async (title) => {
              await rename.mutateAsync({ id: target.list.id, title });
              dialog.current?.close();
            }}
          />
        ) : (
          <>
            {remove.error ? (
              <p role="alert" className="text-danger">
                {apiErrorMessage(remove.error)}
              </p>
            ) : null}
            <div className="flex flex-col gap-3 sm:flex-row sm:justify-end">
              <Button
                data-cancel
                variant="secondary"
                disabled={pending}
                onClick={() => dialog.current?.close()}
              >
                Vazgeç
              </Button>
              <Button
                variant="danger"
                loading={pending}
                onClick={() => {
                  void deleteList();
                }}
              >
                Listeyi sil
              </Button>
            </div>
          </>
        )}
      </div>
    </dialog>
  );
}
