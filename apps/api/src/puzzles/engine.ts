import { secureRandomInt, shuffle, type RandomInt } from '../study/selection.js';

export type PuzzleType = 'word-search' | 'crossword';
export interface PuzzleWord {
  id: string;
  english: string;
  meanings: string[];
  letters: string;
  segments: number[];
}
export interface OmittedWord {
  id: string;
  english?: string;
  meanings: string[];
  reason: 'unsupported' | 'length' | 'ambiguous' | 'layout';
}
export interface Entry extends PuzzleWord {
  row: number;
  col: number;
  dr: number;
  dc: number;
  number: number;
  solved: boolean;
  attempts: number;
}
export interface Board {
  rows: number;
  cols: number;
  grid: string[];
  draft: string[];
  entries: Entry[];
}
export interface PuzzleDocument {
  schemaVersion: 1;
  selected: PuzzleWord[];
  omitted: OmittedWord[];
  boards: Board[];
}
export interface SourceWord {
  id: string;
  english: string;
  meanings: string[];
}

/** Conservative English policy: ASCII letters and whitespace only, 2–18 letters.
 * No punctuation stripping, transliteration or meaningful-symbol removal (C++).
 * Every member of a collapsed-spelling collision is excluded, never chosen arbitrarily.
 */
export function eligibleWords(words: SourceWord[]) {
  const candidates: PuzzleWord[] = [];
  const omitted: OmittedWord[] = [];
  for (const w of words) {
    const text = w.english.normalize('NFC').trim().replace(/\s+/gu, ' ');
    const letters = text.replaceAll(' ', '').toUpperCase();
    const reason = !/^[A-Za-z]+(?: [A-Za-z]+)*$/.test(text)
      ? 'unsupported'
      : letters.length < 2 || letters.length > 18
        ? 'length'
        : null;
    if (reason) omitted.push({ id: w.id, english: w.english, meanings: w.meanings, reason });
    else candidates.push({ ...w, letters, segments: text.split(' ').map((s) => s.length) });
  }
  const counts = new Map<string, number>();
  for (const w of candidates) counts.set(w.letters, (counts.get(w.letters) ?? 0) + 1);
  const eligible = candidates.filter((w) => {
    if (counts.get(w.letters) === 1) return true;
    omitted.push({ id: w.id, english: w.english, meanings: w.meanings, reason: 'ambiguous' });
    return false;
  });
  return { eligible, omitted };
}

export const directions = [
  [0, 1],
  [1, 0],
  [1, 1],
  [1, -1],
  [0, -1],
  [-1, 0],
  [-1, -1],
  [-1, 1],
] as const;
export function cells(e: Pick<Entry, 'row' | 'col' | 'dr' | 'dc' | 'letters'>) {
  return [...e.letters].map((letter, i) => ({
    row: e.row + i * e.dr,
    col: e.col + i * e.dc,
    letter,
  }));
}
const entry = (w: PuzzleWord, row: number, col: number, dr: number, dc: number): Entry => ({
  ...w,
  row,
  col,
  dr,
  dc,
  number: 0,
  solved: false,
  attempts: 0,
});

/** Exhaustive bounded placement candidates, then random choice among best intersections.
 * At most eight answers per 20×20 board; a full fresh board always fits a valid word.
 */
