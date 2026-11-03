import { useQuery } from '@tanstack/react-query';
import { useState } from 'react';
import { Link } from 'react-router';
import { Button } from '../../components/ui/Button';
import { ButtonLink } from '../../components/ui/ButtonLink';
import { sheetClass } from '../../components/ui/Card';
import { headwordClass } from '../../components/ui/Headword';
import { ModeIcon, ModeTile } from '../../components/ui/modeIcons';
import { PageHeader } from '../../components/ui/PageHeader';
import { StatGrid } from '../../components/ui/Stats';
import { cn } from '../../lib/cn';
import { fetchReview, type ReviewWord } from '../../lib/review';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { ErrorPanel, LoadingNotice } from './parts';

/** Two separate positive contributions clear a word's review priority. */
const STREAK_GOAL = 2;

export default function ReviewPage() {
  const [pages, setPages] = useState<(string | null)[]>([null]);
  const after = pages.at(-1)!;
  const query = useQuery({
    queryKey: ['review', after],
    queryFn: ({ signal }) => fetchReview(after, signal),
    staleTime: 0,
  });
  useDocumentTitle('Tekrar gerektiren kelimeler');
  return (
    <div className="grid gap-8">
      <PageHeader
        back={{ to: '/history', label: 'Çalışma Geçmişine dön' }}
        eyebrow="Öğrenme ilerlemen"
        title="Tekrar gerektiren kelimeler"
        description="Kelime kartlarında daha önce Bilemedim dediğin ve hâlâ tekrar önceliği taşıyan güncel kelimelerin."
        actions={
          <ButtonLink to="/study/review" icon={<ModeIcon mode="review" />}>
            Zorlandıklarımı Çalış
          </ButtonLink>
        }
      />
      <div className="grid items-start gap-8 xl:grid-cols-[minmax(0,1fr)_19rem]">
        <div className="grid min-w-0 gap-5">
          {query.isPending ? (
            <LoadingNotice rows={4}>Tekrar bilgilerin yükleniyor…</LoadingNotice>
          ) : query.isError ? (
            <ErrorPanel error={query.error} retry={() => void query.refetch()} />
          ) : (
            <>
              <StatGrid
                label="Tekrar durumu"
                items={[
                  { label: 'Tekrar önceliği olan', value: query.data.total, tone: 'highlight' },
                  { label: 'Değerlendirdiğin güncel kelime', value: query.data.evaluatedCount },
                ]}
              />
              {!query.data.words.length ? (
                <div className={cn(sheetClass, 'grid justify-items-start gap-4 p-5 sm:p-6')}>
                  <ModeTile mode="review" />
                  <p role="status" className="max-w-2xl text-body text-fg">
                    {!query.data.evaluatedCount
                      ? 'Henüz güncel kelimelerin için bir kelime kartı değerlendirmen yok. İlk çalışmana başlayabilirsin.'
                      : !query.data.total
                        ? 'Şu anda tekrar önceliği taşıyan kelimen yok. İstersen listelerinden çalışmaya devam et.'
                        : 'Bu sayfada kelime kalmadı. İlk sayfaya dönebilirsin.'}
                  </p>
                  <ButtonLink to="/study" variant="secondary" icon={<ModeIcon mode="flashcards" />}>
                    Kelime kartlarıyla çalış
                  </ButtonLink>
                </div>
              ) : (
                <ul
                  aria-label="Tekrar bekleyen kelimelerin"
                  className={cn(sheetClass, 'grid divide-y divide-line overflow-hidden')}
                >
                  {query.data.words.map((word) => (
                    <ReviewRow key={word.wordId} word={word} />
                  ))}
                </ul>
              )}
              {pages.length > 1 || query.data.next ? (
                <div className="flex flex-wrap gap-3">
                  {pages.length > 1 && (
                    <Button variant="secondary" onClick={() => setPages([null])}>
                      İlk sayfa
                    </Button>
                  )}
                  {query.data.next && (
                    <Button
                      variant="secondary"
                      onClick={() => setPages([...pages, query.data.next])}
                    >
                      Sonraki kelimeler
                    </Button>
                  )}
                </div>
              ) : null}
            </>
          )}
        </div>
        <aside
          aria-labelledby="review-rules-title"
          className="grid gap-3 rounded-panel border border-line bg-surface-raised/70 p-5 text-small text-fg xl:sticky xl:top-6"
        >
          <h2 id="review-rules-title" className="text-h4 text-fg">
            Tekrar önceliği nasıl kalkar?
          </h2>
          <p>
            Önceliğin kalkması için farklı iki çalışmada olumlu öğrenme katkısı gerekir: kelime
            kartlarında Bildim; tamamlanmış Yazılı Cevap veya Dinle ve Yaz çalışmasında hedefi doğru
            yazmak; tamamlanmış Karma Çalışmada Bildim demek ya da hedefi doğru yazmak. İki yön aynı
            ilerlemeyi paylaşır.
          </p>
          <p>
            Yazılı Cevap yanlışları, alternatif cevaplar, dinleme yanlışları ve Karma Çalışmadaki
            yanlışlar, Bilemedim, seçenekli cevaplar ve ses atlamaları tekrar önceliğini
            değiştirmez. Atla ve Çıkar da bu durumu değiştirmez.
          </p>
          <p className="text-fg-muted">
            Normal kelime kartı çalışması tekrar öncelikli kelimeleri öne alır; yalnızca bu
            kelimelerden oluşacağını garanti etmez. Yarım kalan çalışman varsa önce ona devam
            edebilirsin.
          </p>
        </aside>
      </div>
    </div>
  );
}

function ReviewRow({ word }: { word: ReviewWord }) {
  return (
    <li className="grid gap-3 px-5 py-4 wrap-anywhere sm:px-6">
      <div className="grid min-w-0 gap-1.5">
        <h3 lang="en" className={cn(headwordClass, 'text-h3 text-fg')}>
          {word.english}
        </h3>
        <p className="text-body text-fg">{word.meanings.join(' / ')}</p>
        <div className="flex flex-wrap items-center gap-x-2.5 gap-y-1 text-small text-fg-muted">
          <span aria-hidden="true" className="flex gap-1">
            {Array.from({ length: STREAK_GOAL }, (_, step) => (
              <span
                key={step}
                className={cn(
                  'h-1.5 w-5 rounded-full',
                  step < word.knownStreak ? 'bg-success' : 'bg-line-strong',
                )}
              />
            ))}
          </span>
          <p>Daha önce Bilemedim dedin · Art arda olumlu katkı: {word.knownStreak} / 2</p>
        </div>
        <Link to={`/lists/${word.listId}`} className="justify-self-start text-small">
          {word.listTitle} listesine dön
        </Link>
      </div>
      <ButtonLink
        to={`/lists/${word.listId}/study`}
        size="sm"
        variant="secondary"
        icon={<ModeIcon mode="flashcards" />}
        className="justify-self-start"
      >
        {word.activeSessionId
          ? 'Yarım kalan kelime kartı çalışmana devam et'
          : 'Bu listede kelime kartlarıyla çalış'}
      </ButtonLink>
    </li>
  );
}
