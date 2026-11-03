import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen, within } from '@testing-library/react';
import { MemoryRouter } from 'react-router';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { LearningActivities } from './LearningActivities';
import { GamesHubPage } from '../games/GamesHubPage';
import { StudyHubPage } from '../study/StudyHubPage';
import { gameNames } from '../../lib/games';
import { puzzleNames } from '../../lib/puzzles';

afterEach(() => vi.unstubAllGlobals());
describe('permanent study navigation', () => {
  it('groups study modes under Kelime Çalış and all six games under Alıştırmalar', () => {
    render(
      <MemoryRouter>
        <LearningActivities />
      </MemoryRouter>,
    );
    const study = within(screen.getByRole('region', { name: 'Kelime Çalış' }));
    const games = within(screen.getByRole('region', { name: 'Alıştırmalar' }));
    expect(study.getByRole('link', { name: 'Kelime kartları' }).getAttribute('href')).toBe(
      '/study',
    );
    expect(study.queryByRole('link', { name: 'Klasik test' })).toBeNull();
    expect(study.getByRole('link', { name: 'Yazılı Cevap' }).getAttribute('href')).toBe(
      '/study#written-lists-title',
    );
    expect(study.getByRole('link', { name: 'Zorlandıklarımı Çalış' }).getAttribute('href')).toBe(
      '/study/review',
    );
    for (const [type, name] of Object.entries({ ...gameNames, ...puzzleNames }))
      expect(games.getByRole('link', { name }).getAttribute('href')).toBe(`/games/${type}`);
    // Every mode is available, so no "Yakında" / "Kullanıma açık" badges are shown.
    expect(screen.queryAllByText(/Yakında|Kullanıma açık/)).toHaveLength(0);
    expect(screen.getAllByRole('link', { name: 'Klasik test' })).toHaveLength(1);
  });
  it('keeps all four existing game routes and selected-list links', () => {
    render(
      <MemoryRouter initialEntries={['/games?list=chosen']}>
        <GamesHubPage />
      </MemoryRouter>,
    );
    expect(screen.getByRole('heading', { name: 'Alıştırmalar' })).toBeDefined();
    for (const [type, name] of Object.entries(gameNames))
      expect(screen.getByRole('link', { name }).getAttribute('href')).toBe(
        `/games/${type}?list=chosen`,
      );
  });
  it('explains that the study landing page is for cards and links to all exercises', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn().mockResolvedValue(
        new Response(JSON.stringify({ lists: [] }), {
          headers: { 'content-type': 'application/json' },
        }),
      ),
    );
    const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
    render(
      <QueryClientProvider client={client}>
        <MemoryRouter>
          <StudyHubPage />
        </MemoryRouter>
      </QueryClientProvider>,
    );
    await screen.findByRole('heading', { name: 'Henüz bir listen yok' });
    expect(screen.getByRole('link', { name: 'Alıştırmalar' }).getAttribute('href')).toBe('/games');
    expect(screen.queryByRole('link', { name: 'Klasik test' })).toBeNull();
    client.clear();
  });
  it('retains quiz as the stored internal type with one permanent Turkish name', () => {
    expect(gameNames.quiz).toBe('Klasik test');
    expect(Object.keys(gameNames)).toEqual(['quiz', 'matching', 'assembly', 'memory']);
  });
});
