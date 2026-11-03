import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { ButtonLink } from '../../components/ui/ButtonLink';
import { sheetClass } from '../../components/ui/Card';
import { headwordClass } from '../../components/ui/Headword';
import { ArrowRightIcon, HistoryIcon, InfoIcon } from '../../components/ui/icons';
import { ModeIcon, ModeTile } from '../../components/ui/modeIcons';
import { PageHeader } from '../../components/ui/PageHeader';
import { fetchActivity, type Activity, type HistoryGame } from '../../lib/activity';
import {
  activityListTitle,
  activityMode,
  activityName,
  dayLabel,
  localDayKey,
  timeOfDay,
} from '../../lib/activitySummary';
import { cn } from '../../lib/cn';
import { mixedActivityNames } from '../../lib/practice';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { ErrorPanel, LoadingNotice } from './parts';

const outcomeLabels = {
  correct: 'Doğru',
  incorrect: 'Yanlış',
  revealed: 'Cevabı gösterildi',
  matched: 'Eşleştirildi',
  audio_unavailable: 'Ses kullanılamadığı için atlandı',
  self_known: 'Öz bildirim: Bildim',
  self_missed: 'Öz bildirim: Bilemedim',
} as const;

/**
 * Saved study history, newest first, grouped by local day. Everything shown is the
 * server's record (snapshots and outcomes); nothing is recalculated here and
 * nothing is turned into points.
 */
export default function HistoryPage() {
  useDocumentTitle('Çalışma Geçmişi');
  const query = useQuery({
    queryKey: ['activity'],
    queryFn: ({ signal }) => fetchActivity(signal),
    staleTime: 0,
  });
  return (
    <div className="grid max-w-4xl gap-8">
      <PageHeader
        title="Çalışma Geçmişi"
        description="Son 50 tamamlanmış veya erken bitirilmiş çalışman. Yarım kalan oyunlar burada kaydedilmez."
        actions={
          <ButtonLink to="/history/review" variant="secondary" icon={<ModeIcon mode="review" />}>
            Tekrar gerektiren kelimelerin
          </ButtonLink>
        }
      />
      {query.isPending ? (
        <LoadingNotice rows={4}>Geçmişin yükleniyor…</LoadingNotice>
      ) : query.isError ? (
        <ErrorPanel error={query.error} retry={() => void query.refetch()} />
      ) : !query.data.length ? (
        <div className={cn(sheetClass, 'grid justify-items-start gap-4 p-5 sm:p-6')}>
          <span
            aria-hidden="true"
            className="grid size-11 place-items-center rounded-control bg-accent-soft text-[1.35rem] text-on-accent-soft"
          >
            <HistoryIcon />
          </span>
          <p role="status" className="max-w-2xl text-body text-fg">
            Henüz kaydedilmiş bir çalışman yok. Bir kelime kartı çalışması veya oyun tamamlayarak
            başlayabilirsin.
          </p>
          <nav aria-label="Geçmiş bağlantıları" className="flex flex-wrap gap-3">
            <ButtonLink to="/study" icon={<ModeIcon mode="flashcards" />}>
              Kelime kartlarıyla çalış
            </ButtonLink>
            <ButtonLink to="/games" variant="secondary">
              Alıştırmalar
            </ButtonLink>
            <ButtonLink to="/lists" variant="ghost">
              Listelerin
            </ButtonLink>
          </nav>
        </div>
      ) : (
        <Timeline activities={query.data} />
      )}
    </div>
  );
}

function Timeline({ activities }: { activities: Activity[] }) {
  const now = new Date();
  // The API returns newest first; consecutive items of one local day share a group.
  const days: { key: string; label: string; items: Activity[] }[] = [];
  for (const activity of activities) {
    const at = new Date(activity.at);
    const key = localDayKey(at);
    const last = days.at(-1);
    if (last?.key === key) last.items.push(activity);
    else days.push({ key, label: dayLabel(at, now), items: [activity] });
  }
  return (
    <div className="grid gap-8">
      {days.map((day) => (
        <section key={day.key} aria-labelledby={`history-day-${day.key}`} className="grid gap-3">
          <h2
            id={`history-day-${day.key}`}
            className="flex items-center gap-3 text-h4 text-fg after:h-px after:flex-1 after:bg-line"
          >
            {day.label}
          </h2>
          <ol className={cn(sheetClass, 'grid divide-y divide-line overflow-hidden')}>
            {day.items.map((activity) => (
              <Entry key={activity.key} activity={activity} />
            ))}
          </ol>
        </section>
      ))}
    </div>
  );
}

