import { cn } from '../../lib/cn';
import { ArrowRightIcon, InfoIcon } from '../ui/icons';
import { SidebarNav, SidebarNavItem } from '../ui/SidebarNav';
import { primaryNavItems } from './navItems';
import { Link } from 'react-router';

/** The app's main navigation list. Render it on a `data-surface="dark"` container. */
export function PrimaryNav() {
  return (
    <SidebarNav label="Ana gezinme">
      {primaryNavItems.map(({ to, label, Icon, end }) => (
        <SidebarNavItem key={to} to={to} icon={<Icon />} end={end ?? false}>
          {label}
        </SidebarNavItem>
      ))}
    </SidebarNav>
  );
}

/** Honest status note shown at the bottom of the sidebar and drawer. */
export function DevelopmentNote({ className }: { className?: string }) {
  return (
    <div
      className={cn(
        'rounded-card border border-line bg-surface-raised/60 px-4 pt-3.5 pb-2 text-small',
        className,
      )}
    >
      <p className="flex items-center gap-2 font-semibold text-fg">
        <InfoIcon aria-hidden="true" className="shrink-0 text-[1.05rem] text-accent" />
        Geliştirme sürümü
      </p>
      <p className="mt-1 text-fg-muted">
        Geçici marka. Yerel geliştirmede ortak bir demo kimliği kullanılır.
      </p>
      <Link
        className="group mt-1 inline-flex min-h-11 items-center gap-1.5 font-semibold no-underline hover:underline"
        to="/tanitim"
      >
        Platformu tanı
        <ArrowRightIcon
          aria-hidden="true"
          className="transition-transform duration-(--duration-base) ease-standard group-hover:translate-x-0.5 motion-reduce:group-hover:translate-x-0"
        />
      </Link>
    </div>
  );
}
