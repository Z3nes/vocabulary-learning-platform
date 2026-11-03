import { useMutation } from '@tanstack/react-query';
import { useEffect, useId, useRef, useState } from 'react';
import { apiErrorMessage } from '../../lib/apiErrors';
import { fetchExamples, type ExampleSentence, type SentenceSource } from '../../lib/examples';
import { Button } from '../ui/Button';

interface Props {
  path: string;
  revision?: string;
  enabled?: boolean;
  history?: Map<string, string[]> | undefined;
}
/** Keying resets all visible/request state when an editable word or card changes. */
export function ExamplePanel({ path, revision = '', enabled = true, history }: Props) {
  return <Lookup key={`${path}:${revision}`} path={path} enabled={enabled} history={history} />;
}
function Source({
  source,
  translation = false,
}: {
  source: SentenceSource;
  translation?: boolean;
}) {
  return (
    <p className="flex flex-wrap gap-x-3 gap-y-1 text-small text-fg-muted">
      <a href={source.sourceUrl} target="_blank" rel="noopener noreferrer">
        {translation ? 'Çeviri kaynağı' : 'Kaynak: Tatoeba'}{' '}
        <span className="sr-only">(yeni sekmede açılır)</span>
      </a>
      {source.contributor ? <span>Katkı: {source.contributor}</span> : null}
      <a
        href={source.license.url}
        target="_blank"
        rel="noopener noreferrer"
        aria-label={`${translation ? 'Çeviri' : 'Cümle'} lisansı: ${source.license.name} (yeni sekmede açılır)`}
      >
        {source.license.name}
      </a>
    </p>
  );
}
function Lookup({
  path,
  enabled,
  history,
}: Pick<Props, 'path' | 'history'> & { enabled: boolean }) {
  const id = useId();
  const [open, setOpen] = useState(false);
  const [examples, setExamples] = useState<ExampleSentence[]>();
  const [error, setError] = useState<string>();
  const [loading, setLoading] = useState(false);
  const recent = useRef<string[]>(history?.get(path) ?? []);
  const generation = useRef(0);
  const controller = useRef<AbortController | null>(null);
  const sending = useRef(false);
  const trigger = useRef<HTMLButtonElement>(null);
  const mutation = useMutation({
    mutationFn: ({ exclude, signal }: { exclude: string[]; signal: AbortSignal }) =>
      fetchExamples(path, exclude, signal),
    retry: false,
    networkMode: 'always',
    gcTime: 0,
  });
  useEffect(
    () => () => {
      generation.current++;
      controller.current?.abort();
    },
    [],
  );
  async function load() {
    if (sending.current) return;
    sending.current = true;
    const requestId = ++generation.current;
    controller.current = new AbortController();
    setOpen(true);
    setLoading(true);
    setError(undefined);
    setExamples(undefined);
    try {
      const result = await mutation.mutateAsync({
        exclude: recent.current,
        signal: controller.current.signal,
      });
      if (requestId !== generation.current) return;
      setExamples(result);
      const ids = result.map((item) => item.id);
      recent.current = [...recent.current.filter((id) => !ids.includes(id)), ...ids].slice(-9);
      if (history) {
        if (!history.has(path) && history.size >= 200) history.delete(history.keys().next().value!);
        history.set(path, recent.current);
      }
    } catch (cause) {
      if (requestId === generation.current) setError(apiErrorMessage(cause));
    } finally {
      if (requestId === generation.current) {
        setLoading(false);
        sending.current = false;
      }
    }
  }
  function close() {
    generation.current++;
    controller.current?.abort();
    sending.current = false;
    setOpen(false);
    setLoading(false);
    setExamples(undefined);
    setError(undefined);
  }
  return (
    <div className="col-span-full grid min-w-0 justify-items-start gap-3 text-left">
      <Button
        ref={trigger}
        variant="ghost"
        size="sm"
        disabled={!enabled}
        aria-expanded={enabled && open}
        aria-controls={id}
        onClick={() => {
          if (open) close();
          else void load();
        }}
      >
        {enabled && open ? 'Örnek cümleleri kapat' : 'Örnek cümle göster'}
      </Button>
      {!enabled ? (
        <p className="text-small text-fg-muted">Örnek cümleler için önce cevabı göster.</p>
      ) : null}
      <div
        id={id}
        hidden={!enabled || !open}
        className="w-full min-w-0 rounded-card border border-line bg-surface p-4"
      >
        <div role="status" aria-live="polite">
          {loading
            ? 'Örnek cümleler yükleniyor…'
            : examples?.length === 0
              ? 'Bu kelime için uygun örnek cümle bulunamadı.'
              : examples
                ? `${examples.length} örnek cümle yüklendi.`
                : ''}
        </div>
        {error ? (
          <div className="grid justify-items-start gap-2">
            <p role="alert">{error}</p>
            <Button
              variant="secondary"
              size="sm"
              onClick={() => {
                trigger.current?.focus({ preventScroll: true });
                void load();
              }}
            >
              Tekrar dene
            </Button>
          </div>
        ) : null}
        {examples?.length ? (
          <>
            <ol className="mt-3 grid gap-5">
              {examples.map((example) => (
                <li key={example.id} className="grid gap-2 wrap-anywhere">
                  <p lang="en" className="text-body text-fg">
                    {example.text}
                  </p>
                  <Source source={example} />
                  {example.translation ? (
                    <>
                      <p lang="tr" className="text-body text-fg">
                        {example.translation.text}
                      </p>
                      <Source source={example.translation} translation />
                    </>
                  ) : null}
                </li>
              ))}
            </ol>
            <p className="mt-4 border-t border-line pt-3 text-small text-fg-muted">
              Cümleler Tatoeba topluluğundan alınır. Kullanılan anlam, kaydettiğin Türkçe anlamdan
              farklı olabilir; içeriği kaynağından kontrol edebilirsin.
            </p>
          </>
        ) : null}
      </div>
    </div>
  );
}
