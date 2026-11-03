import { useId, useState, type ReactNode } from 'react';
import { Navigate, useParams } from 'react-router';
import { ButtonLink } from '../../components/ui/ButtonLink';
import { sheetClass } from '../../components/ui/Card';
import { headwordClass } from '../../components/ui/Headword';
import { CardsIcon, CheckIcon } from '../../components/ui/icons';
import { PageHeader } from '../../components/ui/PageHeader';
import { StatGrid, type StatTone } from '../../components/ui/Stats';
import { cn } from '../../lib/cn';
import {
  directionLabels,
  useActiveSession,
  useStudySession,
  type StudyCard,
  type StudySession,
} from '../../lib/study';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { ErrorPanel, LoadingNotice } from './parts';
import { formatDateTime, percentLabel, studyPaths } from './studyFormat';

type Group = 'known' | 'missed' | 'removed' | 'unanswered';
const groups: {
  id: Group;
  label: string;
  stat: StatTone;
  /** Segment color in the composition bar. */
  bar: string;
  empty: string;
}[] = [
  {
    id: 'known',
    label: 'Bildim',
    stat: 'success',
    bar: 'bg-success',
    empty: 'Bu çalışmada "Bildim" dediğin kart yok.',
  },
  {
    // Amber, as on the card buttons: a word to review, not a mistake.
    id: 'missed',
    label: 'Bilemedim',
    stat: 'highlight',
    bar: 'bg-on-highlight',
    empty: 'Bu çalışmada "Bilemedim" dediğin kart yok.',
  },
  {
    id: 'removed',
    label: 'Çıkarılan',
    stat: 'neutral',
    bar: 'bg-line-strong',
    empty: 'Bu çalışmadan çıkardığın kart yok.',
  },
  {
    id: 'unanswered',
    label: 'Cevaplanmayan',
    stat: 'neutral',
    bar: 'bg-fg-muted/40',
    empty: 'Cevaplanmayan kart yok.',
  },
];
const groupOf = (card: StudyCard): Group => card.outcome ?? 'unanswered';

/**
 * Result of a completed or early-ended session, built only from the server's saved
 * snapshots and outcomes. Unanswered cards of an early-ended session are their own
 * group and are never counted as "Bilemedim". No scores or points.
 */
export function StudySummaryPage() {
  const { sessionId = '' } = useParams();
  const query = useStudySession(sessionId);
  useDocumentTitle(query.data ? `${query.data.listTitle} · Çalışma sonucu` : 'Çalışma sonucu');

  if (!query.isError && query.data?.status === 'active')
    return <Navigate replace to={studyPaths.session(query.data.id)} />;
  if (!query.isError && query.data) return <Summary session={query.data} />;
  return (
    <div data-mode="flashcards" className="grid max-w-4xl gap-6">
      <PageHeader
        mode="flashcards"
        back={{ to: '/study', label: 'Kelime Çalış sayfasına dön' }}
        eyebrow="Kelime kartları"
        title="Çalışma sonucu"
      />
      {query.isError ? (
        <ErrorPanel
          error={query.error}
          retry={() => {
            void query.refetch();
          }}
        />
      ) : (
        <LoadingNotice rows={3}>Sonuçların yükleniyor…</LoadingNotice>
      )}
    </div>
  );
}

