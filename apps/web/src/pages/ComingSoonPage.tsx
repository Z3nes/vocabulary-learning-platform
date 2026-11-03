import type { ReactNode } from 'react';
import { Badge } from '../components/ui/Badge';
import { ButtonLink } from '../components/ui/ButtonLink';
import { Card } from '../components/ui/Card';
import { DashboardIcon } from '../components/ui/icons';
import { useDocumentTitle } from '../lib/useDocumentTitle';

export interface ComingSoonPageProps {
  /** Page title: the <h1> and the document title. */
  title: string;
  /** What this page will be for, in one or two sentences. */
  description: string;
  /** Decorative icon for the status card. */
  icon: ReactNode;
  /** Short list of what the finished page will offer. */
  plannedFeatures?: readonly string[];
}

/**
 * Honest placeholder for a route whose feature is not built yet. It explains
 * the status and offers a way back; it has no controls that pretend to work.
 */
export function ComingSoonPage({
  title,
  description,
  icon,
  plannedFeatures = [],
}: ComingSoonPageProps) {
  useDocumentTitle(title);

  return (
    <div className="grid max-w-3xl gap-8">
      <header className="grid gap-3">
        <Badge tone="info" className="justify-self-start">
          Geliştirme aşamasında
        </Badge>
        <h1 className="text-h1 text-fg">{title}</h1>
        <p className="text-body-lg text-fg-muted">{description}</p>
      </header>

      <Card className="grid gap-5">
        <div className="flex items-start gap-4">
          <span
            aria-hidden="true"
            className="grid size-12 shrink-0 place-items-center rounded-control bg-accent-soft text-[1.5rem] text-on-accent-soft"
          >
            {icon}
          </span>
          <div className="grid gap-1">
            <h2 className="text-h3 text-fg">Bu bölüm henüz hazır değil</h2>
            <p className="text-body text-fg-muted">
              Sonraki geliştirme aşamalarında eklenecek. Şu anda bu sayfada kaydedilen ya da işlenen
              bir veri yok.
            </p>
          </div>
        </div>

        {plannedFeatures.length > 0 ? (
          <div className="grid gap-3 border-t border-line pt-5">
            <h3 className="text-h4 text-fg">Planlanan içerik</h3>
            <ul className="grid gap-2">
              {plannedFeatures.map((feature) => (
                <li key={feature} className="flex gap-3 text-body text-fg">
                  <span
                    aria-hidden="true"
                    className="mt-2.5 size-1.5 shrink-0 rounded-full bg-accent"
                  />
                  {feature}
                </li>
              ))}
            </ul>
          </div>
        ) : null}

        <div className="flex flex-wrap gap-3 border-t border-line pt-5">
          <ButtonLink to="/" variant="secondary" icon={<DashboardIcon />}>
            Kontrol paneline dön
          </ButtonLink>
        </div>
      </Card>
    </div>
  );
}
