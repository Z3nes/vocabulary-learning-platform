import { useId, type ReactNode } from 'react';
import { ChoiceGroup, ChoiceTile } from '../../components/ui/ChoiceTile';
import { estimatedCardCount, studyPercentages, type StudyPercentage } from '../../lib/study';

/** Session size as percentage tiles; each tile states the resulting item count. */
export function PercentageChoices({
  count,
  value,
  change,
  unit = 'soru',
  summary = (items) => `Bu çalışma ${items} sorudan oluşacak.`,
}: {
  count: number;
  value: StudyPercentage;
  change: (p: StudyPercentage) => void;
  /** What one item is called on the tiles, e.g. "12 soru" or "12 kelime". */
  unit?: string | undefined;
  /** The sentence under the tiles for the selected size. */
  summary?: ((items: number) => ReactNode) | undefined;
}) {
  const id = useId();
  return (
    <div className="grid gap-3">
      <ChoiceGroup legend="Çalışma boyutu" columns="grid-cols-2 md:grid-cols-4">
        {studyPercentages.map((p) => {
          const items = estimatedCardCount(count, p);
          return (
            <ChoiceTile
              key={p}
              name={`${id}-percentage`}
              value={p}
              checked={value === p}
              onChange={() => change(p)}
              label={`%${p}`}
              detail={`${items} ${unit}`}
              accessibleLabel={`%${p} · ${items} ${unit}`}
            />
          );
        })}
      </ChoiceGroup>
      <p className="text-body text-fg">{summary(estimatedCardCount(count, value))}</p>
    </div>
  );
}
