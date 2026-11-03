import { createHash } from 'node:crypto';
import type { Prisma, PrismaClient, PuzzleSession } from '../generated/prisma/client.js';
import { ApplicationError } from '../http/errors.js';
import { lockList } from '../vocabulary/service.js';
import { sessionCardCount, shuffle, type StudyPercentage } from '../study/selection.js';
import {
  cells,
  crosswords,
  eligibleWords,
  matchSelection,
  wordSearch,
  type PuzzleDocument,
  type PuzzleType,
} from './engine.js';

type Tx = Prisma.TransactionClient;
const missing = () => new ApplicationError(404, 'PUZZLE_NOT_FOUND');
const conflict = () => new ApplicationError(409, 'PUZZLE_CONFLICT');
const transaction = <T>(db: PrismaClient, op: (tx: Tx) => Promise<T>) =>
  db.$transaction(op, { maxWait: 10000, timeout: 20000 });
// Documents are created exclusively by this module, never accepted from requests.
export const documentOf = (s: PuzzleSession) => s.document as unknown as PuzzleDocument;
const json = (d: PuzzleDocument) => d as unknown as Prisma.InputJsonValue;
export function puzzleView(s: PuzzleSession) {
  const d = documentOf(s);
  return {
    id: s.id,
    listId: s.wordListId,
    listTitle: s.listTitle,
    gameType: s.gameType,
    percentage: s.percentage,
    eligibleCount: s.eligibleCount,
    selectedCount: s.selectedCount,
    placedCount: s.placedCount,
    version: s.version,
    status: s.status,
    createdAt: s.createdAt,
    completedAt: s.completedAt,
    canceledAt: s.canceledAt,
    omitted: d.omitted,
    boards: d.boards.map((b) => {
      const revealed = new Map<number, string>();
      for (const e of b.entries.filter((e) => e.solved))
        for (const c of cells(e)) revealed.set(c.row * b.cols + c.col, c.letter);
      return {
        rows: b.rows,
        cols: b.cols,
        // A crossword exposes only cell occupancy, the student's draft and solved crossings.
        grid: b.grid.map((letter, i) =>
          s.gameType === 'word-search' ? letter : letter ? (revealed.get(i) ?? '') : null,
        ),
        draft: b.draft,
        entries: b.entries.map((e) => ({
          id: e.id,
          meanings: e.meanings,
          length: e.letters.length,
          segments: e.segments,
          number: e.number,
          solved: e.solved,
          attempts: e.attempts,
          ...(s.gameType === 'crossword' || e.solved
            ? { row: e.row, col: e.col, dr: e.dr, dc: e.dc }
            : {}),
          ...(e.solved ? { english: e.english } : {}),
        })),
      };
    }),
    // Original unplaced expressions are only disclosed in the terminal completed result.
    unplaced:
      s.status === 'COMPLETED'
        ? d.selected.filter((w) => !d.boards.some((b) => b.entries.some((e) => e.id === w.id)))
        : [],
  };
}
export async function getPuzzle(db: PrismaClient | Tx, ownerId: string, id: string) {
  const s = await db.puzzleSession.findFirst({ where: { id, ownerId } });
  if (!s) throw missing();
  return puzzleView(s);
}
export async function activePuzzles(db: PrismaClient, ownerId: string, gameType: PuzzleType) {
  return db.puzzleSession.findMany({
    where: { ownerId, gameType, status: 'ACTIVE' },
    select: { id: true, listTitle: true, placedCount: true },
    orderBy: [{ createdAt: 'desc' }, { id: 'desc' }],
  });
}
async function pool(db: PrismaClient | Tx, ownerId: string, listId: string) {
  const list = await db.wordList.findFirst({ where: { id: listId, ownerId } });
  if (!list) throw new ApplicationError(404, 'LIST_NOT_FOUND');
  const words = await db.word.findMany({
    where: { wordListId: listId, wordList: { ownerId } },
    include: { meanings: { orderBy: { position: 'asc' } } },
    orderBy: [{ createdAt: 'asc' }, { id: 'asc' }],
  });
  return {
    list,
    ...eligibleWords(
      words.map((w) => ({
        id: w.id,
        english: w.english,
        meanings: w.meanings.map((m) => m.turkish),
      })),
    ),
  };
}
export async function puzzleSetup(
  db: PrismaClient,
  ownerId: string,
  listId: string,
  gameType: PuzzleType,
) {
  const p = await pool(db, ownerId, listId);
  const active = await db.puzzleSession.findFirst({
    where: { ownerId, gameType, scopeKey: `LIST:${listId}`, status: 'ACTIVE' },
  });
  return {
    eligibleCount: p.eligible.length,
    omitted: p.omitted,
    session: active ? puzzleView(active) : null,
  };
}
export async function startPuzzle(
  db: PrismaClient,
  ownerId: string,
  listId: string,
  gameType: PuzzleType,
  percentage: StudyPercentage,
) {
  return transaction(db, async (tx) => {
    await lockList(tx, listId, ownerId);
    if (
      await tx.puzzleSession.findFirst({
        where: { ownerId, gameType, scopeKey: `LIST:${listId}`, status: 'ACTIVE' },
      })
    )
      throw new ApplicationError(409, 'PUZZLE_ACTIVE');
    const p = await pool(tx, ownerId, listId);
    const selected = shuffle(p.eligible).slice(0, sessionCardCount(p.eligible.length, percentage));
    if (!selected.length) throw new ApplicationError(409, 'PUZZLE_NO_WORDS');
    const built =
      gameType === 'crossword'
        ? crosswords(selected)
        : { boards: wordSearch(selected), omitted: [] };
    if (!built.boards.length) throw new ApplicationError(409, 'CROSSWORD_UNAVAILABLE');
    const document: PuzzleDocument = {
      schemaVersion: 1,
      selected,
      omitted: [
        ...p.omitted,
        ...built.omitted.map((w) => ({
          id: w.id,
          meanings: w.meanings,
          reason: 'layout' as const,
        })),
      ],
      boards: built.boards,
    };
    return puzzleView(
      await tx.puzzleSession.create({
        data: {
          ownerId,
          wordListId: listId,
          scopeKey: `LIST:${listId}`,
          listTitle: p.list.title,
          gameType,
          percentage,
          eligibleCount: p.eligible.length,
          selectedCount: selected.length,
          placedCount: built.boards.reduce((n, b) => n + b.entries.length, 0),
          document: json(document),
        },
      }),
    );
  });
}
async function locked(tx: Tx, ownerId: string, id: string) {
  const owned = await tx.puzzleSession.findFirst({ where: { id, ownerId } });
  if (!owned) throw missing();
  // Same list -> session order as vocabulary/practice; deleted lists retain snapshots.
  if (owned.wordListId)
    await tx.$queryRaw`SELECT "id" FROM "WordList" WHERE "id" = ${owned.wordListId}::uuid AND "ownerId" = ${ownerId}::uuid FOR UPDATE`;
  await tx.$queryRaw`SELECT "id" FROM "PuzzleSession" WHERE "id" = ${id}::uuid AND "ownerId" = ${ownerId}::uuid FOR UPDATE`;
  const s = await tx.puzzleSession.findFirst({ where: { id, ownerId } });
  if (!s) throw missing();
  return s;
}
export type PuzzleMove = { commandId: string; version: number; board: number } & (
  | { action: 'select'; start: number; end: number }
  | { action: 'draft'; values: string[] }
  | { action: 'check'; entryId: string }
);
export async function movePuzzle(db: PrismaClient, ownerId: string, id: string, input: PuzzleMove) {
  const hash = createHash('sha256').update(JSON.stringify(input)).digest('hex');
  return transaction(db, async (tx) => {
    const s = await locked(tx, ownerId, id);
    const receipt = await tx.puzzleCommand.findUnique({
      where: { sessionId_commandId: { sessionId: id, commandId: input.commandId } },
    });
    if (receipt) {
      if (receipt.requestHash !== hash) throw conflict();
      return { session: puzzleView(s), correct: receipt.correct, applied: false };
    }
    if (s.status !== 'ACTIVE' || s.version !== input.version) throw conflict();
    const d = documentOf(s),
      b = d.boards[input.board];
    if (!b) throw conflict();
    let correct: boolean | null = null;
    if (input.action === 'select') {
      if (s.gameType !== 'word-search') throw conflict();
      const e = matchSelection(b, input.start, input.end);
      correct = !!e;
      if (e && !e.solved) {
        e.solved = true;
        e.attempts++;
      }
    } else {
      if (s.gameType !== 'crossword') throw conflict();
      if (input.action === 'draft') {
        if (
          input.values.length !== b.grid.length ||
          input.values.some((v, i) => !/^[A-Za-z]?$/.test(v) || (!b.grid[i] && v))
        )
          throw new ApplicationError(400, 'VALIDATION_FAILED');
        b.draft = input.values.map((v) => v.toUpperCase());
        for (const e of b.entries.filter((e) => e.solved))
          for (const c of cells(e)) b.draft[c.row * b.cols + c.col] = c.letter;
      } else {
        const e = b.entries.find((e) => e.id === input.entryId);
        if (!e) throw conflict();
        correct =
          cells(e)
            .map((c) => b.draft[c.row * b.cols + c.col])
            .join('') === e.letters;
        if (!e.solved) {
          e.attempts++;
          e.solved = correct;
        } else correct = true;
      }
    }
    const updated = await tx.puzzleSession.update({
      where: { id },
      data: { document: json(d), version: { increment: 1 } },
    });
    await tx.puzzleCommand.create({
      data: { sessionId: id, commandId: input.commandId, requestHash: hash, correct },
    });
    return { session: puzzleView(updated), correct, applied: true };
  });
}
export async function finishPuzzle(db: PrismaClient, ownerId: string, id: string, cancel = false) {
  return transaction(db, async (tx) => {
    const s = await locked(tx, ownerId, id),
      status = cancel ? 'CANCELED' : 'COMPLETED';
    if (s.status === status) return { session: puzzleView(s), applied: false };
    if (s.status !== 'ACTIVE') throw conflict();
    const d = documentOf(s),
      now = new Date();
    if (cancel)
      return {
        session: puzzleView(
          await tx.puzzleSession.update({
            where: { id },
            data: { status, canceledAt: now, version: { increment: 1 } },
          }),
        ),
        applied: true,
      };
    const entries = d.boards.flatMap((b) => b.entries);
    if (entries.length !== s.placedCount || entries.some((e) => !e.solved)) throw conflict();
    const game = await tx.completedGame.create({
      data: {
        ownerId,
        completionId: id,
        wordListId: null,
        listTitle: s.listTitle,
        gameType: s.gameType,
        completedAt: now,
        requestHash: 'server-authoritative',
        items: d.boards.flatMap((b, board) =>
          b.entries.map((e) => ({
            wordId: null,
            sourceWordId: e.id,
            originListId: s.scopeKey.slice(5),
            english: e.english,
            meanings: e.meanings,
            outcome: 'correct',
            attempts: e.attempts,
            board,
            selectedCount: s.selectedCount,
            placedCount: s.placedCount,
            puzzleSessionId: s.id,
            masteryEligible: false,
            masteryApplied: false,
          })),
        ),
      },
    });
    return {
      session: puzzleView(
        await tx.puzzleSession.update({
          where: { id },
          data: {
            status,
            completedAt: now,
            completedGameId: game.id,
            version: { increment: 1 },
          },
        }),
      ),
      applied: true,
    };
  });
}
