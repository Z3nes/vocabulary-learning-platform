import { useEffect, useRef, useState } from 'react';
import { Button, Spinner } from '../../components/ui/Button';
import { Feedback } from '../../components/ui/Feedback';
import { headwordClass } from '../../components/ui/Headword';
import { AlertIcon, CheckIcon, InfoIcon } from '../../components/ui/icons';
import { apiErrorMessage } from '../../lib/apiErrors';
import { ApiError } from '../../lib/api';
import { cn } from '../../lib/cn';
import {
  entryCells,
  usePuzzleCommand,
  type PuzzleEntry,
  type PuzzleMove,
  type PuzzleSession,
} from '../../lib/puzzles';
import './puzzles.css';

export function CrosswordBoard({
  session,
  boardIndex,
  onPendingChange,
}: {
  session: PuzzleSession;
  boardIndex: number;
  onPendingChange?: (pending: boolean) => void;
}) {
  const board = session.boards[boardIndex]!;
  const [local, setLocal] = useState({ version: session.version, values: board.draft });
  // Reconcile an authoritative version (including edits from another device).
  if (local.version !== session.version)
    setLocal({ version: session.version, values: board.draft });
  const [activeId, setActiveId] = useState(
    board.entries.find((e) => !e.solved)?.id ?? board.entries[0]!.id,
  );
  const [feedback, setFeedback] = useState<{ entryId: string; correct: boolean } | null>(null);
  const [last, setLast] = useState<PuzzleMove | null>(null);
  const command = usePuzzleCommand(session.id);
  const busy = useRef(false),
    grid = useRef<HTMLDivElement>(null);
  const requestedFocus = useRef<string | null>(null);
  const active = board.entries.find((e) => e.id === activeId) ?? board.entries[0]!;
  // A response belongs to the checked clue, even if another clue was selected
  // while the request was in flight.
  const verdict = feedback?.entryId === active.id ? feedback : null;
  const path = entryCells(active, board.cols);
  const solved = new Set(
    board.entries.filter((e) => e.solved).flatMap((e) => entryCells(e, board.cols)),
  );
  const dirty = local.values.some((v, i) => v !== board.draft[i]);
  const editable = session.status === 'ACTIVE' && !command.isPending && !command.isError;
  // A conflict reloads authoritative state. Once its revision arrives, retire
  // the rejected command so new edits can autosave with the current revision.
  const resetCommand = command.reset;
  useEffect(() => {
    if (
      command.error instanceof ApiError &&
      command.error.status === 409 &&
      last &&
      session.version !== last.version
    ) {
      resetCommand();
    }
  }, [command.error, last, session.version, resetCommand]);
  useEffect(() => {
    onPendingChange?.(dirty || command.isPending);
  }, [dirty, command.isPending, onPendingChange]);
  useEffect(() => {
    if (!dirty && !command.isPending) return;
    const warn = (e: BeforeUnloadEvent) => {
      e.preventDefault();
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty, command.isPending]);
  async function send(input: PuzzleMove) {
    if (busy.current) return;
    busy.current = true;
    setLast(input);
    try {
      const result = await command.mutateAsync(input);
      if (input.action === 'check')
        setFeedback({ entryId: input.entryId, correct: Boolean(result.correct) });
    } catch {
      /* The same command can be retried below. */
    } finally {
      busy.current = false;
    }
  }
  useEffect(() => {
    if (!dirty || command.isPending || command.isError || session.status !== 'ACTIVE') return;
    const timer = window.setTimeout(() => {
      void send({
        action: 'draft',
        commandId: crypto.randomUUID(),
        version: session.version,
        board: boardIndex,
        values: local.values,
      });
    }, 400);
    return () => window.clearTimeout(timer);
    // send only uses this render's values; retries retain the exact request identity.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [
    dirty,
    local.values,
    session.version,
    session.status,
    boardIndex,
    command.isPending,
    command.isError,
  ]);
  function focusCell(index: number, entryId?: string) {
    requestedFocus.current = entryId ?? null;
    grid.current?.querySelector<HTMLInputElement>(`[data-cell="${index}"]`)?.focus();
  }
  function activate(e: PuzzleEntry) {
    setActiveId(e.id);
    focusCell(
      entryCells(e, board.cols).find((i) => !solved.has(i)) ?? entryCells(e, board.cols)[0]!,
      e.id,
    );
  }
  function edit(index: number, value: string) {
    if (!editable || solved.has(index)) return;
    const letter = value.toUpperCase();
    if (!/^[A-Z]?$/.test(letter)) return;
    const values = [...local.values];
    values[index] = letter;
    setLocal({ version: session.version, values });
    setFeedback(null);
    if (letter) {
      const next = path.slice(path.indexOf(index) + 1).find((i) => !solved.has(i));
      if (next !== undefined) focusCell(next);
    }
  }
  const saveText = command.isPending
    ? 'Kaydediliyor…'
    : dirty
      ? 'Taslak henüz kaydedilmedi. Kaydı bekle.'
      : 'Taslağın kaydedildi.';
  return (
    <section
      className="grid min-w-0 gap-5"
      onBlur={(e) => {
        if (
          !e.currentTarget.contains(e.relatedTarget) &&
          dirty &&
          !command.isPending &&
          !command.isError
        )
          void send({
            action: 'draft',
            commandId: crypto.randomUUID(),
            version: session.version,
            board: boardIndex,
            values: local.values,
          });
      }}
    >
      <p id="crossword-help" className="flex max-w-prose items-start gap-2 text-small text-fg">
        <InfoIcon className="mt-0.5 shrink-0 text-[1.05rem] text-fg-muted" />
        Türkçe ipucunu seç ve harfleri yaz. Oklarla gez, Backspace ile sil. Kesişimde yönü
        değiştirmek için hücreye yeniden dokun veya ipucunu seç. Taslağın otomatik kaydedilir; her
        kelimeyi ayrıca kontrol et.
      </p>
      {/*
       * Same rule as Kelime Avı: the board keeps its natural width and the clue
       * lists sit beside it only while both fit, otherwise they wrap below.
       * Text in the board column ([contain:inline-size]) wraps to the board's
       * width instead of widening the column.
       */}
      <div className="flex min-w-0 flex-wrap items-start gap-x-8 gap-y-6">
        <div className="grid max-w-full min-w-[min(100%,20rem)] flex-[0_1_auto] gap-4">
          <p
            role="status"
            className="flex min-h-6 items-center gap-2 text-small font-medium text-fg [contain:inline-size]"
          >
            {command.isPending ? (
              <span className="text-accent">
                <Spinner />
              </span>
            ) : dirty ? (
              <span aria-hidden="true" className="size-2.5 shrink-0 rounded-full bg-on-highlight" />
            ) : (
              <CheckIcon strokeWidth={2.5} className="shrink-0 text-[1.05rem] text-success" />
            )}
            {/* The invisible longest message keeps the height, so typing never moves the board. */}
            <span
              data-sizer="Taslak henüz kaydedilmedi. Kaydı bekle."
              className="grid min-w-0 flex-1 after:invisible after:col-start-1 after:row-start-1 after:content-[attr(data-sizer)]"
            >
              <span className="col-start-1 row-start-1 self-center">{saveText}</span>
            </span>
          </p>
          {command.error ? (
            <div
              role="alert"
              className="grid justify-items-start gap-3 rounded-card border border-danger/35 bg-danger-soft p-4 [contain:inline-size]"
            >
              <p className="flex items-start gap-2.5 text-body text-fg">
                <AlertIcon className="mt-0.5 shrink-0 text-[1.2rem] text-danger" />
                <span className="min-w-0 wrap-anywhere">{apiErrorMessage(command.error)}</span>
              </p>
              <Button
                variant="secondary"
                onClick={() => {
                  if (last) void send(last);
                }}
              >
                Aynı isteği tekrar dene
              </Button>
              <p className="text-small text-fg">
                Başka cihazda değişiklik olduysa güncel taslak yüklenir. Bağlantı hatasında sayfadan
                ayrılmadan önce tekrar dene.
              </p>
            </div>
          ) : null}
          <div
            className="puzzle-scroll"
            role="region"
            aria-label="Bulmaca tahtası; dar ekranda yatay kaydırabilirsin"
            tabIndex={0}
          >
            <div
              ref={grid}
              role="group"
              aria-label="Çapraz Bulmaca hücreleri"
              aria-describedby="crossword-help"
              className="puzzle-grid"
              style={{ gridTemplateColumns: `repeat(${board.cols}, 2.75rem)` }}
            >
              {board.grid.map((cell, i) => {
                if (cell === null)
                  return <span key={i} className="puzzle-block" aria-hidden="true" />;
                const starting = board.entries.find((e) => entryCells(e, board.cols)[0] === i);
                const associated = board.entries.filter((e) =>
                  entryCells(e, board.cols).includes(i),
                );
                return (
                  <span
                    key={i}
                    className={cn(
                      'puzzle-cell crossword-cell',
                      path.includes(i) && 'puzzle-active',
                      solved.has(i) && 'puzzle-found',
                    )}
                  >
                    <span className="puzzle-number" aria-hidden="true">
                      {starting?.number}
                    </span>
                    <input
                      data-cell={i}
                      value={local.values[i] ?? ''}
                      maxLength={1}
                      readOnly={!editable || solved.has(i)}
                      tabIndex={path.find((n) => !solved.has(n)) === i ? 0 : -1}
                      aria-label={`Satır ${Math.floor(i / board.cols) + 1}, sütun ${(i % board.cols) + 1}${starting ? `, ${starting.number} numara` : ''}${solved.has(i) ? ', doğrulandı' : ''}`}
                      aria-describedby={`clue-${active.id}`}
                      autoComplete="off"
                      autoCorrect="off"
                      autoCapitalize="characters"
                      spellCheck={false}
                      inputMode="text"
                      lang="en"
                      onFocus={(e) => {
                        e.currentTarget.select();
                        if (
                          requestedFocus.current &&
                          associated.some((a) => a.id === requestedFocus.current)
                        )
                          setActiveId(requestedFocus.current);
                        else if (!path.includes(i)) setActiveId(associated[0]!.id);
                        requestedFocus.current = null;
                      }}
                      onClick={() => {
                        if (associated.length > 1 && path.includes(i))
                          setActiveId(associated.find((e) => e.id !== activeId)!.id);
                      }}
                      onChange={(e) => edit(i, e.target.value)}
                      onKeyDown={(e) => {
                        if (e.nativeEvent.isComposing) return;
                        if (e.key === 'Backspace' && editable && !solved.has(i)) {
                          e.preventDefault();
                          if (local.values[i]) edit(i, '');
                          else {
                            const previous = path
                              .slice(0, path.indexOf(i))
                              .reverse()
                              .find((n) => !solved.has(n));
                            if (previous !== undefined) {
                              edit(previous, '');
                              focusCell(previous);
                            }
                          }
                          return;
                        }
                        const delta = {
                          ArrowLeft: -1,
                          ArrowRight: 1,
                          ArrowUp: -board.cols,
                          ArrowDown: board.cols,
                        }[e.key];
                        if (delta === undefined) return;
                        e.preventDefault();
                        const direction = Math.abs(delta) === 1 ? 0 : 1;
                        const oriented = associated.find((a) => a.dr === direction);
                        if (oriented) setActiveId(oriented.id);
                        const next = i + delta;
                        if (
                          next >= 0 &&
                          next < board.grid.length &&
                          board.grid[next] !== null &&
                          (Math.abs(delta) !== 1 ||
                            Math.floor(next / board.cols) === Math.floor(i / board.cols))
                        )
                          focusCell(next, oriented?.id);
                      }}
                    />
                  </span>
                );
              })}
            </div>
          </div>
          <div className="grid gap-3 rounded-card border border-(--mode-soft) bg-(--mode-tint) p-4 shadow-card [contain:inline-size]">
            <p className="border-l-4 border-l-(--mode-deep) pl-3 text-body-lg text-fg wrap-anywhere">
              Etkin ipucu: {active.number} {active.dr === 0 ? 'Yatay' : 'Dikey'} —{' '}
              {active.meanings.join(' / ')} ({active.segments.join(' + ')} harf)
            </p>
            <div className="flex flex-wrap items-center gap-3">
              <Button
                variant="mode"
                disabled={
                  dirty ||
                  command.isPending ||
                  command.isError ||
                  active.solved ||
                  session.status !== 'ACTIVE'
                }
                onClick={() =>
                  void send({
                    action: 'check',
                    commandId: crypto.randomUUID(),
                    version: session.version,
                    board: boardIndex,
                    entryId: active.id,
                  })
                }
              >
                Kelimeyi kontrol et
              </Button>
              {active.solved && !verdict ? (
                <p className="text-small text-fg-muted">Bu kelime tamamlandı.</p>
              ) : null}
            </div>
            <div role="status">
              {verdict ? (
                <Feedback tone={verdict.correct ? 'success' : 'highlight'}>
                  <p>
                    {verdict.correct
                      ? 'Doğru. Kelime tamamlandı.'
                      : 'Henüz doğru değil. Harfleri değiştirip tekrar kontrol edebilirsin.'}
                  </p>
                </Feedback>
              ) : null}
            </div>
          </div>
        </div>
        {/* Two clue columns once the lists have the room, e.g. below a wide board. */}
        <div className="@container min-w-[min(100%,16rem)] flex-[1_1_16rem]">
          <div className="grid content-start gap-5 @xl:grid-cols-2">
            {[0, 1].map((dr) => (
              <section key={dr} className="grid content-start gap-2">
                <h2 className="text-h4 text-fg">{dr === 0 ? 'Yatay' : 'Dikey'}</h2>
                <ol className="grid gap-2">
                  {board.entries
                    .filter((e) => e.dr === dr)
                    .sort((a, b) => a.number - b.number)
                    .map((e) => (
                      <li key={e.id} id={`clue-${e.id}`}>
                        <button
                          type="button"
                          aria-pressed={activeId === e.id}
                          className={cn(
                            'w-full rounded-card border px-3.5 py-2.5 text-left text-body text-fg wrap-anywhere',
                            'transition-[border-color,background-color] duration-(--duration-fast) ease-standard',
                            'hover:border-(--mode-line) aria-pressed:border-(--mode-deep) aria-pressed:bg-(--mode-tint) aria-pressed:shadow-[inset_0_0_0_1px_var(--mode-deep)]',
                            e.solved && activeId !== e.id
                              ? 'border-success/40 bg-success-soft'
                              : 'border-line bg-surface-raised',
                          )}
                          onClick={() => activate(e)}
                        >
                          <span className="font-bold">{e.number}.</span> {e.meanings.join(' / ')}{' '}
                          <span className="text-small opacity-85">
                            ({e.segments.join(' + ')} harf)
                          </span>
                          {e.solved ? (
                            <>
                              {' '}
                              · ✓ Doğru:{' '}
                              <span lang="en" className={headwordClass}>
                                {e.english}
                              </span>
                            </>
                          ) : (
                            ''
                          )}
                        </button>
                      </li>
                    ))}
                </ol>
              </section>
            ))}
          </div>
        </div>
      </div>
    </section>
  );
}
