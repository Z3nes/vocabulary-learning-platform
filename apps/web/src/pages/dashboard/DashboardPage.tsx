import { useState } from 'react';
import { CalendarIcon } from '../../components/ui/icons';
import { localDayKey } from '../../lib/activitySummary';
import { useLists, type WordList } from '../../lib/lists';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { LearningActivities } from './LearningActivities';
import { ListsOverview } from './ListsOverview';
import { RecentActivity } from './RecentActivity';
import { TodayPanel } from './TodayPanel';

const dateFormatter = new Intl.DateTimeFormat('tr-TR', {
  weekday: 'long',
  day: 'numeric',
  month: 'long',
  year: 'numeric',
});

/**
 * Student dashboard: what to study next (review queue), recent results, the
 * latest lists and every study mode. The review and activity panels appear once
 * the student has a list, so a first visit only loads the lists.
 */
export function DashboardPage() {
  useDocumentTitle('Kontrol Paneli');
  const lists = useLists();
  const hasLists = lists.isSuccess && lists.data.length > 0;

  return (
    // The shared route entrance (AppShell) animates the page once; sections do not
    // add their own entrance, so nothing animates twice.
    <div className="grid gap-12 lg:gap-14">
      <Welcome lists={hasLists ? lists.data : null} />
      {hasLists ? (
        <div className="grid items-stretch gap-5 xl:grid-cols-[minmax(0,1.3fr)_minmax(0,1fr)]">
          <TodayPanel />
          <RecentActivity />
        </div>
      ) : null}
      <ListsOverview />
      <LearningActivities />
    </div>
  );
}

function Welcome({ lists }: { lists: WordList[] | null }) {
  const [today] = useState(() => new Date());
  const words = lists?.reduce((sum, list) => sum + list.wordCount, 0) ?? 0;
  return (
    <header className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-end">
      <div className="grid gap-4">
        <p className="inline-flex w-fit items-center gap-2 rounded-full border border-line bg-surface-raised/85 py-1 pr-3.5 pl-2 text-small font-semibold text-fg shadow-card backdrop-blur-sm">
          <span className="grid size-6 place-items-center rounded-full bg-accent-soft text-on-accent-soft">
            <CalendarIcon aria-hidden="true" className="text-[0.9rem]" />
          </span>
          Kontrol Paneli · <time dateTime={localDayKey(today)}>{dateFormatter.format(today)}</time>
        </p>
        <h1 className="w-fit bg-[linear-gradient(100deg,#0d1321_10%,#1262b0_60%,#4338ca_100%)] bg-clip-text pb-1 text-display text-fg [-webkit-text-fill-color:transparent] forced-colors:[-webkit-text-fill-color:CanvasText]">
          Hoş geldin
        </h1>
        <p className="max-w-2xl text-body-lg text-fg-muted">
          {lists
            ? 'Kaldığın yerden devam et: tekrar sırana bak, listelerinden birini aç ya da bir çalışma yöntemi seç.'
            : 'Kendi kelime listeni oluştur, kelimelerini ekle ve kartlar, yazma, dinleme ya da alıştırmalarla çalış.'}
        </p>
      </div>
      {lists ? (
        <dl
          aria-label="Kelime hazinen"
          className="grid grid-cols-2 divide-x divide-line overflow-hidden rounded-card border border-line bg-surface-raised/90 shadow-card backdrop-blur-sm"
        >
          {[
            { label: 'Liste', value: lists.length },
            { label: 'Kelime', value: words },
          ].map((item) => (
            <div key={item.label} className="flex min-w-32 flex-col-reverse gap-0.5 px-6 py-4">
              <dt className="text-caption font-semibold tracking-[0.08em] text-fg-muted uppercase">
                {item.label}
              </dt>
              <dd className="text-h1 text-fg tabular-nums">{item.value}</dd>
            </div>
          ))}
        </dl>
      ) : null}
    </header>
  );
}
