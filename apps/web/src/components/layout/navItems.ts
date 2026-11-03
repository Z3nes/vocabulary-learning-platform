import type { ComponentType } from 'react';
import { CardsIcon, DashboardIcon, GamesIcon, HistoryIcon, ListIcon } from '../ui/icons';

export interface PrimaryNavItem {
  /** Router path, resolved against the app basename. */
  to: string;
  label: string;
  Icon: ComponentType;
  /** Match the exact path only (the dashboard index route). */
  end?: boolean;
}

/** Primary destinations, shared by the desktop sidebar and the mobile drawer. */
export const primaryNavItems: readonly PrimaryNavItem[] = [
  { to: '/', label: 'Kontrol Paneli', Icon: DashboardIcon, end: true },
  { to: '/lists', label: 'Listelerim', Icon: ListIcon },
  { to: '/study', label: 'Kelime Çalış', Icon: CardsIcon },
  { to: '/games', label: 'Alıştırmalar', Icon: GamesIcon },
  { to: '/history', label: 'Çalışma Geçmişi', Icon: HistoryIcon },
];
