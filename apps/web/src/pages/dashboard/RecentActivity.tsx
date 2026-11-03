import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Button } from '../../components/ui/Button';
import { ClockIcon } from '../../components/ui/icons';
import { ModeTile } from '../../components/ui/modeIcons';
import { LoadingState } from '../../components/ui/states';
import { fetchActivity } from '../../lib/activity';
import {
  activityListTitle,
  activityMode,
  activityName,
  activityOutcome,
  activityResultPath,
  shortStamp,
} from '../../lib/activitySummary';
import { SectionLink } from './SectionHeader';

/** The latest saved activities (shared cache with the history page), drawn as a short timeline. */
export function RecentActivity() {
  const activity = useQuery({
    queryKey: ['activity'],
    queryFn: ({ signal }) => fetchActivity(signal),
    // Like the history page: a finished session must appear on the next visit.
    staleTime: 0,
  });
  return (
    <section
      aria-labelledby="recent-title"
      className="grid content-start gap-5 rounded-panel border border-line bg-surface-raised p-6 shadow-card sm:p-7"
    >
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1">
        <h2 id="recent-title" className="flex items-center gap-2.5 text-h3 text-fg">
          <span
            aria-hidden="true"
            className="grid size-8 place-items-center rounded-full bg-surface-sunken text-[1.05rem] text-fg"
          >
            <ClockIcon />
          </span>
          Son çalışmaların
        </h2>
        <SectionLink to="/history">Tüm geçmiş</SectionLink>
      </div>
      {activity.isPending ? (
        <LoadingState rows={3}>Son çalışmaların yükleniyor…</LoadingState>
      ) : activity.isError ? (
        <div className="grid justify-items-start gap-3">
          <p role="alert" className="text-body text-fg">
            Son çalışmaların şu anda yüklenemedi.
          </p>
          <Button variant="secondary" size="sm" onClick={() => void activity.refetch()}>
            Tekrar dene
          </Button>
        </div>
      ) : !activity.data.length ? (
        <p className="rounded-card border border-dashed border-line-strong/60 bg-surface px-4 py-5 text-body text-fg-muted">
          Henüz kaydedilmiş bir çalışman yok. Tamamladığın çalışmalar ve alıştırmalar burada
          görünür.
        </p>
      ) : (
        <ol className="grid">
          {activity.data.slice(0, 4).map((item, index, shown) => {
            const path = activityResultPath(item);
            const name = activityName(item);
            return (
              <li key={item.key} className="relative flex gap-3.5 pb-4 last:pb-0 wrap-anywhere">
                {/* Timeline connector between entries. Decorative only. */}
                {index < shown.length - 1 ? (
                  <span
                    aria-hidden="true"
                    className="absolute top-10 bottom-0 left-[1.125rem] w-px bg-line"
                  />
                ) : null}
                <ModeTile mode={activityMode(item)} size="sm" className="relative" />
                <div className="grid min-w-0 flex-1 gap-0.5 pt-0.5">
                  <p className="text-body text-fg">
                    {path ? (
                      <Link to={path} className="font-semibold">
                        {name} · {activityListTitle(item)}
                      </Link>
                    ) : (
                      <>
                        <span className="font-semibold">{name}</span> · {activityListTitle(item)}
                      </>
                    )}
                  </p>
                  <p className="text-small text-fg-muted">
                    <time dateTime={item.at}>{shortStamp(new Date(item.at))}</time> ·{' '}
                    {activityOutcome(item)}
                  </p>
                </div>
              </li>
            );
          })}
        </ol>
      )}
    </section>
  );
}
