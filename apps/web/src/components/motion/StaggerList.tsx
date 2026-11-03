import { motion } from 'motion/react';
import type { Variants } from 'motion/react';
import { useState } from 'react';
import { Button } from '../ui/Button';
import { RefreshIcon } from '../ui/icons';

export interface StaggerListItem {
  term: string;
  meaning: string;
}

const list: Variants = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.06, delayChildren: 0.05 } },
};

const row: Variants = {
  hidden: { opacity: 0, y: 12 },
  visible: { opacity: 1, y: 0, transition: { type: 'spring', stiffness: 380, damping: 30 } },
};

/** Staggered entrance for lists of words; the replay button remounts the list. */
export function StaggerList({ items }: { items: StaggerListItem[] }) {
  const [run, setRun] = useState(0);
  return (
    <div className="grid gap-3">
      <motion.ul
        key={run}
        variants={list}
        initial="hidden"
        animate="visible"
        className="divide-y divide-line overflow-hidden rounded-card border border-line bg-surface-raised"
      >
        {items.map((item) => (
          <motion.li
            key={item.term}
            variants={row}
            className="flex items-baseline justify-between gap-4 px-4 py-3 transition-colors duration-(--duration-fast) hover:bg-accent-soft"
          >
            <span lang="en" className="font-semibold text-fg">
              {item.term}
            </span>
            <span className="text-right text-small text-fg-muted">{item.meaning}</span>
          </motion.li>
        ))}
      </motion.ul>
      <div>
        <Button
          variant="ghost"
          size="sm"
          icon={<RefreshIcon />}
          onClick={() => setRun((n) => n + 1)}
        >
          Animasyonu yeniden oynat
        </Button>
      </div>
    </div>
  );
}