export function wordSearch(words: PuzzleWord[], random: RandomInt = secureRandomInt): Board[] {
  const boards: Board[] = [];
  let remaining = [...words];
  while (remaining.length) {
    const batch = remaining.slice(0, 8).sort((a, b) => b.letters.length - a.letters.length);
    const size = Math.max(8, ...batch.map((w) => w.letters.length + 2));
    const grid = Array<string>(size * size).fill('');
    const entries: Entry[] = [];
    for (const w of batch) {
      const candidates: { e: Entry; crossings: number }[] = [];
      for (const [dr, dc] of directions)
        for (let row = 0; row < size; row++)
          for (let col = 0; col < size; col++) {
            const e = entry(w, row, col, dr, dc);
            const path = cells(e);
            if (
              path.some(
                (c) =>
                  c.row < 0 ||
                  c.col < 0 ||
                  c.row >= size ||
                  c.col >= size ||
                  (grid[c.row * size + c.col] && grid[c.row * size + c.col] !== c.letter),
              )
            )
              continue;
            // Never let distinct entries share their entire path (including reverse aliases).
            if (
              entries.some((other) => {
                const occupied = new Set(cells(other).map((c) => c.row * size + c.col));
                return path.every((c) => occupied.has(c.row * size + c.col));
              })
            )
              continue;
            candidates.push({
              e,
              crossings: path.filter((c) => grid[c.row * size + c.col]).length,
            });
          }
      if (!candidates.length) continue; // Retried on the next fresh board; never discarded.
      const best = Math.max(...candidates.map((c) => c.crossings));
      const choices = candidates.filter((c) => c.crossings === best);
      const e = choices[random(choices.length)]!.e;
      entries.push(e);
      for (const c of cells(e)) grid[c.row * size + c.col] = c.letter;
    }
    for (let i = 0; i < grid.length; i++)
      if (!grid[i]) grid[i] = String.fromCharCode(65 + random(26));
    boards.push({
      rows: size,
      cols: size,
      grid,
      draft: Array<string>(grid.length).fill(''),
      entries,
    });
    const placed = new Set(entries.map((e) => e.id));
    remaining = remaining.filter((w) => !placed.has(w.id));
  }
  return boards;
}

type Occupied = Map<string, { letter: string; orientations: Set<number> }>;
const key = (r: number, c: number) => `${r}:${c}`;
function occupied(entries: Entry[]): Occupied {
  const map: Occupied = new Map();
  for (const e of entries)
    for (const c of cells(e)) {
      const k = key(c.row, c.col);
      const value = map.get(k) ?? { letter: c.letter, orientations: new Set<number>() };
      value.orientations.add(e.dr);
      map.set(k, value);
    }
  return map;
}
function bounds(entries: Entry[]) {
  const path = entries.flatMap(cells);
  const minR = Math.min(...path.map((c) => c.row)),
    maxR = Math.max(...path.map((c) => c.row));
  const minC = Math.min(...path.map((c) => c.col)),
    maxC = Math.max(...path.map((c) => c.col));
  return { minR, minC, rows: maxR - minR + 1, cols: maxC - minC + 1 };
}
/** New letters require empty perpendicular neighbours. Crossings must be with an
 * opposite orientation, and both endpoints have empty extensions. Thus every run
 * corresponds to a declared answer; parallel overlap and incidental words cannot occur.
 */
export function crosswordPlacement(entries: Entry[], e: Entry): number | null {
  const map = occupied(entries),
    path = cells(e);
  if (
    map.has(key(e.row - e.dr, e.col - e.dc)) ||
    map.has(key(e.row + e.dr * e.letters.length, e.col + e.dc * e.letters.length))
  )
    return null;
  let crossings = 0,
    fresh = 0;
  for (const c of path) {
    const old = map.get(key(c.row, c.col));
    if (old) {
      if (old.letter !== c.letter || old.orientations.has(e.dr)) return null;
      crossings++;
    } else {
      fresh++;
      if (map.has(key(c.row + e.dc, c.col + e.dr)) || map.has(key(c.row - e.dc, c.col - e.dr)))
        return null;
    }
  }
  const box = bounds([...entries, e]);
  if (!fresh || !crossings || box.rows > 19 || box.cols > 19) return null;
  return crossings;
}
function trimBoard(entries: Entry[]): Board {
  const box = bounds(entries);
  const shifted = entries.map((e) => ({ ...e, row: e.row - box.minR, col: e.col - box.minC }));
  const starts = [...new Set(shifted.map((e) => e.row * box.cols + e.col))].sort((a, b) => a - b);
  for (const e of shifted) e.number = starts.indexOf(e.row * box.cols + e.col) + 1;
  const grid = Array<string>(box.rows * box.cols).fill('');
  for (const e of shifted) for (const c of cells(e)) grid[c.row * box.cols + c.col] = c.letter;
  return {
    rows: box.rows,
    cols: box.cols,
    grid,
    draft: Array<string>(grid.length).fill(''),
    entries: shifted,
  };
}
export function crosswordQuality(board: Board): boolean {
  const map = occupied(board.entries);
  const crossings = [...map.values()].filter((c) => c.orientations.size === 2).length;
  const visited = new Set<string>();
  const queue = [board.entries[0]];
  while (queue.length) {
    const e = queue.pop();
    if (!e || visited.has(e.id)) continue;
    visited.add(e.id);
    const path = new Set(cells(e).map((c) => key(c.row, c.col)));
    for (const other of board.entries)
      if (!visited.has(other.id) && cells(other).some((c) => path.has(key(c.row, c.col))))
        queue.push(other);
  }
  return (
    board.entries.length >= 3 &&
    crossings >= 2 &&
    visited.size === board.entries.length &&
    board.rows <= 19 &&
    board.cols <= 19 &&
    map.size / (board.rows * board.cols) >= 0.18
  );
}
/** Eight greedy construction attempts per <=32-word window, <=10 answers per board.
 * Score favours crossings, then compact area. No recursive/unbounded backtracking.
 * Leftovers receive one extra pooled pass; unplaceable identities remain explicit.
 */