function Entry({ activity }: { activity: Activity }) {
  return (
    <li className="grid gap-x-4 gap-y-3 px-5 py-4 wrap-anywhere sm:grid-cols-[auto_minmax(0,1fr)] sm:px-6">
      <ModeTile mode={activityMode(activity)} size="sm" className="hidden sm:grid" />
      <div className="grid min-w-0 gap-2.5">
        <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5">
          <h3 className="text-h4 text-fg">
            {activityName(activity)} · {activityListTitle(activity)}
          </h3>
          <time dateTime={activity.at} className="text-small text-fg-muted tabular-nums">
            {timeOfDay(new Date(activity.at))}
          </time>
        </div>
        {activity.kind === 'flashcard' ? (
          <>
            <p className="text-small text-fg-muted">
              {`${activity.session.direction === 'en-tr' ? 'İngilizce → Türkçe' : 'Türkçe → İngilizce'} · %${activity.session.percentage} · ${activity.session.status === 'completed' ? 'Tamamlandı' : 'Erken bitirildi'}`}
            </p>
            <Counts
              items={[
                { label: 'Bildim', value: activity.session.counts.known, tone: 'bg-success' },
                {
                  label: 'Bilemedim',
                  value: activity.session.counts.missed,
                  tone: 'bg-on-highlight',
                },
                { label: 'Çıkarılan', value: activity.session.counts.removed },
                { label: 'Cevaplanmayan', value: activity.session.counts.unanswered },
              ]}
            />
            <ResultLink to={`/study/sessions/${activity.session.id}/summary`}>
              Kelime kartı sonuçlarını aç
            </ResultLink>
          </>
        ) : (
          <GameDetails game={activity.game} />
        )}
      </div>
    </li>
  );
}

