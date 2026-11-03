import { meaningSimilarityKey, type ParsedInput, type SimilarityDecision } from './input.js';
import { ApplicationError } from '../http/errors.js';

export interface StoredWord {
  id: string;
  english: string;
  normalizedEnglishKey: string;
  meanings: { turkish: string; normalizedMeaningKey: string; position: number }[];
}
export interface PlannedWord {
  id?: string;
  english: string;
  key: string;
  nextPosition: number;
  additions: { turkish: string; key: string }[];
}

/** Pure merge planner, used unchanged by every preview and commit. */
export function planVocabulary(
  input: ParsedInput,
  stored: StoredWord[],
  decisions: SimilarityDecision[] = [],
) {
  const choices = new Map(decisions.map((decision) => [decision.id, decision.action]));
  if (choices.size !== decisions.length)
    throw new ApplicationError(400, 'SIMILARITY_DECISION_INVALID');
  const candidates = new Set<string>();
  let unresolvedDecisions = 0;
  const current = new Map(stored.map((word) => [word.normalizedEnglishKey, word]));
  const databaseKeys = new Map(
    stored.map((word) => [
      word.normalizedEnglishKey,
      new Set(word.meanings.map((meaning) => meaning.normalizedMeaningKey)),
    ]),
  );
  const plans = new Map<string, PlannedWord>();
  const known = new Map<string, Set<string>>();
  const anchors = new Map<string, Map<string, { turkish: string; key: string }[]>>();
  const rows = input.entries.map((entry) => {
    const existing = current.get(entry.key);
    let plan = plans.get(entry.key);
    if (!plan) {
      plan = {
        ...(existing ? { id: existing.id } : {}),
        english: existing?.english ?? entry.english,
        key: entry.key,
        nextPosition: existing
          ? existing.meanings.reduce(
              (highest, meaning) => Math.max(highest, meaning.position),
              -1,
            ) + 1
          : 0,
        additions: [],
      };
      plans.set(entry.key, plan);
      known.set(
        entry.key,
        new Set(existing?.meanings.map((meaning) => meaning.normalizedMeaningKey)),
      );
      const groups = new Map<string, { turkish: string; key: string }[]>();
      for (const meaning of existing?.meanings ?? []) {
        const folded = meaningSimilarityKey(meaning.turkish);
        const values = groups.get(folded) ?? [];
        values.push({ turkish: meaning.turkish, key: meaning.normalizedMeaningKey });
        groups.set(folded, values);
      }
      anchors.set(entry.key, groups);
    }
    const seen = known.get(entry.key)!;
    const repeatedWord = !existing && plan.additions.length > 0;
    const meanings = entry.meanings.map((meaning, index) => {
      const inDatabase = databaseKeys.get(entry.key)?.has(meaning.key) ?? false;
      let status = inDatabase ? 'existing' : seen.has(meaning.key) ? 'repeated' : 'new';
      let similarity: { id: string; existing: string; action: 'skip' | 'keep' | null } | undefined;
      if (status === 'new') {
        const groups = anchors.get(entry.key)!;
        const folded = meaningSimilarityKey(meaning.turkish);
        const matches = groups.get(folded);
        if (matches?.length) {
          // Rank only members of the same Turkish-keyboard equivalence group.
          // Stable input order breaks equally close matches; no fuzzy spelling correction.
          const enteredLetters = [...meaning.key];
          const distance = (value: string) =>
            [...value].reduce(
              (total, letter, i) => total + Number(letter !== enteredLetters[i]),
              0,
            );
          const closest = matches.reduce((best, value) =>
            distance(value.key) < distance(best.key) ? value : best,
          );
          const id = `${entry.line}:${index + 1}`;
          candidates.add(id);
          const action = choices.get(id) ?? null;
          similarity = { id, existing: closest.turkish, action };
          if (action === null) {
            status = 'possible_duplicate';
            unresolvedDecisions++;
          } else if (action === 'skip') status = 'similarity_skipped';
        } else {
          // A batch anchor is always a retained new meaning, never a skipped candidate.
          groups.set(folded, [meaning]);
        }
      }
      if (status === 'new') plan.additions.push(meaning);
      seen.add(meaning.key);
      return { turkish: meaning.turkish, status, ...(similarity ? { similarity } : {}) };
    });
    const additions = meanings.filter((meaning) => meaning.status === 'new').length;
    return {
      line: entry.line,
      english: entry.english,
      existingWordId: existing?.id ?? null,
      status: meanings.some((meaning) => meaning.status === 'possible_duplicate')
        ? 'review'
        : additions === 0
          ? meanings.some((meaning) => meaning.status === 'similarity_skipped')
            ? 'skipped'
            : 'duplicate'
          : existing
            ? 'merge'
            : repeatedWord
              ? 'batch_merge'
              : 'new',
      meanings,
      warnings: entry.warnings,
    };
  });
  if (decisions.some((decision) => !candidates.has(decision.id)))
    throw new ApplicationError(400, 'SIMILARITY_DECISION_INVALID');
  const changes = [...plans.values()].filter((word) => word.additions.length);
  const counts = {
    newWords: changes.filter((word) => !word.id).length,
    mergedWords: changes.filter((word) => word.id).length,
    newMeanings: changes.reduce((sum, word) => sum + word.additions.length, 0),
    skippedMeanings: rows.reduce(
      (sum, row) =>
        sum +
        row.meanings.filter((meaning) =>
          ['existing', 'repeated', 'similarity_skipped'].includes(meaning.status),
        ).length,
      0,
    ),
    duplicateEntries: rows.filter((row) => row.status === 'duplicate').length,
  };
  return {
    rows,
    invalid: input.invalid,
    counts,
    unresolvedDecisions,
    canCommit: input.invalid.length === 0 && unresolvedDecisions === 0 && changes.length > 0,
    changes,
  };
}