export function crosswords(words: PuzzleWord[], random: RandomInt = secureRandomInt) {
  const boards: Board[] = [];
  const deferred: PuzzleWord[] = [];
  function window(pool: PuzzleWord[]): PuzzleWord[] {
    let remaining = [...pool];
    while (remaining.length >= 3) {
      let best: Board | null = null;
      for (let attempt = 0; attempt < Math.min(8, remaining.length); attempt++) {
        const order = shuffle(remaining, random);
        // Vary seeds even with a deterministic test RNG.
        const seed = remaining[attempt]!;
        const placed = [entry(seed, 0, 0, 0, 1)];
        for (let pass = 0; pass < 2 && placed.length < 10; pass++)
          for (const w of order) {
            if (placed.some((e) => e.id === w.id) || placed.length >= 10) continue;
            const map = occupied(placed);
            let chosen: Entry | null = null,
              bestScore = -Infinity;
            for (const [position, value] of map) {
              const [row, col] = position.split(':').map(Number) as [number, number];
              for (let i = 0; i < w.letters.length; i++)
                if (w.letters[i] === value.letter)
                  for (const dr of [0, 1]) {
                    const e = entry(w, row - dr * i, col - (1 - dr) * i, dr, 1 - dr);
                    const crossings = crosswordPlacement(placed, e);
                    if (crossings === null) continue;
                    const box = bounds([...placed, e]);
                    const score = crossings * 1000 - box.rows * box.cols;
                    if (score > bestScore) {
                      chosen = e;
                      bestScore = score;
                    }
                  }
            }
            if (chosen) placed.push(chosen);
          }
        const board = trimBoard(placed);
        if (
          crosswordQuality(board) &&
          (!best ||
            board.entries.length > best.entries.length ||
            (board.entries.length === best.entries.length && board.grid.length < best.grid.length))
        )
          best = board;
      }
      if (!best) break;
      boards.push(best);
      const ids = new Set(best.entries.map((e) => e.id));
      remaining = remaining.filter((w) => !ids.has(w.id));
    }
    return remaining;
  }
  for (let i = 0; i < words.length; i += 32) deferred.push(...window(words.slice(i, i + 32)));
  const omitted: PuzzleWord[] = [];
  for (let i = 0; i < deferred.length; i += 32) omitted.push(...window(deferred.slice(i, i + 32)));
  return { boards, omitted };
}

export function matchSelection(board: Board, start: number, end: number): Entry | undefined {
  if (
    !Number.isInteger(start) ||
    !Number.isInteger(end) ||
    start < 0 ||
    end < 0 ||
    start >= board.grid.length ||
    end >= board.grid.length
  )
    return;
  return board.entries.find((e) => {
    const path = cells(e),
      first = path[0]!,
      last = path.at(-1)!;
    const a = first.row * board.cols + first.col,
      b = last.row * board.cols + last.col;
    return (a === start && b === end) || (a === end && b === start);
  });
}
