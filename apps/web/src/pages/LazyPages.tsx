import { lazy } from 'react';
export const QuizPage = lazy(() => import('./games/QuizPage'));
export const MatchingPage = lazy(() => import('./games/MatchingPage'));
export const AssemblyPage = lazy(() => import('./games/AssemblyPage'));
export const MemoryPage = lazy(() => import('./games/MemoryPage'));
export const HistoryPage = lazy(() => import('./study/HistoryPage'));
export const ReviewPage = lazy(() => import('./study/ReviewPage'));
