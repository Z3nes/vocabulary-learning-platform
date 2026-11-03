import { describe, expect, it } from 'vitest';
import { newestActivities } from '../src/routes/activity.js';
describe('recent activity merge', () => {
  it('sorts across sources chronologically', () =>
    expect(
      newestActivities([
        { at: '2026-01-01', key: 'game:1' },
        { at: '2026-02-01', key: 'flashcard:1' },
      ]).map((a) => a.key),
    ).toEqual(['flashcard:1', 'game:1']));
  it('uses deterministic tie breaking', () => {
    const rows = [
      { at: '2026-01-01', key: 'a' },
      { at: '2026-01-01', key: 'b' },
    ];
    expect(newestActivities(rows.slice())).toEqual(newestActivities(rows.slice().reverse()));
  });
  it('bounds output to fifty', () =>
    expect(
      newestActivities(
        Array.from({ length: 100 }, (_, i) => ({ at: '2026-01-01', key: String(i) })),
      ),
    ).toHaveLength(50));
  it('handles empty history', () => expect(newestActivities([])).toEqual([]));
});
