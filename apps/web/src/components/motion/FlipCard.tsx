import { motion } from 'motion/react';
import { useId, useState } from 'react';
import { cn } from '../../lib/cn';
import { RefreshIcon } from '../ui/icons';

export interface FlipCardProps {
  term: string;
  meanings: string[];
  className?: string;
}

/**
 * Flashcard with a 3D flip (Motion spring). The whole card is one button;
 * the hidden face is removed from the accessibility tree. With reduced motion
 * enabled, Motion skips the rotation and the face swaps instantly.
 */
export function FlipCard({ term, meanings, className }: FlipCardProps) {
  const [flipped, setFlipped] = useState(false);
  const hintId = useId();

  const face =
    'absolute inset-0 flex flex-col items-center justify-center gap-2 rounded-panel border p-6 text-center backface-hidden';

  return (
    <div className={cn('perspective-[1200px]', className)}>
      <motion.button
        type="button"
        onClick={() => setFlipped((value) => !value)}
        aria-describedby={hintId}
        className="relative block h-56 w-full cursor-pointer rounded-panel transform-3d"
        animate={{ rotateY: flipped ? 180 : 0 }}
        whileHover={{ y: -4 }}
        whileTap={{ scale: 0.98 }}
        transition={{ type: 'spring', stiffness: 260, damping: 24 }}
      >
        <span
          aria-hidden={flipped}
          className={cn(face, 'border-line bg-surface-raised shadow-raised')}
        >
          <span className="text-caption tracking-wide text-fg-muted uppercase">İngilizce</span>
          <span lang="en" className="text-h1 text-fg">
            {term}
          </span>
        </span>
        <span
          aria-hidden={!flipped}
          className={cn(
            face,
            'rotate-y-180 border-transparent bg-action text-on-action shadow-raised',
          )}
        >
          <span className="text-caption tracking-wide uppercase opacity-90">Türkçe anlamları</span>
          <span className="text-h2">{meanings.join(', ')}</span>
        </span>
      </motion.button>
      <p
        id={hintId}
        className="mt-3 flex items-center justify-center gap-1.5 text-small text-fg-muted"
      >
        <RefreshIcon aria-hidden="true" />
        Kartı çevirmek için tıkla ya da Enter / Boşluk tuşuna bas.
      </p>
    </div>
  );
}
