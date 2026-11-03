import { useId, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router';
import { Button } from '../../components/ui/Button';
import { ButtonLink } from '../../components/ui/ButtonLink';
import { sheetClass, sheetSectionClass } from '../../components/ui/Card';
import { ChoiceGroup, ChoiceTile } from '../../components/ui/ChoiceTile';
import { EmptyState } from '../../components/ui/EmptyState';
import { CardsIcon, PlusIcon } from '../../components/ui/icons';
import { ModeIcon } from '../../components/ui/modeIcons';
import { PageHeader } from '../../components/ui/PageHeader';
import { ProgressBar } from '../../components/ui/Progress';
import { StatusNotice } from '../../components/ui/StatusNotice';
import { ApiError } from '../../lib/api';
import { apiErrorMessage } from '../../lib/apiErrors';
import { cn } from '../../lib/cn';
import { focusMainHeading } from '../../lib/focus';
import { useList } from '../../lib/lists';
import {
  directionLabels,
  estimatedCardCount,
  resolvedCount,
  studyPercentages,
  useActiveSession,
  useStartSession,
  type StudyDirection,
  type StudyPercentage,
  type StudySession,
} from '../../lib/study';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { EndSessionDialog } from './EndSessionDialog';
import { ErrorPanel, LoadingNotice } from './parts';
import { percentLabel, sessionFacts, studyPaths } from './studyFormat';

const directions: { id: StudyDirection; description: string }[] = [
  { id: 'en-tr', description: 'İngilizce kelimeyi görürsün, Türkçe anlamlarını hatırlarsın.' },
  {
    id: 'tr-en',
    description: 'Türkçe anlamların hepsini görürsün, İngilizce kelimeyi hatırlarsın.',
  },
];

/**
 * Study entry for one list: resumes the list's unfinished session or starts a new one.
 * An existing active session is never replaced; it must be resumed or ended first.
 */
export function StudySetupPage() {
  const { id = '' } = useParams();
  const list = useList(id);
  const active = useActiveSession(id);
  const [ended, setEnded] = useState<StudySession | null>(null);
  useDocumentTitle(list.data ? `${list.data.title} · Kelime kartları` : 'Kelime kartları');

  let body;
  if (list.isError) body = <ErrorPanel error={list.error} retry={() => void list.refetch()} />;
  else if (active.isError)
    body = <ErrorPanel error={active.error} retry={() => void active.refetch()} />;
  else if (list.isPending || list.isPlaceholderData || active.isPending)
    body = <LoadingNotice rows={3}>Çalışma bilgilerin yükleniyor…</LoadingNotice>;
  else if (active.data)
    body = (
      <ResumePanel
        session={active.data}
        ended={(session) => {
          setEnded(session);
          // The panel (and its trigger) is replaced by the setup form.
          focusMainHeading();
        }}
      />
    );
  else if (!list.data.wordCount)
    body = (
      <EmptyState
        icon={<CardsIcon />}
        headingLevel="h2"
        title="Bu listede henüz kelime yok"
        description="Kelime kartlarıyla çalışmak için listende en az bir kelime olmalı. Listene dönüp kelime ekleyebilirsin."
        actions={
          <ButtonLink to={studyPaths.list(id)} icon={<PlusIcon />}>
            Listeye dön ve kelime ekle
          </ButtonLink>
        }
      />
    );
  else body = <SetupForm listId={id} wordCount={list.data.wordCount} />;

  return (
    <div data-mode="flashcards" className="grid max-w-4xl gap-7">
      <PageHeader
        mode="flashcards"
        art
        back={{ to: studyPaths.list(id), label: 'Listeye dön' }}
        eyebrow="Kelime kartları"
        title="Kelime kartlarıyla çalış"
        // Always rendered, so the header keeps its height while the list loads.
        description={
          <p className="wrap-anywhere">
            {list.data ? (
              <>
                <strong className="text-fg">{list.data.title}</strong> · {list.data.wordCount}{' '}
                kelime.{' '}
              </>
            ) : null}
            Bu çalışma yalnızca bu listedeki kelimeleri kullanır.
          </p>
        }
      />
      {ended ? (
        <div className="grid gap-2">
          <StatusNotice message="Önceki çalışmanı bitirdin. Verdiğin cevaplar kaydedildi." />
          <Link to={studyPaths.summary(ended.id)} className="justify-self-start text-body">
            Önceki çalışmanın sonuçlarını gör
          </Link>
        </div>
      ) : null}
      {body}
    </div>
  );
}

function ResumePanel({
  session,
  ended,
}: {
  session: StudySession;
  ended: (session: StudySession) => void;
}) {
  const titleId = useId();
  const [trigger, setTrigger] = useState<HTMLElement | null>(null);
  const { counts } = session;
  return (
    <section
      aria-labelledby={titleId}
      className={cn(sheetClass, 'grid gap-5 border-l-4 border-l-(--mode-deep) p-5 sm:p-6')}
    >
      <div className="grid gap-2">
        <h2 id={titleId} className="text-h3 text-fg">
          Yarım kalan bir çalışman var
        </h2>
        <p className="text-body text-fg">
          {sessionFacts(session)}. Tamamlanan {resolvedCount(counts)} / {counts.total}.
        </p>
        <ProgressBar
          value={resolvedCount(counts)}
          max={counts.total}
          tone="mode"
          className="max-w-md"
        />
        <p className="text-small text-fg-muted">
          Yeni bir çalışma başlatmak için önce bu çalışmaya devam edip bitirmen ya da onu şimdi
          bitirmen gerekir.
        </p>
      </div>
      <div className="flex flex-wrap gap-3">
        <ButtonLink to={studyPaths.session(session.id)} variant="mode" icon={<CardsIcon />}>
          Çalışmaya devam et
        </ButtonLink>
        <Button
          variant="secondary"
          aria-haspopup="dialog"
          onClick={(event) => setTrigger(event.currentTarget)}
        >
          Çalışmayı bitir
        </Button>
      </div>
      {trigger ? (
        <EndSessionDialog
          session={session}
          trigger={trigger}
          close={() => setTrigger(null)}
          ended={ended}
        />
      ) : null}
    </section>
  );
}

function SetupForm({ listId, wordCount }: { listId: string; wordCount: number }) {
  const id = useId();
  const navigate = useNavigate();
  const start = useStartSession(listId);
  const [percentage, setPercentage] = useState<StudyPercentage>(25);
  const [direction, setDirection] = useState<StudyDirection>('en-tr');
  const busy = useRef(false);

  async function submit() {
    if (busy.current) return;
    busy.current = true;
    try {
      const session = await start.mutateAsync({ percentage, direction });
      await navigate(studyPaths.session(session.id));
    } catch {
      /* Rendered below. STUDY_SESSION_ACTIVE reloads the page's active session. */
    } finally {
      busy.current = false;
    }
  }
  // STUDY_SESSION_ACTIVE swaps this form for the resume panel once reloaded.
  const conflict = start.error instanceof ApiError && start.error.code === 'STUDY_SESSION_ACTIVE';

  return (
    <form
      className={cn(sheetClass, 'grid divide-y divide-line')}
      aria-describedby={start.error && !conflict ? `${id}-error` : undefined}
      onSubmit={(event) => {
        event.preventDefault();
        void submit();
      }}
    >
      <div className={sheetSectionClass}>
        <ChoiceGroup
          legend="Çalışma boyutu"
          hint="Listendeki kelimelerin ne kadarıyla çalışmak istediğini seç. Kart sayısı yukarı yuvarlanır. Daha önce bilemediğin kelimeler önce seçilir."
          columns="grid-cols-2 md:grid-cols-4"
        >
          {studyPercentages.map((value) => (
            <ChoiceTile
              key={value}
              name={`${id}-percentage`}
              value={value}
              checked={percentage === value}
              onChange={() => setPercentage(value)}
              label={percentLabel(value)}
              detail={`${estimatedCardCount(wordCount, value)} kart`}
            />
          ))}
        </ChoiceGroup>
      </div>

      <div className={sheetSectionClass}>
        <ChoiceGroup
          legend="Çalışma yönü"
          hint="İki yön de aynı öğrenme geçmişini kullanır: bir yönde bilemediğin kelime, diğer yönde de önce gelir."
          columns="md:grid-cols-2"
        >
          {directions.map((option) => (
            <ChoiceTile
              key={option.id}
              name={`${id}-direction`}
              value={option.id}
              checked={direction === option.id}
              onChange={() => setDirection(option.id)}
              label={directionLabels[option.id]}
              detail={option.description}
              describeDetail
            />
          ))}
        </ChoiceGroup>
      </div>

      <div className={cn(sheetSectionClass, 'rounded-b-panel bg-surface/60')}>
        {start.error && !conflict ? (
          <p id={`${id}-error`} role="alert" className="text-body text-danger">
            {apiErrorMessage(start.error)}
          </p>
        ) : null}
        <div className="flex flex-wrap items-center gap-x-4 gap-y-3">
          <Button
            type="submit"
            size="lg"
            variant="mode"
            loading={start.isPending}
            icon={<ModeIcon mode="flashcards" />}
          >
            Çalışmaya başla
          </Button>
          <p className="text-body text-fg">
            Bu çalışma {estimatedCardCount(wordCount, percentage)} karttan oluşacak.
          </p>
        </div>
      </div>
    </form>
  );
}
