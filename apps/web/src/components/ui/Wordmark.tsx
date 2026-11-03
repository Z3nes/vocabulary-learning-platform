import { cn } from '../../lib/cn';

export interface WordmarkProps {
  /** Show the "temporary branding" note (until official university assets exist). */
  showTemporaryNote?: boolean;
  className?: string;
}

/**
 * Neutral, temporary product wordmark. It deliberately uses no university logo,
 * seal or name; replace it once official assets and usage rules are provided.
 * The mark is a small stack of study cards; the text names the product.
 */
export function Wordmark({ showTemporaryNote = false, className }: WordmarkProps) {
  return (
    <span className={cn('inline-flex items-center gap-3', className)}>
      <span aria-hidden="true" className="relative grid size-10 shrink-0 place-items-center">
        {/* The card behind: tilted, lighter. */}
        <span className="absolute inset-0 rotate-[-9deg] rounded-[0.7rem] bg-[linear-gradient(135deg,#7cbbff,#6366f1)] opacity-55" />
        <span className="relative grid size-10 place-items-center rounded-[0.7rem] bg-[linear-gradient(140deg,#2f7ae5_0%,#1262b0_55%,#3730a3_100%)] text-[1.02rem] font-extrabold tracking-[-0.04em] text-white shadow-[inset_0_1px_0_rgb(255_255_255/0.25),0_6px_14px_-6px_rgb(18_98_176/0.8)]">
          Kç
        </span>
      </span>
      <span className="grid leading-tight">
        <span className="text-body font-bold tracking-[-0.015em] text-fg">
          Kelime Çalışma <span className="font-medium text-fg-muted">Platformu</span>
        </span>
        {showTemporaryNote ? (
          <span className="text-caption text-fg-muted">Geçici marka · resmî kimlik bekleniyor</span>
        ) : null}
      </span>
    </span>
  );
}