function Summary({ session }: { session: StudySession }) {
  const id = useId();
  const active = useActiveSession(session.listId, session.reviewOnly);
  const { counts } = session;
  const visible = groups.filter((group) => group.id !== 'unanswered' || counts.unanswered > 0);
  const [selected, setSelected] = useState<Group>(
    () => visible.find((group) => counts[group.id] > 0)?.id ?? 'known',
  );
  const shown = session.cards.filter((card) => groupOf(card) === selected);
  const current = groups.find((group) => group.id === selected)!;
  const ended = session.status === 'ended_early';
  const otherActive = active.data && active.data.id !== session.id ? active.data : null;
  // An all-lists review session has no list to return to.
  const back = session.listId
    ? { to: studyPaths.list(session.listId), label: 'Listeye dön' }
    : { to: '/study/review', label: 'Zorlandıklarımı Çalış sayfasına dön' };

  const mode = session.reviewOnly ? 'review' : 'flashcards';
  return (
    <div data-mode={mode} className="grid max-w-4xl gap-8">
      <PageHeader
        mode={mode}
        back={back}
        eyebrow={session.reviewOnly ? 'Zorlandıklarımı Çalış' : 'Kelime kartları'}
        title={ended ? 'Çalışmayı erken bitirdin' : 'Çalışmayı tamamladın'}
        description={
          <p className="wrap-anywhere">
            <strong className="text-fg">{session.listTitle}</strong> listesiyle kelime kartları
          </p>
        }
      />

      <section
        aria-label="Çalışmanın özeti"
        className={cn(sheetClass, 'grid overflow-hidden shadow-raised')}
      >
        <div className="mode-art-stage grid gap-4 border-b border-(--mode-soft) p-5 sm:grid-cols-[auto_minmax(0,1fr)] sm:items-center sm:gap-6 sm:p-7">
          {/* Completed: a one-time settle and ring (reduced motion: static). Decorative. */}
          <span
            aria-hidden="true"
            className={cn(
              'hidden size-16 place-items-center rounded-full text-[1.9rem] text-white sm:grid',
              'shadow-[0_0_0_6px_rgb(255_255_255/0.85),0_16px_30px_-12px_rgb(13_19_33/0.45)]',
              ended ? 'bg-(--mode-deep)' : 'celebrate bg-success',
            )}
          >
            <CheckIcon strokeWidth={3} />
          </span>
          <div className="grid min-w-0 gap-3">
            <StatGrid
              label="Sonuç sayıları"
              items={visible.map((group) => ({
                label: group.label,
                value: counts[group.id],
                tone: group.stat,
              }))}
            />
            {/* The same counts as one proportion bar; the numbers above carry the meaning. */}
            <div
              aria-hidden="true"
              className="flex h-2.5 overflow-hidden rounded-full bg-surface-sunken shadow-[inset_0_0_0_1px_var(--sem-line)]"
            >
              {visible.map((group) =>
                counts[group.id] > 0 ? (
                  <span
                    key={group.id}
                    className={cn('h-full', group.bar)}
                    style={{ width: `${(counts[group.id] / Math.max(1, counts.total)) * 100}%` }}
                  />
                ) : null,
              )}
            </div>
          </div>
        </div>
        <div className="grid gap-5 p-5 sm:p-7">
          {ended && counts.unanswered > 0 ? (
            <p className="rounded-card border border-line bg-surface-sunken px-4 py-3 text-small text-fg">
              Çalışmayı erken bitirdiğin için {counts.unanswered} kart değerlendirilmedi. Bu kartlar
              "Bilemedim" sayılmaz ve öğrenme geçmişini etkilemez.
            </p>
          ) : null}
          <dl className="grid gap-x-6 gap-y-3 text-body sm:grid-cols-2 lg:grid-cols-4">
            <Fact term="Yön">{directionLabels[session.direction]}</Fact>
            <Fact term="Çalışma boyutu">
              {percentLabel(session.percentage)} · {counts.total} kart
            </Fact>
            <Fact term="Başlangıç">{formatDateTime(session.startedAt)}</Fact>
            <Fact term={ended ? 'Bitirildiği an' : 'Tamamlandığı an'}>
              {session.finishedAt ? formatDateTime(session.finishedAt) : '—'}
            </Fact>
          </dl>
        </div>
      </section>

      <div className="flex flex-wrap items-center gap-3">
        {otherActive ? (
          <ButtonLink
            to={studyPaths.session(otherActive.id)}
            variant="mode"
            size="lg"
            icon={<CardsIcon />}
          >
            Devam eden çalışmana dön
          </ButtonLink>
        ) : (
          <ButtonLink
            to={
              session.reviewOnly
                ? session.listId
                  ? `/lists/${session.listId}/review`
                  : '/study/review'
                : studyPaths.setup(session.listId)
            }
            variant="mode"
            size="lg"
            icon={<CardsIcon />}
          >
            Yeni çalışma başlat
          </ButtonLink>
        )}
        <ButtonLink to="/history" variant="ghost">
          Çalışma geçmişine git
        </ButtonLink>
      </div>

      <section aria-labelledby={`${id}-words`} className="grid gap-4">
        <div className="grid gap-1">
          <h2 id={`${id}-words`} className="text-h3 text-fg">
            Kelimeler
          </h2>
          <p className="text-body text-fg-muted">Bu çalışmadaki kelimeleri sonucuna göre incele.</p>
        </div>
        <div role="group" aria-label="Sonuca göre göster" className="flex flex-wrap gap-2">
          {visible.map((group) => (
            <button
              key={group.id}
              type="button"
              aria-pressed={selected === group.id}
              aria-controls={`${id}-panel`}
              onClick={() => setSelected(group.id)}
              className={cn(
                'inline-flex min-h-11 items-center gap-2 rounded-full border px-4 text-small font-semibold',
                'transition-[background-color,border-color,color] duration-(--duration-fast) ease-standard',
                selected === group.id
                  ? 'border-selected bg-selected text-on-selected'
                  : 'border-line-strong bg-surface-raised text-fg hover:border-accent hover:bg-accent-soft hover:text-on-accent-soft',
              )}
            >
              {group.label}
              <span aria-hidden="true" className="tabular-nums">
                ({counts[group.id]})
              </span>
              <span className="sr-only">, {counts[group.id]} kart</span>
            </button>
          ))}
        </div>
        <div id={`${id}-panel`} aria-live="polite">
          {shown.length ? (
            <ul
              aria-label={`${current.label} kartları`}
              className={cn(sheetClass, 'grid divide-y divide-line overflow-hidden')}
            >
              {shown.map((card) => (
                <li
                  key={card.id}
                  className="grid gap-2 px-5 py-4 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)] sm:items-center sm:gap-5"
                >
                  <h3 lang="en" className={cn(headwordClass, 'wrap-anywhere text-h3 text-fg')}>
                    {card.english}
                  </h3>
                  <ul
                    aria-label={`${card.english} Türkçe anlamları`}
                    className="flex min-w-0 flex-wrap gap-1.5"
                  >
                    {card.meanings.map((meaning, index) => (
                      <li
                        key={`${index}-${meaning}`}
                        className="wrap-anywhere rounded-control bg-surface-sunken px-2.5 py-1 text-small text-fg"
                      >
                        {meaning}
                      </li>
                    ))}
                  </ul>
                </li>
              ))}
            </ul>
          ) : (
            <p className="rounded-panel border border-dashed border-line-strong bg-surface-raised p-5 text-body text-fg">
              {current.empty}
            </p>
          )}
        </div>
      </section>
    </div>
  );
}

function Fact({ term, children }: { term: string; children: ReactNode }) {
  return (
    <div className="grid gap-0.5">
      <dt className="text-caption text-fg-muted">{term}</dt>
      <dd className="font-semibold text-fg">{children}</dd>
    </div>
  );
}
