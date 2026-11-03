import type { ReactNode } from 'react';
import { useSearchParams } from 'react-router';
import { ButtonLink } from '../../components/ui/ButtonLink';
import { FamilyBadge } from '../../components/ui/FamilyBadge';
import { HubHero } from '../../components/ui/HubHero';
import { ArrowRightIcon, ClockIcon, InfoIcon, PuzzleIcon } from '../../components/ui/icons';
import { ModeLauncher } from '../../components/ui/ModeLauncher';
import { gameNames, type GameType } from '../../lib/games';
import { puzzleNames, type PuzzleType } from '../../lib/puzzles';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { gameGuides } from './gameGuides';

const games = Object.keys(gameNames) as GameType[];
const puzzles = Object.keys(puzzleNames) as PuzzleType[];

/**
 * "Alıştırmalar": the practice games and puzzles. A `?list=` parameter is passed
 * on, so a game opened from a list starts with that list selected.
 */
export function GamesHubPage() {
  const [params] = useSearchParams();
  const listId = params.get('list');
  useDocumentTitle('Alıştırmalar');
  const query = listId ? `?list=${encodeURIComponent(listId)}` : '';
  const launcher = (type: GameType | PuzzleType, title: string) => (
    <ModeLauncher
      key={type}
      mode={type}
      title={title}
      description={gameGuides[type].description}
      meta={
        <p className="flex items-start gap-2 rounded-control bg-surface px-3 py-2 text-caption text-fg-muted">
          <InfoIcon aria-hidden="true" className="mt-px shrink-0 text-[1.05em] text-(--mode-ink)" />
          {gameGuides[type].requirement}
        </p>
      }
      to={`/games/${type}${query}`}
    />
  );
  return (
    <div className="grid gap-12">
      <HubHero
        eyebrow="Oyunlar ve bulmacalar"
        title="Alıştırmalar"
        description="Kendi listelerindeki kelimelerle pratik yap. Oyunlar kelime kartlarındaki tekrar önceliğini değiştirmez."
        tone="practice"
        modes={['quiz', 'crossword', 'memory']}
      />
      <section aria-labelledby="games-title" className="grid gap-5">
        <HubSectionHeader
          id="games-title"
          title="Oyunlar"
          icon={<ClockIcon />}
          description="Kısa turlar: listeni seçip başlarsın, tur bitince sonucun geçmişine eklenir. Yarım kalan tur kaydedilmez."
        />
        <ul className="grid gap-4 md:grid-cols-2">
          {games.map((type) => launcher(type, gameNames[type]))}
        </ul>
      </section>
      <section aria-labelledby="puzzles-title" className="grid gap-5">
        <HubSectionHeader
          id="puzzles-title"
          title="Bulmacalar"
          icon={<PuzzleIcon />}
          description="Tahtan kaydedilir; yarım kalan bulmacana sonra veya başka bir cihazda devam edebilirsin."
        />
        <ul className="grid gap-4 md:grid-cols-2">
          {puzzles.map((type) => launcher(type, puzzleNames[type]))}
        </ul>
      </section>
      <div className="panel-study flex flex-wrap items-center gap-x-5 gap-y-4 p-5 sm:p-6">
        <FamilyBadge family="study" />
        <p className="min-w-0 flex-1 basis-64 text-body text-fg">
          Kelime kartları, Yazılı Cevap ve Dinle ve Yaz için Kelime Çalış sayfasına geç.
        </p>
        <ButtonLink to="/study" variant="secondary" className="pr-4">
          Kelime Çalış
          <ArrowRightIcon aria-hidden="true" className="ml-1.5 inline-block align-[-0.125em]" />
        </ButtonLink>
      </div>
    </div>
  );
}

/** A hub section's title row: a small emblem, the h2 and its explanation. */
function HubSectionHeader({
  id,
  title,
  icon,
  description,
}: {
  id: string;
  title: string;
  icon: ReactNode;
  description: string;
}) {
  return (
    <div className="flex items-start gap-4">
      <span
        aria-hidden="true"
        className="mt-0.5 grid size-11 shrink-0 place-items-center rounded-control border border-line bg-surface-raised text-[1.3rem] text-fg shadow-card"
      >
        {icon}
      </span>
      <div className="grid gap-1">
        <h2 id={id} className="text-h2 text-fg">
          {title}
        </h2>
        <p className="max-w-3xl text-body text-fg-muted">{description}</p>
      </div>
    </div>
  );
}
