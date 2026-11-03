import type { LucideProps } from 'lucide-react';
import {
  ArrowLeftRight,
  CalendarDays,
  CircleMinus,
  Clock3,
  Eye,
  EyeOff,
  Gamepad2,
  Grid2x2,
  LayoutDashboard,
  ListChecks,
  Menu,
  Puzzle,
  Shuffle,
  SkipForward,
} from 'lucide-react';
import type { ReactNode, SVGProps } from 'react';

// Small inline icon set (24px grid, stroke-based). Icons are decorative by
// default; pair them with visible text or pass an aria-label via `title`.
// Glyphs the set below lacks come from lucide-react (end of this file), which
// uses the same 24px grid, 2px stroke and round caps.

type IconProps = SVGProps<SVGSVGElement> & { title?: string };

function Icon({ title, children, ...props }: IconProps & { children: ReactNode }) {
  return (
    <svg
      viewBox="0 0 24 24"
      width="1em"
      height="1em"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden={title ? undefined : true}
      role={title ? 'img' : undefined}
      focusable="false"
      {...props}
    >
      {title ? <title>{title}</title> : null}
      {children}
    </svg>
  );
}

export const CheckIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12.5l4.5 4.5L19 7.5" />
  </Icon>
);

export const CrossIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 6l12 12M18 6L6 18" />
  </Icon>
);

export const AlertIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7.5v5.5M12 16.5h.01" />
  </Icon>
);

export const InfoIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 11v5.5M12 7.5h.01" />
  </Icon>
);

export const ChevronRightIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9.5 6l6 6-6 6" />
  </Icon>
);

export const ChevronDownIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M6 9.5l6 6 6-6" />
  </Icon>
);

export const ArrowRightIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M5 12h14M13 6l6 6-6 6" />
  </Icon>
);

export const ArrowLeftIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M19 12H5M11 6l-6 6 6 6" />
  </Icon>
);

export const PlusIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M12 5v14M5 12h14" />
  </Icon>
);

export const BookIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 19.5v-14A2.5 2.5 0 016.5 3H20v18H6.5A2.5 2.5 0 014 18.5" />
    <path d="M8 7.5h8" />
  </Icon>
);

export const ListIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M9 6h11M9 12h11M9 18h11M4.5 6h.01M4.5 12h.01M4.5 18h.01" />
  </Icon>
);

export const HistoryIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M3.5 12a8.5 8.5 0 102.5-6" />
    <path d="M3 4v4.5h4.5M12 7.5V12l3 2" />
  </Icon>
);

export const CardsIcon = (p: IconProps) => (
  <Icon {...p}>
    <rect x="3" y="6" width="13" height="15" rx="2" />
    <path d="M8 3h11a2 2 0 012 2v13" />
  </Icon>
);

export const SearchIcon = (p: IconProps) => (
  <Icon {...p}>
    <circle cx="11" cy="11" r="7" />
    <path d="M20 20l-4-4" />
  </Icon>
);

export const EditIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M4 20h4L19 9a2.83 2.83 0 00-4-4L4 16v4z" />
    <path d="M13.5 6.5l4 4" />
  </Icon>
);

export const RefreshIcon = (p: IconProps) => (
  <Icon {...p}>
    <path d="M20 11a8 8 0 10-2.3 5.7" />
    <path d="M20 4v7h-7" />
  </Icon>
);

// ---- lucide-react glyphs, sized and hidden like the icons above ------------

const lucideDefaults = { size: '1em', 'aria-hidden': true, focusable: 'false' } as const;

export const DashboardIcon = (p: LucideProps) => <LayoutDashboard {...lucideDefaults} {...p} />;
export const MenuIcon = (p: LucideProps) => <Menu {...lucideDefaults} {...p} />;
export const GamesIcon = (p: LucideProps) => <Gamepad2 {...lucideDefaults} {...p} />;
export const QuizIcon = (p: LucideProps) => <ListChecks {...lucideDefaults} {...p} />;
export const MatchingIcon = (p: LucideProps) => <ArrowLeftRight {...lucideDefaults} {...p} />;
export const MemoryIcon = (p: LucideProps) => <Grid2x2 {...lucideDefaults} {...p} />;
export const ShuffleIcon = (p: LucideProps) => <Shuffle {...lucideDefaults} {...p} />;
export const SkipIcon = (p: LucideProps) => <SkipForward {...lucideDefaults} {...p} />;
export const RemoveIcon = (p: LucideProps) => <CircleMinus {...lucideDefaults} {...p} />;
export const EyeIcon = (p: LucideProps) => <Eye {...lucideDefaults} {...p} />;
export const EyeOffIcon = (p: LucideProps) => <EyeOff {...lucideDefaults} {...p} />;
export const CalendarIcon = (p: LucideProps) => <CalendarDays {...lucideDefaults} {...p} />;
export const ClockIcon = (p: LucideProps) => <Clock3 {...lucideDefaults} {...p} />;
export const PuzzleIcon = (p: LucideProps) => <Puzzle {...lucideDefaults} {...p} />;
