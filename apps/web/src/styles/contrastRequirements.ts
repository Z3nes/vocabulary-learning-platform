// Required contrast for every semantic token pair, on every surface.
// Shared by the automated test (tokens.contrast.test.ts) and the design-system page.

export const surfaces = ['light', 'dark', 'navy'] as const;
export type Surface = (typeof surfaces)[number];

export const surfaceLabels: Record<Surface, string> = {
  light: 'Açık yüzey',
  dark: 'Koyu yüzey (antrasit)',
  navy: 'Lacivert yüzey',
};

/** Semantic role name without the "--sem-" prefix, e.g. "fg" or "surface-raised". */
export type Role = string;

export interface ContrastRequirement {
  fg: Role;
  bg: Role;
  /** 4.5 for normal text (WCAG 1.4.3), 3 for UI boundaries and focus (WCAG 1.4.11). */
  min: 4.5 | 3;
  label: string;
}

const backgrounds: { role: Role; label: string }[] = [
  { role: 'surface', label: 'zemin' },
  { role: 'surface-raised', label: 'kart' },
  { role: 'surface-sunken', label: 'çukur alan' },
];

const textOnBackgrounds: { role: Role; label: string }[] = [
  { role: 'fg', label: 'Ana metin' },
  { role: 'fg-muted', label: 'İkincil metin' },
  { role: 'accent', label: 'Bağlantı / vurgu' },
  { role: 'danger', label: 'Hata metni' },
  { role: 'success', label: 'Başarı metni' },
];

export const contrastRequirements: ContrastRequirement[] = [
  ...textOnBackgrounds.flatMap((text) =>
    backgrounds.map((bg) => ({
      fg: text.role,
      bg: bg.role,
      min: 4.5 as const,
      label: `${text.label} / ${bg.label}`,
    })),
  ),
  { fg: 'on-action', bg: 'action', min: 4.5, label: 'Birincil buton metni' },
  { fg: 'on-action', bg: 'action-hover', min: 4.5, label: 'Birincil buton (üzerine gelme)' },
  { fg: 'on-accent-soft', bg: 'accent-soft', min: 4.5, label: 'Vurgulu zemin metni' },
  { fg: 'accent', bg: 'accent-soft', min: 4.5, label: 'Vurgu / vurgulu zemin' },
  { fg: 'on-selected', bg: 'selected', min: 4.5, label: 'Etkin gezinme öğesi metni' },
  { fg: 'on-danger-action', bg: 'danger-action', min: 4.5, label: 'Tehlikeli işlem butonu' },
  {
    fg: 'on-danger-action',
    bg: 'danger-action-hover',
    min: 4.5,
    label: 'Tehlikeli işlem (üzerine gelme)',
  },
  { fg: 'danger', bg: 'danger-soft', min: 4.5, label: 'Hata kutusu metni' },
  { fg: 'success', bg: 'success-soft', min: 4.5, label: 'Başarı kutusu metni' },
  { fg: 'fg', bg: 'success-soft', min: 4.5, label: 'Başarı bildirimi metni' },
  { fg: 'on-highlight', bg: 'highlight', min: 4.5, label: 'Tekrar vurgusu metni' },
  { fg: 'on-disabled', bg: 'disabled', min: 4.5, label: 'Devre dışı buton metni' },
  ...backgrounds.flatMap((bg) => [
    { fg: 'line-strong', bg: bg.role, min: 3 as const, label: `Form alanı kenarı / ${bg.label}` },
    { fg: 'focus', bg: bg.role, min: 3 as const, label: `Odak halkası / ${bg.label}` },
    // WCAG 1.4.11: the active state must be visible without relying on the fill,
    // which may be below 3:1 against the surface (e.g. #1262b0 on charcoal).
    {
      fg: 'selected-indicator',
      bg: bg.role,
      min: 3 as const,
      label: `Etkin öğe göstergesi / ${bg.label}`,
    },
  ]),
];
