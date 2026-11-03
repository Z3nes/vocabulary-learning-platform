import { useQuery } from '@tanstack/react-query';
import { Link } from 'react-router';
import { Button, Spinner } from '../../components/ui/Button';
import { ButtonLink } from '../../components/ui/ButtonLink';
import { headwordClass } from '../../components/ui/Headword';
import { ArrowRightIcon } from '../../components/ui/icons';
import { ModeArt } from '../../components/ui/ModeArt';
import { ModeIcon } from '../../components/ui/modeIcons';
import { Eyebrow } from '../../components/ui/PageHeader';
import { cn } from '../../lib/cn';
import { fetchReview } from '../../lib/review';

/**
 * The dashboard's "what next" panel, built from the student's own review queue
 * (the first page of /review, shared with the review page's cache). It states the
 * number of words that still carry review priority and offers the matching study
 * modes; it never invents a goal, streak or score.
 */
export function TodayPanel() {
  const review = useQuery({
    queryKey: ['review', null],
    queryFn: ({ signal }) => fetchReview(null, signal),
    // Like the review page: study can change the queue in this or another tab.
    staleTime: 0,
  });
  return (
    <section
      aria-labelledby="today-title"
      data-surface="navy"
      className="hero-surface relative isolate grid content-start gap-5 overflow-hidden rounded-panel p-6 shadow-(--shadow-float) sm:p-8"
    >
      <div className="flex items-start justify-between gap-4">
        <div className="grid gap-2">
          <Eyebrow>Bugün</Eyebrow>
          <h2 id="today-title" className="text-h2 text-fg">
            Tekrar sıran
          </h2>
        </div>
        {/* A small highlighter drawing beside the title, never under text. Decorative only. */}
        <div aria-hidden="true" className="-my-4 -mr-3 hidden w-40 shrink-0 rotate-3 sm:block">
          <ModeArt mode="review" />
        </div>
      </div>

      {review.isPending ? (
        <p role="status" className="flex items-center gap-2.5 text-body text-fg">
          <Spinner />
          Tekrar sıran yükleniyor…
        </p>
      ) : review.isError ? (
        <div className="grid justify-items-start gap-3">
          <p role="alert" className="text-body text-fg">
            Tekrar sıran şu anda yüklenemedi.
          </p>
          <Button variant="secondary" size="sm" onClick={() => void review.refetch()}>
            Tekrar dene
          </Button>
        </div>
      ) : review.data.total > 0 ? (
        <>
          <p className="flex flex-wrap items-end gap-x-4 gap-y-1">
            <span
              className={cn(
                headwordClass,
                'text-[clamp(3.5rem,2.6rem+3vw,5rem)] leading-[0.9] font-semibold text-fg tabular-nums',
              )}
            >
              {review.data.total}
            </span>
            <span className="pb-1.5 text-body-lg font-semibold text-fg">
              kelimen tekrar bekliyor
            </span>
          </p>
          <p className="max-w-xl text-body text-fg-muted">
            Kelime kartlarında Bilemedim dediğin ve henüz pekiştirmediğin kelimeler. Kısa bir tekrar
            çalışmasıyla başla.
          </p>
          {review.data.words.length ? (
            <ul
              aria-label="Tekrar bekleyen kelimelerinden bazıları"
              className="flex flex-wrap gap-2"
            >
              {review.data.words.slice(0, 4).map((word) => (
                <li
                  key={word.wordId}
                  lang="en"
                  className={cn(
                    headwordClass,
                    'max-w-full truncate rounded-full border border-white/20 bg-white/10 px-3.5 py-1 text-body text-fg shadow-[inset_0_1px_0_rgb(255_255_255/0.12)] backdrop-blur-sm',
                  )}
                >
                  {word.english}
                </li>
              ))}
            </ul>
          ) : null}
          <div className="flex flex-wrap items-center gap-x-5 gap-y-3 pt-2">
            <ButtonLink to="/study/review" size="lg" icon={<ModeIcon mode="review" />}>
              Zorlandıklarımı Çalış
            </ButtonLink>
            <Link
              to="/history/review"
              className="group inline-flex min-h-11 items-center gap-1.5 rounded-control px-1 font-semibold"
            >
              Tekrar gerektiren kelimeleri gör
              <ArrowRightIcon
                aria-hidden="true"
                className="transition-transform duration-(--duration-base) ease-standard group-hover:translate-x-0.5 motion-reduce:group-hover:translate-x-0"
              />
            </Link>
          </div>
        </>
      ) : (
        <>
          <p className="text-h3 text-fg">
            {review.data.evaluatedCount
              ? 'Şu anda tekrar bekleyen kelimen yok.'
              : 'Tekrar sıran henüz boş.'}
          </p>
          <p className="max-w-xl text-body text-fg-muted">
            {review.data.evaluatedCount
              ? 'Yeni bir çalışmayla devam edebilirsin. Kelime kartlarında Bilemedim dediğin kelimeler burada toplanır.'
              : 'Kelime kartlarıyla ilk çalışmanı yaptığında Bilemedim dediğin kelimeler burada toplanır.'}
          </p>
          <div className="flex flex-wrap items-center gap-3 pt-2">
            <ButtonLink to="/study" size="lg" icon={<ModeIcon mode="flashcards" />}>
              Kelime kartlarıyla çalış
            </ButtonLink>
            <ButtonLink
              to="/study/mixed"
              variant="secondary"
              size="lg"
              icon={<ModeIcon mode="mixed" />}
            >
              Karma Çalışma
            </ButtonLink>
          </div>
        </>
      )}
    </section>
  );
}
