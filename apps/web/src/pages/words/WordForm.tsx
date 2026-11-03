import { useRef, useState } from 'react';
import { Button } from '../../components/ui/Button';
import { TextField } from '../../components/ui/fields';
import { PlusIcon } from '../../components/ui/icons';
import { ApiError } from '../../lib/api';
import { apiErrorMessage } from '../../lib/apiErrors';
import { validateWord, type WordInput } from '../../lib/words';

export function WordForm({
  initial,
  editing,
  pending,
  changed,
  submit,
}: {
  initial?: WordInput | undefined;
  editing: boolean;
  pending: boolean;
  changed: () => void;
  submit: (input: WordInput) => Promise<void>;
}) {
  const [english, setEnglish] = useState(initial?.english ?? '');
  const nextId = useRef(initial?.meanings.length ?? 1);
  const [meanings, setMeanings] = useState(() =>
    (initial?.meanings ?? ['']).map((value, id) => ({ id, value })),
  );
  const [error, setError] = useState('');
  const busy = useRef(false);
  const meaningInputs = useRef(new Map<number, HTMLInputElement>());
  function change() {
    setError('');
    changed();
  }
  return (
    <form
      noValidate
      className="grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        if (pending || busy.current) return;
        const input = { english, meanings: meanings.map((meaning) => meaning.value) };
        const code = validateWord(input, editing);
        if (code) {
          setError(apiErrorMessage(new ApiError('Invalid input', 400, code)));
          return;
        }
        busy.current = true;
        void submit(input).finally(() => {
          busy.current = false;
        });
      }}
    >
      <fieldset disabled={pending} className="grid min-w-0 gap-4">
        <TextField
          label="İngilizce kelime veya ifade"
          required
          value={english}
          onChange={(event) => {
            setEnglish(event.target.value);
            change();
          }}
        />
        <fieldset className="grid min-w-0 gap-3">
          <legend className="mb-2 text-small font-semibold">Türkçe anlamlar</legend>
          {meanings.map((meaning, index) => (
            <div key={meaning.id} className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
              <TextField
                ref={(input) => {
                  if (input) meaningInputs.current.set(meaning.id, input);
                  else meaningInputs.current.delete(meaning.id);
                }}
                required
                label={`Türkçe anlam ${index + 1}`}
                value={meaning.value}
                onChange={(event) => {
                  setMeanings((rows) =>
                    rows.map((row) =>
                      row.id === meaning.id ? { ...row, value: event.target.value } : row,
                    ),
                  );
                  change();
                }}
              />
              <Button
                variant="danger-ghost"
                disabled={meanings.length === 1}
                aria-label={`${index + 1}. anlamı kaldır`}
                onClick={() => {
                  setMeanings((rows) => rows.filter((row) => row.id !== meaning.id));
                  change();
                  const remaining = meanings.filter((row) => row.id !== meaning.id);
                  const focusId = remaining[Math.min(index, remaining.length - 1)]?.id;
                  if (focusId !== undefined) meaningInputs.current.get(focusId)?.focus();
                }}
              >
                Kaldır
              </Button>
            </div>
          ))}
          <Button
            className="justify-self-start"
            variant="secondary"
            size="sm"
            icon={<PlusIcon />}
            onClick={() => {
              const id = nextId.current++;
              setMeanings((rows) => [...rows, { id, value: '' }]);
              change();
              queueMicrotask(() => meaningInputs.current.get(id)?.focus());
            }}
          >
            Anlam ekle
          </Button>
          <p className="text-small text-fg-muted">Kelimenin en az bir Türkçe anlamı olmalı.</p>
        </fieldset>
      </fieldset>
      {error ? (
        <p role="alert" className="text-danger">
          {error}
        </p>
      ) : null}
      <Button type="submit" loading={pending} className="justify-self-start">
        {editing ? 'Değişiklikleri kaydet' : 'Önizlemeyi göster'}
      </Button>
    </form>
  );
}
