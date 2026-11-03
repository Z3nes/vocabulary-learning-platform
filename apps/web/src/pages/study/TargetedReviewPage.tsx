import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query';
import { useId, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Button } from '../../components/ui/Button';
import { ButtonLink } from '../../components/ui/ButtonLink';
import { sheetClass, sheetSectionClass } from '../../components/ui/Card';
import { SelectField } from '../../components/ui/fields';
import { ModeIcon, ModeTile } from '../../components/ui/modeIcons';
import { PageHeader } from '../../components/ui/PageHeader';
import { ProgressBar } from '../../components/ui/Progress';
import { ApiError, isRecord, request } from '../../lib/api';
import { apiErrorMessage } from '../../lib/apiErrors';
import { cn } from '../../lib/cn';
import {
  directionLabels,
  isStudySession,
  resolvedCount,
  storeStudySession,
  useActiveSession,
  type StudyDirection,
  type StudyPercentage,
} from '../../lib/study';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { EndSessionDialog } from './EndSessionDialog';
import { ErrorPanel, LoadingNotice } from './parts';
import { PercentageChoices } from './PracticeChoices';
import { studyPaths } from './studyFormat';

export function TargetedReviewPage() {
  const { id } = useParams();
  const listId = id ?? null;
  const active = useActiveSession(listId, true);
  const client = useQueryClient();
  const navigate = useNavigate();
  const [percentage, setPercentage] = useState<StudyPercentage>(25);
  const [direction, setDirection] = useState<StudyDirection>('en-tr');
  const [trigger, setTrigger] = useState<HTMLElement | null>(null);
  const busy = useRef(false);
  const formId = useId();
  const count = useQuery({
    queryKey: ['review', 'eligible', listId],
    staleTime: 0,
    queryFn: async ({ signal }) => {
      const result = await request(
        '/review/study-sessions/eligibility',
        'POST',
        { listId },
        signal,
      );
      if (
        !isRecord(result) ||
        !Number.isSafeInteger(result['count']) ||
        Number(result['count']) < 0
      )
        throw new ApiError('Invalid API response', 200);
      return Number(result['count']);
    },
  });
  const start = useMutation({
    mutationFn: async () => {
      const result = await request('/review/study-sessions', 'POST', {
        listId,
        percentage,
        direction,
      });
      if (!isRecord(result) || !isStudySession(result['session']))
        throw new ApiError('Invalid API response', 200);
      return result['session'];
    },
    onSuccess: async (session) => {
      await storeStudySession(client, session);
      await navigate(studyPaths.session(session.id));
    },
    onError: async () => {
      await active.refetch();
      await count.refetch();
    },
  });
  useDocumentTitle('Zorlandıklarımı Çalış');
  async function begin() {
    if (busy.current) return;
    busy.current = true;
    try {
      await start.mutateAsync();
    } catch {
      /* Rendered below. */
    } finally {
      busy.current = false;
    }
  }
  return (
    <div data-mode="review" className="grid max-w-4xl gap-7">
      <PageHeader
        mode="review"
        art
        back={
          listId
            ? { to: `/lists/${listId}`, label: 'Listeye dön' }
            : { to: '/history/review', label: 'Tekrar alanına dön' }
        }
        eyebrow="Kelime Çalış"
        title="Zorlandıklarımı Çalış"
        description={
          <p>
            {listId ? 'Yalnızca bu listendeki' : 'Tüm listelerindeki'} güncel tekrar önceliği olan
            kelimelerle çalış. Öğrenme geçmişin iki yönde de ortaktır.
          </p>
        }
      />
      {active.isError || count.isError ? (
        <ErrorPanel
          error={active.error ?? count.error}
          retry={() => {
            void active.refetch();
            void count.refetch();
          }}
        />
      ) : active.isPending || count.isPending ? (
        <LoadingNotice rows={3}>Tekrar bilgilerin yükleniyor…</LoadingNotice>
      ) : active.data ? (
        <section
          aria-labelledby={`${formId}-resume`}
          className={cn(sheetClass, 'grid gap-5 border-l-4 border-l-(--mode-deep) p-5 sm:p-6')}
        >
          <div className="grid gap-2">
            <h2 id={`${formId}-resume`} className="text-h3 text-fg">
              Yarım kalan bir çalışman var
            </h2>
            <p className="text-body text-fg">
              {active.data.listTitle} · {active.data.counts.total} kart
            </p>
            <ProgressBar
              value={resolvedCount(active.data.counts)}
              max={active.data.counts.total}
              tone="mode"
              className="max-w-md"
            />
            <p className="text-small text-fg-muted">
              Tamamlanan {resolvedCount(active.data.counts)} / {active.data.counts.total}. Yeni bir
              tekrar çalışması başlatmak için önce bu çalışmaya devam edip bitirmen ya da onu şimdi
              bitirmen gerekir.
            </p>
          </div>
          <div className="flex flex-wrap gap-3">
            <ButtonLink
              to={studyPaths.session(active.data.id)}
              variant="mode"
              icon={<ModeIcon mode="review" />}
            >
              Devam Et
            </ButtonLink>
            <Button
              variant="secondary"
              aria-haspopup="dialog"
              onClick={(e) => setTrigger(e.currentTarget)}
            >
              Çalışmayı bitir
            </Button>
          </div>
          {trigger ? (
            <EndSessionDialog
              session={active.data}
              trigger={trigger}
              close={() => setTrigger(null)}
              ended={() => {
                void count.refetch();
              }}
            />
          ) : null}
        </section>
      ) : !count.data ? (
        <div className={cn(sheetClass, 'grid justify-items-start gap-4 p-5 sm:p-6')}>
          <ModeTile mode="review" />
          <p role="status" className="max-w-2xl text-body text-fg">
            Bu kapsamda şu anda tekrar önceliği olan kelimen yok. Bilemedim dediğin kelimeler burada
            yer alır; iki ayrı çalışmadaki başarıyla öncelikleri kalkar.
          </p>
          <ButtonLink to="/study" variant="secondary" icon={<ModeIcon mode="flashcards" />}>
            Kelime Çalış sayfasına git
          </ButtonLink>
        </div>
      ) : (
        <form
          className={cn(sheetClass, 'grid divide-y divide-line')}
          aria-describedby={start.error ? `${formId}-error` : undefined}
          onSubmit={(e) => {
            e.preventDefault();
            void begin();
          }}
        >
          <div className="flex items-center gap-4 rounded-t-panel bg-highlight/60 px-5 py-4 sm:px-6">
            <ModeTile mode="review" />
            <p className="text-body text-fg">
              <strong className="text-h3 tabular-nums">{count.data}</strong> kelimen tekrar
              bekliyor.
            </p>
          </div>
          <div className={sheetSectionClass}>
            <PercentageChoices
              count={count.data}
              value={percentage}
              change={setPercentage}
              unit="kart"
              summary={(cards) => `Bu çalışma ${cards} karttan oluşacak.`}
            />
          </div>
          <div className={sheetSectionClass}>
            <div className="max-w-sm">
              <SelectField
                label="Çalışma yönü"
                value={direction}
                onChange={(e) => setDirection(e.target.value as StudyDirection)}
              >
                {(['en-tr', 'tr-en'] as const).map((d) => (
                  <option key={d} value={d}>
                    {directionLabels[d]}
                  </option>
                ))}
              </SelectField>
            </div>
          </div>
          <div className={cn(sheetSectionClass, 'rounded-b-panel bg-surface/60')}>
            <p className="text-small text-fg-muted">
              Kelime kartlarındaki Bildim, Bilemedim ve Atla/Çıkar kuralları geçerlidir. Diğer
              kapsamlardaki çalışmaların bağımsız olarak devam eder.
            </p>
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
              icon={<ModeIcon mode="review" />}
              className="justify-self-start"
            >
              Çalışmaya başla
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}
