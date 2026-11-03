import { useRef, useState, type FormEvent } from 'react';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/fields';
import { apiErrorMessage, validateListTitle } from '../../lib/apiErrors';

export function TitleForm({
  initialTitle = '',
  pending,
  serverError,
  submit,
  cancel,
  submitLabel = 'Oluştur',
}: {
  initialTitle?: string;
  pending: boolean;
  serverError: unknown;
  submit: (title: string) => Promise<unknown>;
  cancel?: () => void;
  submitLabel?: string;
}) {
  const [value, setValue] = useState(initialTitle);
  const [error, setError] = useState<string>();
  const input = useRef<HTMLInputElement>(null);
  const busy = useRef(false);
  async function handleSubmit(event: FormEvent) {
    event.preventDefault();
    if (busy.current || pending) return;
    const parsed = validateListTitle(value);
    setError(parsed.error);
    if (parsed.error) {
      input.current?.focus();
      return;
    }
    busy.current = true;
    try {
      await submit(parsed.title);
    } catch {
      /* Mutation state supplies the translated error. */
    } finally {
      busy.current = false;
    }
  }
  return (
    <form
      noValidate
      onSubmit={(event) => {
        void handleSubmit(event);
      }}
      className="grid gap-5"
    >
      <TextField
        ref={input}
        label="Liste başlığı"
        required
        value={value}
        disabled={pending}
        onChange={(event) => {
          setValue(event.target.value);
          setError(undefined);
        }}
        hint="1. Hafta, Ekim ya da Algorithms gibi istediğin bir başlık seç. En fazla 100 karakter kullan."
        error={error}
      />
      {error ? (
        <p role="alert" className="sr-only">
          {error}
        </p>
      ) : null}
      {serverError ? (
        <p role="alert" className="text-body text-danger">
          {apiErrorMessage(serverError)}
        </p>
      ) : null}
      <div className="flex flex-wrap gap-3">
        <Button type="submit" loading={pending}>
          {submitLabel}
        </Button>
        {cancel ? (
          <Button variant="secondary" disabled={pending} onClick={cancel}>
            Vazgeç
          </Button>
        ) : null}
      </div>
    </form>
  );
}
