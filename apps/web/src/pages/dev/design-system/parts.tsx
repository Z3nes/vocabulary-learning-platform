import { useLayoutEffect, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { Tabs } from '../../../components/ui/navigation';
import { cn } from '../../../lib/cn';
import { contrastRatio, formatRatio } from '../../../styles/contrast';
import {
  contrastRequirements,
  surfaceLabels,
  surfaces,
  type Surface,
} from '../../../styles/contrastRequirements';

export function Section({
  id,
  title,
  description,
  children,
}: {
  id: string;
  title: string;
  description?: ReactNode;
  children: ReactNode;
}) {
  return (
    <section
      id={id}
      aria-labelledby={`${id}-title`}
      className="grid grid-cols-1 gap-5 border-t border-line pt-10"
    >
      <div className="grid gap-2">
        <h2 id={`${id}-title`} className="text-h2 text-fg">
          {title}
        </h2>
        {description ? <p className="max-w-prose text-body text-fg-muted">{description}</p> : null}
      </div>
      {children}
    </section>
  );
}

export function SurfacePanel({
  surface,
  label,
  className,
  children,
}: {
  surface: Surface;
  label?: string;
  className?: string | undefined;
  children: ReactNode;
}) {
  return (
    <div
      data-surface={surface}
      className={cn(
        '@container grid min-w-0 grid-cols-1 content-start gap-4 rounded-panel border border-line p-5 sm:p-6',
        className,
      )}
    >
      <p className="text-caption tracking-wide text-fg-muted uppercase">
        {label ?? surfaceLabels[surface]}
      </p>
      {children}
    </div>
  );
}

/** Renders the same example on the light and the dark (charcoal) surface. */
export function SurfacePair({
  children,
  className,
}: {
  children: (surface: Surface) => ReactNode;
  className?: string | undefined;
}) {
  return (
    <div className="grid gap-4 xl:grid-cols-2">
      {(['light', 'dark'] as const).map((surface) => (
        <SurfacePanel key={surface} surface={surface} className={className}>
          {children(surface)}
        </SurfacePanel>
      ))}
    </div>
  );
}

export function Swatch({ value, name, role }: { value: string; name: string; role: string }) {
  return (
    <div className="grid gap-2">
      <span
        className="h-16 rounded-control border border-line shadow-card"
        style={{ backgroundColor: value }}
        aria-hidden="true"
      />
      <span className="grid">
        <span className="text-small font-semibold text-fg">{name}</span>
        <span className="text-caption text-fg-muted">{role}</span>
        <code className="text-caption text-fg">{value.toUpperCase()}</code>
      </span>
    </div>
  );
}

/** Reads the live semantic role values (`--sem-*`) from a rendered surface. */
function useSemanticTokens(surface: Surface) {
  const ref = useRef<HTMLDivElement>(null);
  const [values, setValues] = useState<Record<string, string>>({});

  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const style = getComputedStyle(element);
    const roles = new Set(contrastRequirements.flatMap((r) => [r.fg, r.bg]));
    setValues(
      Object.fromEntries(
        [...roles].map((role) => [role, style.getPropertyValue(`--sem-${role}`).trim()]),
      ),
    );
  }, [surface]);

  return { ref, values };
}

function ContrastTable({ surface }: { surface: Surface }) {
  const { ref, values } = useSemanticTokens(surface);
  return (
    <div
      ref={ref}
      data-surface={surface}
      className="overflow-x-auto rounded-card border border-line"
    >
      <table className="w-full min-w-[36rem] border-collapse text-left text-small">
        <caption className="sr-only">{surfaceLabels[surface]} için kontrast oranları</caption>
        <thead className="bg-surface-sunken text-fg">
          <tr>
            <th scope="col" className="px-4 py-2.5 font-semibold">
              Çift
            </th>
            <th scope="col" className="px-4 py-2.5 font-semibold">
              Örnek
            </th>
            <th scope="col" className="px-4 py-2.5 font-semibold">
              Oran
            </th>
            <th scope="col" className="px-4 py-2.5 font-semibold">
              Gereken
            </th>
            <th scope="col" className="px-4 py-2.5 font-semibold">
              Sonuç
            </th>
          </tr>
        </thead>
        <tbody>
          {contrastRequirements.map((req) => {
            const fg = values[req.fg];
            const bg = values[req.bg];
            const ratio = fg && bg ? contrastRatio(fg, bg) : undefined;
            const pass = ratio !== undefined && ratio >= req.min;
            return (
              <tr key={`${req.fg}-${req.bg}`} className="border-t border-line">
                <th scope="row" className="px-4 py-2 font-medium text-fg">
                  {req.label}
                  <span className="block text-caption font-normal text-fg-muted">
                    {req.fg} / {req.bg}
                  </span>
                </th>
                <td className="px-4 py-2">
                  <span
                    className="inline-flex h-7 min-w-12 items-center justify-center rounded-md border border-line px-2 font-semibold"
                    style={{ color: fg, backgroundColor: bg }}
                  >
                    {req.min === 3 ? '■' : 'Ağ'}
                  </span>
                </td>
                <td className="px-4 py-2 font-semibold text-fg tabular-nums">
                  {ratio === undefined ? '—' : formatRatio(ratio)}
                </td>
                <td className="px-4 py-2 text-fg tabular-nums">
                  {req.min === 3 ? '3:1 (bileşen)' : '4,5:1 (metin)'}
                </td>
                <td
                  className={cn('px-4 py-2 font-semibold', pass ? 'text-success' : 'text-danger')}
                >
                  {ratio === undefined ? '—' : pass ? '✓ Geçti' : '✗ Kaldı'}
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export function ContrastTables() {
  return (
    <Tabs
      label="Yüzeye göre kontrast tabloları"
      items={surfaces.map((surface) => ({
        id: surface,
        label: surfaceLabels[surface],
        panel: <ContrastTable surface={surface} />,
      }))}
    />
  );
}
