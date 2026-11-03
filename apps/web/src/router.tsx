import type { RouteObject } from 'react-router';
import { createBrowserRouter } from 'react-router';
import { appConfig } from './config';
import { RouteError } from './pages/RouteError';

// Shown while a route's code arrives (first load only); the spinner is decorative.
const loading = (
  <main className="grid min-h-dvh place-items-center bg-surface p-6">
    <p role="status" className="flex items-center gap-3 text-body font-medium text-fg">
      <span
        aria-hidden="true"
        className="size-5 animate-spin rounded-full border-2 border-accent border-r-transparent motion-reduce:animate-none"
      />
      Sayfa yükleniyor…
    </p>
  </main>
);
// Each DEV-only import remains behind a build-time constant.
const loadDesignSystemPage = import.meta.env.DEV
  ? () => import('./pages/dev/DesignSystemPage')
  : undefined;
const loadDevStatusPage = import.meta.env.DEV
  ? () => import('./pages/dev/DevStatusPage')
  : undefined;
export interface RouteOptions {
  includeDevRoutes: boolean;
}

export function buildRoutes({ includeDevRoutes }: RouteOptions): RouteObject[] {
  const children: RouteObject[] = [
    {
      lazy: async () => ({ Component: (await import('./components/layout/AppShell')).AppShell }),
      children: [
        {
          index: true,
          lazy: async () => ({
            Component: (await import('./pages/dashboard/DashboardPage')).DashboardPage,
          }),
        },
        {
          path: 'lists',
          lazy: async () => ({ Component: (await import('./pages/lists/ListPages')).ListsPage }),
        },
        {
          path: 'lists/new',
          lazy: async () => ({
            Component: (await import('./pages/lists/ListPages')).CreateListPage,
          }),
        },
        {
          path: 'lists/:id',
          lazy: async () => ({
            Component: (await import('./pages/lists/ListPages')).ListDetailPage,
          }),
        },
        {
          path: 'lists/:id/study',
          lazy: async () => ({
            Component: (await import('./pages/study/StudySetupPage')).StudySetupPage,
          }),
        },
        {
          path: 'study',
          lazy: async () => ({
            Component: (await import('./pages/study/StudyHubPage')).StudyHubPage,
          }),
        },
        {
          path: 'study/mixed',
          lazy: async () => ({
            Component: (await import('./pages/study/MixedSetupPage')).MixedSetupPage,
          }),
        },
        {
          path: 'lists/:id/written',
          lazy: async () => ({
            Component: (await import('./pages/study/WrittenRecallPage')).WrittenSetupPage,
          }),
        },
        {
          path: 'lists/:id/listening',
          lazy: async () => {
            const { WrittenSetupPage } = await import('./pages/study/WrittenRecallPage');
            return { Component: () => <WrittenSetupPage practiceType="listening" /> };
          },
        },
        {
          path: 'lists/:id/review',
          lazy: async () => ({
            Component: (await import('./pages/study/TargetedReviewPage')).TargetedReviewPage,
          }),
        },
        {
          path: 'study/review',
          lazy: async () => ({
            Component: (await import('./pages/study/TargetedReviewPage')).TargetedReviewPage,
          }),
        },
        {
          path: 'study/practice/:sessionId',
          lazy: async () => ({
            Component: (await import('./pages/study/WrittenRecallPage')).WrittenSessionPage,
          }),
        },
        {
          path: 'study/sessions/:sessionId',
          lazy: async () => ({
            Component: (await import('./pages/study/StudySessionPage')).StudySessionPage,
          }),
        },
        {
          path: 'study/sessions/:sessionId/summary',
          lazy: async () => ({
            Component: (await import('./pages/study/StudySummaryPage')).StudySummaryPage,
          }),
        },
        {
          path: 'games',
          lazy: async () => ({
            Component: (await import('./pages/games/GamesHubPage')).GamesHubPage,
          }),
        },
        {
          path: 'games/quiz',
          lazy: async () => ({ Component: (await import('./pages/games/QuizPage')).default }),
        },
        {
          path: 'games/matching',
          lazy: async () => ({ Component: (await import('./pages/games/MatchingPage')).default }),
        },
        {
          path: 'games/assembly',
          lazy: async () => ({ Component: (await import('./pages/games/AssemblyPage')).default }),
        },
        {
          path: 'games/memory',
          lazy: async () => ({ Component: (await import('./pages/games/MemoryPage')).default }),
        },
        {
          path: 'games/word-search',
          lazy: async () => {
            const { PuzzleSetupPage } = await import('./pages/games/PuzzlePage');
            return { Component: () => <PuzzleSetupPage type="word-search" /> };
          },
        },
        {
          path: 'games/crossword',
          lazy: async () => {
            const { PuzzleSetupPage } = await import('./pages/games/PuzzlePage');
            return { Component: () => <PuzzleSetupPage type="crossword" /> };
          },
        },
        {
          path: 'games/puzzles/:sessionId',
          lazy: async () => ({
            Component: (await import('./pages/games/PuzzlePage')).PuzzleSessionPage,
          }),
        },
        {
          path: 'history',
          lazy: async () => ({ Component: (await import('./pages/study/HistoryPage')).default }),
        },
        {
          path: 'history/review',
          lazy: async () => ({ Component: (await import('./pages/study/ReviewPage')).default }),
        },
        {
          path: '*',
          lazy: async () => ({ Component: (await import('./pages/NotFound')).NotFound }),
        },
      ],
    },
  ];
  if (includeDevRoutes && loadDesignSystemPage) {
    const load = loadDesignSystemPage;
    children.push({
      path: 'dev/design-system/*',
      hydrateFallbackElement: loading,
      lazy: async () => ({ Component: (await load()).DesignSystemPage }),
    });
  }
  if (includeDevRoutes && loadDevStatusPage) {
    const load = loadDevStatusPage;
    children.push({
      path: 'dev/status',
      hydrateFallbackElement: loading,
      lazy: async () => ({ Component: (await load()).DevStatusPage }),
    });
  }
  return [
    {
      path: '/tanitim',
      hydrateFallbackElement: loading,
      errorElement: <RouteError />,
      lazy: async () => ({ Component: (await import('./pages/public/LandingPage')).LandingPage }),
    },
    {
      path: '/',
      hydrateFallbackElement: loading,
      errorElement: <RouteError />,
      lazy: async () => ({
        Component: (await import('./pages/AuthenticatedLayout')).AuthenticatedLayout,
      }),
      children,
    },
  ];
}
export function createAppRouter() {
  return createBrowserRouter(buildRoutes({ includeDevRoutes: import.meta.env.DEV }), {
    basename: appConfig.routerBasename,
  });
}
