import { useEffect } from 'react';
import { Link } from 'react-router';
import { AppHeader, SkipLink } from '../../components/layout/AppHeader';
import { Badge } from '../../components/ui/Badge';
import {
  ButtonsSection,
  CardsSection,
  ColorsSection,
  ContrastSection,
  EmptyStatesSection,
  FocusSection,
  FormsSection,
  HoverSection,
  MotionSection,
  NavigationSection,
  SidebarSection,
  TypographySection,
} from './design-system/sections';

const sections = [
  { id: 'renkler', label: 'Renkler' },
  { id: 'tipografi', label: 'Tipografi' },
  { id: 'kontrast', label: 'Kontrast' },
  { id: 'butonlar', label: 'Butonlar' },
  { id: 'gezinme', label: 'Gezinme' },
  { id: 'kenar-cubugu', label: 'Kenar çubuğu' },
  { id: 'kartlar', label: 'Kartlar' },
  { id: 'formlar', label: 'Form alanları' },
  { id: 'odak', label: 'Odak durumları' },
  { id: 'bos-durumlar', label: 'Boş durumlar' },
  { id: 'uzerine-gelme', label: 'Üzerine gelme' },
  { id: 'animasyonlar', label: 'Animasyonlar' },
];

/** Development-only visual reference for the design system (not shipped in production). */
export function DesignSystemPage() {
  useEffect(() => {
    const previous = document.title;
    document.title = 'Tasarım sistemi · Kelime Çalışma Platformu';
    return () => {
      document.title = previous;
    };
  }, []);

  return (
    <>
      <SkipLink />
      <AppHeader>
        <Badge tone="info">Yalnızca geliştirme ortamı</Badge>
      </AppHeader>

      <div className="mx-auto grid max-w-7xl grid-cols-1 gap-8 px-4 py-10 sm:px-6 lg:grid-cols-[13rem_minmax(0,1fr)] lg:gap-10">
        <nav
          aria-label="Tasarım sistemi bölümleri"
          className="min-w-0 lg:sticky lg:top-6 lg:self-start"
        >
          <p className="mb-2 text-caption tracking-wide text-fg-muted uppercase">Bölümler</p>
          <ul className="-mx-1 flex gap-1 overflow-x-auto px-1 pb-1 lg:mx-0 lg:grid lg:overflow-visible lg:px-0">
            {sections.map((section) => (
              <li key={section.id} className="shrink-0">
                <a
                  href={`#${section.id}`}
                  className="block rounded-control px-3 py-1.5 text-small font-medium text-fg no-underline transition-colors duration-(--duration-fast) hover:bg-accent-soft hover:text-on-accent-soft"
                >
                  {section.label}
                </a>
              </li>
            ))}
          </ul>
        </nav>

        <main
          id="main"
          tabIndex={-1}
          className="grid min-w-0 grid-cols-1 gap-10 focus:outline-none"
        >
          <header className="grid gap-3">
            <p className="text-small">
              <Link to="/" className="font-semibold">
                ← Kontrol paneli
              </Link>
              {' · '}
              <Link to="/dev/status" className="font-semibold">
                Servis durumu
              </Link>
            </p>
            <h1 className="text-display text-fg">Tasarım sistemi önizlemesi</h1>
            <p className="max-w-prose text-body-lg text-fg-muted">
              Renkler, yazı tipleri ve ortak bileşenler burada tek yerde gösterilir. Kontrol paneli
              bu temeller üzerine kurulur. Marka öğeleri geçicidir; resmî üniversite kimliği
              kullanılmamıştır.
            </p>
          </header>

          <ColorsSection />
          <TypographySection />
          <ContrastSection />
          <ButtonsSection />
          <NavigationSection />
          <SidebarSection />
          <CardsSection />
          <FormsSection />
          <FocusSection />
          <EmptyStatesSection />
          <HoverSection />
          <MotionSection />
        </main>
      </div>
    </>
  );
}