function GameDetails({ game }: { game: HistoryGame }) {
  const count = (test: (item: HistoryGame['items'][number]) => boolean) =>
    game.items.filter(test).length;
  const writing = game.gameType === 'written-recall' || game.gameType === 'listening';
  const puzzle = game.gameType === 'word-search' || game.gameType === 'crossword';
  const first = game.items[0];
  return (
    <>
      <p className="text-small text-fg-muted">
        Tamamlandı · {game.items.length} kelimeyle çalıştın.
      </p>
      {game.gameType === 'mixed' ? (
        <>
          <Counts
            items={[
              { label: 'Doğru', value: count((i) => i.outcome === 'correct'), tone: 'bg-success' },
              {
                label: 'Yanlış',
                value: count((i) => i.outcome === 'incorrect'),
                tone: 'bg-on-highlight',
              },
              { label: 'Ses atlama', value: count((i) => i.outcome === 'audio_unavailable') },
              {
                label: 'Öz bildirim — Bildim',
                value: count((i) => i.outcome === 'self_known'),
              },
              {
                label: 'Öz bildirim — Bilemedim',
                value: count((i) => i.outcome === 'self_missed'),
              },
              {
                label: 'Uygulanan öğrenme katkısı',
                value: count((i) => Boolean(i.masteryApplied)),
              },
            ]}
          />
          <ul
            aria-label="Yönteme göre soru sayıları"
            className="flex flex-wrap gap-x-4 gap-y-1 text-small text-fg"
          >
            {Object.entries(mixedActivityNames).map(([type, name]) => (
              <li key={type}>
                {name}: {count((i) => i.activityType === type)} soru
              </li>
            ))}
          </ul>
        </>
      ) : null}
      {writing ? (
        <Counts
          items={[
            { label: 'Doğru', value: count((i) => i.outcome === 'correct'), tone: 'bg-success' },
            {
              label: 'Yanlış',
              value: count((i) => i.outcome === 'incorrect'),
              tone: 'bg-on-highlight',
            },
            { label: 'Hedefi doğru yazma', value: count((i) => Boolean(i.masteryEligible)) },
            { label: 'Uygulanan öğrenme katkısı', value: count((i) => Boolean(i.masteryApplied)) },
            ...(game.gameType === 'listening'
              ? [
                  {
                    label: 'Ses kullanılamadığı için atlanan',
                    value: count((i) => i.outcome === 'audio_unavailable'),
                  },
                ]
              : []),
          ]}
        />
      ) : null}
      <p className="flex items-start gap-2 text-small text-fg-muted">
        <InfoIcon className="mt-0.5 shrink-0 text-[1.05rem]" />
        {game.gameType === 'mixed'
          ? 'Kart öz bildirimi ve tam hedefi yazma pozitif katkı sağlayabilir. Seçenekli tanıma katkı vermez; yanlışlar ve atlamalar tekrar önceliğini değiştirmez.'
          : writing
            ? 'Yalnızca hedefi doğru yazdığın cevaplar uygun öğrenme katkısı sağlar; yanlışlar tekrar önceliğini değiştirmez.'
            : 'Oyun sonucu tekrar önceliğini değiştirmez.'}
      </p>
      {puzzle && first?.puzzleSessionId ? (
        <p className="text-small text-fg">
          {first.selectedCount} kayıt seçildi; {first.placedCount} kelime tahtalara yerleşti.
          Yerleşmeyen seçili ifadeleri sonuç ayrıntısında görebilirsin.
        </p>
      ) : null}
      <details className="group rounded-card border border-line bg-surface-sunken/60 open:bg-surface-raised">
        <summary className="flex min-h-11 cursor-pointer items-center gap-2 rounded-card px-3.5 py-2 text-small font-semibold text-fg">
          <ArrowRightIcon
            aria-hidden="true"
            className="shrink-0 text-accent transition-transform duration-(--duration-fast) ease-standard group-open:rotate-90"
          />
          Kaydedilmiş kelime sonuçları
        </summary>
        <ul className="grid divide-y divide-line border-t border-line px-3.5 text-small text-fg">
          {game.items.map((item, i) => (
            <li key={i} className="py-2">
              <span lang="en" className={cn(headwordClass, 'text-body')}>
                {item.english}
              </span>{' '}
              — {item.meanings.join(' / ')} · {outcomeLabels[item.outcome]} · {item.attempts} deneme
              {item.activityType
                ? ` · ${mixedActivityNames[item.activityType]} · ${item.originListTitle ?? ''}`
                : ''}
            </li>
          ))}
        </ul>
      </details>
      {game.gameType === 'mixed' && first?.practiceSessionId ? (
        <ResultLink to={`/study/practice/${first.practiceSessionId}`}>
          Karma çalışma sonuçlarını aç
        </ResultLink>
      ) : null}
      {puzzle && first?.puzzleSessionId ? (
        <ResultLink to={`/games/puzzles/${first.puzzleSessionId}`}>Tahta sonuçlarını aç</ResultLink>
      ) : null}
    </>
  );
}

/** Personal outcome counts as a compact row; the dot is decorative, the label says it. */
function Counts({ items }: { items: { label: string; value: number; tone?: string }[] }) {
  return (
    <ul className="flex flex-wrap gap-x-4 gap-y-1.5 text-small text-fg tabular-nums">
      {items.map((item) => (
        <li key={item.label} className="inline-flex items-center gap-1.5">
          <span
            aria-hidden="true"
            className={cn('size-2 shrink-0 rounded-full', item.tone ?? 'bg-line-strong')}
          />
          {item.label}: {item.value}
        </li>
      ))}
    </ul>
  );
}

function ResultLink({ to, children }: { to: string; children: string }) {
  return (
    <Link
      to={to}
      className="group inline-flex min-h-11 items-center gap-1.5 justify-self-start text-small font-semibold"
    >
      {children}
      <ArrowRightIcon
        aria-hidden="true"
        className="transition-transform duration-(--duration-fast) ease-standard group-hover:translate-x-0.5 motion-reduce:group-hover:translate-x-0"
      />
    </Link>
  );
}
