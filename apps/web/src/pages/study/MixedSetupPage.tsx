import { useId, useRef, useState } from 'react';
import { Link, useNavigate, useSearchParams } from 'react-router';
import { Button } from '../../components/ui/Button';
import { sheetClass, sheetSectionClass } from '../../components/ui/Card';
import { SelectField } from '../../components/ui/fields';
import { ArrowRightIcon, InfoIcon } from '../../components/ui/icons';
import { ModeIcon, ModeTile } from '../../components/ui/modeIcons';
import { PageHeader } from '../../components/ui/PageHeader';
import { apiErrorMessage } from '../../lib/apiErrors';
import { cn } from '../../lib/cn';
import { useLists } from '../../lib/lists';
import { useMixedSetup, useStartMixed } from '../../lib/mixed';
import type { StudyPercentage } from '../../lib/study';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { ErrorPanel, LoadingNotice } from './parts';
import { PercentageChoices } from './PracticeChoices';
import { PracticeResume } from './WrittenRecallPage';

export function MixedSetupPage() {
  const [params, setParams] = useSearchParams(),
    listId = params.get('list') || null;
  const lists = useLists(),
    setup = useMixedSetup(listId),
    start = useStartMixed(listId);
  const [percentage, setPercentage] = useState<StudyPercentage>(25);
  const navigate = useNavigate(),
    busy = useRef(false);
  const formId = useId();
  useDocumentTitle('Karma Çalışma');
  return (
    <div data-mode="mixed" className="grid max-w-4xl gap-7">
      <PageHeader
        mode="mixed"
        art
        back={{ to: '/study', label: 'Kelime Çalış sayfasına dön' }}
        eyebrow="Kelime Çalış"
        title="Karma Çalışma"
        description="Kartlarla hatırla, İngilizce yaz, dinle ve seçeneklerle kendini kontrol et. Tek oturumda farklı yöntemlerle çalış."
      />
      {lists.isPending ? (
        <LoadingNotice>Listelerin yükleniyor…</LoadingNotice>
      ) : lists.isError ? (
        <ErrorPanel error={lists.error} retry={() => void lists.refetch()} />
      ) : (
        <div className={cn(sheetClass, sheetSectionClass)}>
          <div className="max-w-md">
            <SelectField
              label="Çalışma kapsamı"
              hint="Tüm listelerinden ya da yalnızca bir listenden sorular gelir."
              value={listId ?? ''}
              onChange={(e) => setParams(e.target.value ? { list: e.target.value } : {})}
            >
              <option value="">Tüm listelerin</option>
              {lists.data.map((l) => (
                <option value={l.id} key={l.id}>
                  {l.title}
                </option>
              ))}
            </SelectField>
          </div>
        </div>
      )}
      {setup.isPending ? (
        <LoadingNotice rows={3}>Çalışman hazırlanıyor…</LoadingNotice>
      ) : setup.isError ? (
        <ErrorPanel error={setup.error} retry={() => void setup.refetch()} />
      ) : (
        <>
          {setup.data.resumable.length ? (
            <details className="group rounded-panel border border-line bg-surface-raised">
              <summary className="flex min-h-12 cursor-pointer items-center gap-2 rounded-panel px-5 py-3 text-body font-semibold text-fg">
                <ArrowRightIcon
                  aria-hidden="true"
                  className="shrink-0 text-accent transition-transform duration-(--duration-fast) ease-standard group-open:rotate-90"
                />
                Yarım kalan karma çalışmaların
              </summary>
              <ul className="grid divide-y divide-line border-t border-line">
                {setup.data.resumable.map((s) => (
                  <li key={s.id} className="px-5 py-3">
                    <Link to={`/study/practice/${s.id}`} className="font-semibold">
                      {s.listTitle} · {s.questionCount} soru · Devam Et
                    </Link>
                  </li>
                ))}
              </ul>
            </details>
          ) : null}
          {setup.data.session ? (
            <PracticeResume session={setup.data.session} />
          ) : setup.data.eligibleCount === 0 ? (
            <div className={cn(sheetClass, 'grid justify-items-start gap-4 p-5 sm:p-6')}>
              <ModeTile mode="mixed" />
              <p role="status" className="max-w-2xl text-body text-fg">
                Bu kapsamda henüz kelime yok. Listene kelime ekleyebilir veya başka bir kapsam
                seçebilirsin.
              </p>
            </div>
          ) : (
            <form
              className={cn(sheetClass, 'grid divide-y divide-line')}
              aria-labelledby={`${formId}-title`}
              aria-describedby={start.error ? `${formId}-error` : undefined}
              onSubmit={(e) => {
                e.preventDefault();
                if (busy.current) return;
                busy.current = true;
                void start
                  .mutateAsync(percentage)
                  .then((s) => navigate(`/study/practice/${s.id}`))
                  .catch(() => {})
                  .finally(() => {
                    busy.current = false;
                  });
              }}
            >
              <div className="flex items-center gap-4 px-5 py-4 sm:px-6">
                <ModeTile mode="mixed" />
                <h2 id={`${formId}-title`} className="wrap-anywhere text-h3 text-fg">
                  {setup.data.title}
                </h2>
              </div>
              <div className={sheetSectionClass}>
                <PercentageChoices
                  count={setup.data.eligibleCount}
                  value={percentage}
                  change={setPercentage}
                />
              </div>
              <div className={cn(sheetSectionClass, 'text-small text-fg')}>
                <p className="flex items-start gap-2">
                  <InfoIcon className="mt-0.5 shrink-0 text-[1.05rem] text-fg-muted" />
                  Her kelime bu oturumda bir kez gelir. Kart, Yazılı Cevap ve Dinle ve Yaz
                  kullanılabilir; dört çakışmayan seçenek bulunabilirse seçenekli tanıma da eklenir.
                  Az sorulu çalışmalarda daha az yöntem kullanılır.
                </p>
                <p className="pl-7 text-fg-muted">
                  “Bildim” öz bildirimi ve hedefi doğru yazdığın cevaplar yalnızca tamamlamada
                  pozitif öğrenme katkısı sağlar. Seçenekli cevaplar katkı vermez. Yanlış,
                  “Bilemedim” veya ses atlama tekrar önceliğini ve mevcut serini değiştirmez.
                </p>
              </div>
              <div className={cn(sheetSectionClass, 'rounded-b-panel bg-surface/60')}>
                {start.error ? (
                  <p id={`${formId}-error`} role="alert" className="text-body text-danger">
                    {apiErrorMessage(start.error)}
                  </p>
                ) : null}
                <Button
                  type="submit"
                  size="lg"
                  variant="mode"
                  loading={start.isPending}
                  icon={<ModeIcon mode="mixed" />}
                  className="justify-self-start"
                >
                  Karma çalışmaya başla
                </Button>
              </div>
            </form>
          )}
        </>
      )}
    </div>
  );
}
