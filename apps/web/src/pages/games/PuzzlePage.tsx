import { useEffect, useId, useRef, useState } from 'react';
import { Link, useNavigate, useParams, useSearchParams } from 'react-router';
import { Button } from '../../components/ui/Button';
import { ButtonLink } from '../../components/ui/ButtonLink';
import { sheetClass, sheetSectionClass } from '../../components/ui/Card';
import { SelectField } from '../../components/ui/fields';
import { headwordClass } from '../../components/ui/Headword';
import {
  AlertIcon,
  ArrowRightIcon,
  CheckIcon,
  HistoryIcon,
  InfoIcon,
  PlusIcon,
  RefreshIcon,
} from '../../components/ui/icons';
import { ModeArt } from '../../components/ui/ModeArt';
import { ModeIcon } from '../../components/ui/modeIcons';
import { PageHeader } from '../../components/ui/PageHeader';
import { ProgressBar } from '../../components/ui/Progress';
import { useLists } from '../../lib/lists';
import { apiErrorMessage } from '../../lib/apiErrors';
import { cn } from '../../lib/cn';
import { focusMainHeading, useFocusOnChange } from '../../lib/focus';
import {
  puzzleNames,
  usePuzzle,
  usePuzzleCommand,
  usePuzzleSetup,
  useActivePuzzles,
  useStartPuzzle,
  type OmittedWord,
  type PuzzleSession,
  type PuzzleType,
  type PuzzleMove,
} from '../../lib/puzzles';
import type { StudyPercentage } from '../../lib/study';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { ErrorPanel, LoadingNotice } from '../study/parts';
import { PercentageChoices } from '../study/PracticeChoices';
import { gameGuides } from './gameGuides';
import { WordSearchBoard } from './WordSearchBoard';
import { CrosswordBoard } from './CrosswordBoard';

const omissionReasons: Record<OmittedWord['reason'], string> = {
  unsupported: 'Harf ve boşluk dışında karakter içeriyor.',
  length: 'Toplam harf sayısı 2–18 aralığında değil.',
  ambiguous: 'Boşluklar kaldırılınca başka bir kayıtla aynı oluyor.',
  layout: 'Kaliteli, bağlantılı bir bulmacaya yerleştirilemedi; bu turda sorulmuyor.',
};

function Omissions({ words }: { words: OmittedWord[] }) {
  return words.length ? (
    <details className="group rounded-card border border-line bg-surface-raised">
      <summary className="flex min-h-11 cursor-pointer items-center gap-2 rounded-card px-4 py-2.5 text-body font-semibold text-fg">
        <ArrowRightIcon
          aria-hidden="true"
          className="shrink-0 text-accent transition-transform duration-(--duration-fast) ease-standard group-open:rotate-90"
        />
        Dahil edilmeyen {words.length} kayıt
      </summary>
      <ul className="grid gap-2 border-t border-line px-4 py-3 text-small text-fg">
        {words.map((w) => (
          <li key={w.id} className="wrap-anywhere">
            {w.english ? (
              <>
                <span lang="en" className={cn(headwordClass, 'text-body')}>
                  {w.english}
                </span>{' '}
                —{' '}
              </>
            ) : null}
            {w.meanings.join(' / ')}:{' '}
            <span className="text-fg-muted">{omissionReasons[w.reason]}</span>
          </li>
        ))}
      </ul>
    </details>
  ) : null;
}

/** The phrase rules, shown on request: they matter when a word is left out. */
function PhraseRules({ type }: { type: PuzzleType }) {
  return (
    <details className="group text-small text-fg">
      <summary className="inline-flex min-h-11 cursor-pointer items-center gap-2 font-semibold text-accent">
        <ArrowRightIcon
          aria-hidden="true"
          className="shrink-0 transition-transform duration-(--duration-fast) ease-standard group-open:rotate-90"
        />
        Hangi ifadeler kullanılır?
      </summary>
      <div className="grid gap-2 pb-1 pl-6">
        <p>
          Yalnızca İngilizce A–Z harfleri ve boşluklardan oluşan, toplam 2–18 harfli ifadeler
          kullanılır. Kısaltmalar da uygundur. İfadelerde boşluklar hücrelere yazılmaz. Noktalama ve
          simgeler kaldırılarak anlam değiştirilmez; belirsiz aynı harf dizileri dışarıda bırakılır.
        </p>
        {type === 'crossword' ? (
          <p>
            Her tahta en az 3 kesişen kelime içerir. Yerleşim mümkün değilse farklı bir yüzde veya
            liste seç. Yerleşmeyen kelimeler ayrıca belirtilir.
          </p>
        ) : null}
      </div>
    </details>
  );
}

export function PuzzleSetupPage({ type }: { type: PuzzleType }) {
  const [params, setParams] = useSearchParams();
  const listId = params.get('list') ?? '';
  const lists = useLists(),
    resumable = useActivePuzzles(type),
    setup = usePuzzleSetup(listId, type),
    start = useStartPuzzle(listId, type);
  const [percentage, setPercentage] = useState<StudyPercentage>(25);
  const navigate = useNavigate(),
    busy = useRef(false);
  const id = useId();
  useDocumentTitle(puzzleNames[type]);
  const listQuery = listId ? `?list=${encodeURIComponent(listId)}` : '';
  return (
    <div data-mode={type} className="grid max-w-4xl gap-7">
      <PageHeader
        mode={type}
        back={{ to: `/games${listQuery}`, label: 'Alıştırmalara dön' }}
        eyebrow="Alıştırmalar"
        title={puzzleNames[type]}
        description={gameGuides[type].description}
      />
      {!listId ? (
        resumable.isPending ? (
          <LoadingNotice>Yarım kalan oyunların yükleniyor…</LoadingNotice>
        ) : resumable.isError ? (
          <ErrorPanel error={resumable.error} retry={() => void resumable.refetch()} />
        ) : resumable.data.length ? (
          <section
            aria-labelledby={`${id}-resume`}
            className={cn(sheetClass, 'grid gap-3 border-l-4 border-l-(--mode-deep) p-5 sm:p-6')}
          >
            <h2 id={`${id}-resume`} className="text-h3 text-fg">
              Yarım kalan oyunların
            </h2>
            <p className="text-body text-fg">
              Listeni silmiş olsan da kayıtlı oyuna buradan devam edebilirsin.
            </p>
            <ul className="grid gap-2">
              {resumable.data.map((s) => (
                <li key={s.id}>
                  <Link
                    to={`/games/puzzles/${s.id}`}
                    className="inline-flex min-h-11 items-center gap-2 font-semibold"
                  >
                    {s.listTitle} · {s.placedCount} kelime · Devam Et
                  </Link>
                </li>
              ))}
            </ul>
          </section>
        ) : null
      ) : null}
      <div className={cn(sheetClass, 'grid divide-y divide-line overflow-hidden shadow-raised')}>
        {/* The puzzle's entry: how saving works, beside a miniature of the board. */}
        <div className="mode-art-stage grid items-center gap-4 px-5 py-6 sm:grid-cols-[minmax(0,1fr)_14rem] sm:px-7">
          <div className="grid min-w-0 gap-2">
            <h2 className="text-h2 text-fg">Bulmacayı hazırla</h2>
            <p className="text-body text-fg">
              İlerlemen sunucuda saklanır; sonra veya başka cihazda devam edebilirsin. Bu oyun
              tekrar önceliğini ve öğrenme katkısını değiştirmez.
            </p>
          </div>
          <div aria-hidden="true" className="hidden h-32 sm:block">
            <ModeArt mode={type} />
          </div>
        </div>
        <div className={sheetSectionClass}>
          {lists.isPending ? (
            <LoadingNotice>Listelerin yükleniyor…</LoadingNotice>
          ) : lists.isError ? (
            <ErrorPanel error={lists.error} retry={() => void lists.refetch()} />
          ) : !lists.data.length ? (
            <div className="grid justify-items-start gap-3">
              <p className="text-body text-fg">
                Bulmaca için önce kelimelerini bir listeye eklemelisin.
              </p>
              <ButtonLink to="/lists/new" icon={<PlusIcon />}>
                Önce bir liste oluştur
              </ButtonLink>
            </div>
          ) : (
            <div className="max-w-md">
              <SelectField
                label="Kelime listesi"
                value={listId}
                onChange={(e) => setParams(e.target.value ? { list: e.target.value } : {})}
              >
                <option value="">Liste seç</option>
                {lists.data.map((list) => (
                  <option key={list.id} value={list.id}>
                    {list.title}
                  </option>
                ))}
              </SelectField>
            </div>
          )}
          <PhraseRules type={type} />
        </div>
        {listId ? (
          setup.isPending ? (
            <div className={sheetSectionClass}>
              <LoadingNotice>Uygun kelimeler yükleniyor…</LoadingNotice>
            </div>
          ) : setup.isError ? (
            <div className={sheetSectionClass}>
              <ErrorPanel error={setup.error} retry={() => void setup.refetch()} />
            </div>
          ) : setup.data.session ? (
            <div className={sheetSectionClass}>
              <Omissions words={setup.data.omitted} />
              <section
                aria-labelledby={`${id}-active`}
                className="grid gap-4 rounded-card border border-line border-l-4 border-l-(--mode-deep) bg-(--mode-tint) p-4 sm:p-5"
              >
                <div className="grid gap-1">
                  <h3 id={`${id}-active`} className="text-h4 text-fg">
                    Yarım kalan bir oyunun var
                  </h3>
                  <p className="text-body text-fg">
                    {setup.data.session.listTitle} · {setup.data.session.placedCount} kelime · %
                    {setup.data.session.percentage}
                  </p>
                </div>
                <div className="flex flex-wrap gap-3">
                  <ButtonLink
                    to={`/games/puzzles/${setup.data.session.id}`}
                    variant="mode"
                    icon={<ModeIcon mode={type} />}
                  >
                    Devam Et
                  </ButtonLink>
                  <CancelPuzzle session={setup.data.session} />
                </div>
              </section>
            </div>
          ) : !setup.data.eligibleCount ? (
            <div className={sheetSectionClass}>
              <Omissions words={setup.data.omitted} />
              <p role="status" className="text-body text-fg">
                Bu listede uygun ifade bulunamadı. Listene uygun kelimeler ekle veya başka bir liste
                seç.
              </p>
            </div>
          ) : (
            <form
              className="grid divide-y divide-line"
              aria-describedby={start.error ? `${id}-error` : undefined}
              onSubmit={(e) => {
                e.preventDefault();
                if (busy.current) return;
                busy.current = true;
                void start
                  .mutateAsync(percentage)
                  .then((s) => navigate(`/games/puzzles/${s.id}`))
                  .catch(() => {})
                  .finally(() => {
                    busy.current = false;
                  });
              }}
            >
              <div className={sheetSectionClass}>
                <PercentageChoices
                  count={setup.data.eligibleCount}
                  value={percentage}
                  change={setPercentage}
                  unit="kelime"
                  summary={(words) => `Bu bulmaca için ${words} kelime seçilecek.`}
                />
                <p className="text-small text-fg-muted">
                  Yüzde, uygun {setup.data.eligibleCount} kayıt üzerinden yukarı yuvarlanır. Büyük
                  seçimler birden fazla tahtaya bölünür.
                </p>
                <Omissions words={setup.data.omitted} />
              </div>
              <div className={cn(sheetSectionClass, 'bg-surface/70')}>
                {start.error ? (
                  <p
                    id={`${id}-error`}
                    role="alert"
                    className="flex items-start gap-2.5 text-body text-fg"
                  >
                    <AlertIcon className="mt-0.5 shrink-0 text-[1.2rem] text-danger" />
                    <span className="min-w-0">{apiErrorMessage(start.error)}</span>
                  </p>
                ) : null}
                <Button
                  type="submit"
                  size="lg"
                  variant="mode"
                  loading={start.isPending}
                  icon={<ModeIcon mode={type} />}
                  className="justify-self-start"
                >
                  Oyuna başla
                </Button>
              </div>
            </form>
          )
        ) : null}
      </div>
    </div>
  );
}

function CancelPuzzle({ session }: { session: PuzzleSession }) {
  const [trigger, setTrigger] = useState<HTMLElement | null>(null);
  return (
    <>
      <Button
        variant="secondary"
        aria-haspopup="dialog"
        onClick={(e) => setTrigger(e.currentTarget)}
      >
        İptal Et
      </Button>
      {trigger ? (
        <CancelDialog session={session} trigger={trigger} close={() => setTrigger(null)} />
      ) : null}
    </>
  );
}

function CancelDialog({
  session,
  trigger,
  close,
}: {
  session: PuzzleSession;
  trigger: HTMLElement;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null),
    heading = useId(),
    description = useId(),
    command = usePuzzleCommand(session.id),
    busy = useRef(false);
  // After a confirmed cancellation the trigger leaves with the game, so focus
  // starts again from the page title instead of being dropped to the body.
  const canceled = useRef(false);
  useEffect(() => {
    ref.current?.showModal();
    ref.current?.querySelector<HTMLButtonElement>('[data-keep]')?.focus();
  }, []);
  return (
    <dialog
      ref={ref}
      className="list-dialog"
      data-surface="light"
      aria-labelledby={heading}
      aria-describedby={description}
      onCancel={(e) => {
        if (command.isPending) e.preventDefault();
      }}
      onClose={() => {
        if (canceled.current) focusMainHeading();
        else if (trigger.isConnected) trigger.focus();
        close();
      }}
    >
      <div className="grid gap-5 p-5 sm:p-7">
        <div className="flex items-center gap-3">
          <span
            aria-hidden="true"
            className="grid size-10 shrink-0 place-items-center rounded-full bg-danger-soft text-[1.25rem] text-danger"
          >
            <AlertIcon />
          </span>
          <h2 id={heading} className="text-h3 text-fg">
            Oyunu iptal etmek istiyor musun?
          </h2>
        </div>
        <p id={description} className="text-body text-fg">
          Bu oyun tamamlanmış sayılmaz ve geçmişine eklenmez. Daha sonra yeni bir oyun
          başlatabilirsin.
        </p>
        {command.error ? (
          <p role="alert" className="text-body text-danger">
            {apiErrorMessage(command.error)}
          </p>
        ) : null}
        <div className="flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:justify-end">
          <Button
            data-keep
            variant="secondary"
            disabled={command.isPending}
            onClick={() => ref.current?.close()}
          >
            Devam Et
          </Button>
          <Button
            variant="danger"
            loading={command.isPending}
            onClick={() => {
              if (busy.current) return;
              busy.current = true;
              void command
                .mutateAsync({ action: 'cancel' })
                .then(() => {
                  canceled.current = true;
                  ref.current?.close();
                  close();
                  focusMainHeading();
                })
                .catch(() => {})
                .finally(() => {
                  busy.current = false;
                });
            }}
          >
            İptali onayla
          </Button>
        </div>
      </div>
    </dialog>
  );
}

export function PuzzleSessionPage() {
  const { sessionId = '' } = useParams();
  const query = usePuzzle(sessionId);
  useDocumentTitle(query.data ? puzzleNames[query.data.gameType] : 'Oyun');
  const session = query.isError ? undefined : query.data;
  const unplaced = session ? session.selectedCount - session.placedCount : 0;
  // The header stays mounted while the game loads, so the focused title is kept.
  return (
    <div data-mode={session?.gameType} className="mx-auto grid w-full max-w-6xl gap-6">
      <PageHeader
        variant="session"
        mode={session?.gameType}
        back={{ to: '/games', label: 'Alıştırmalara dön' }}
        actions={
          session ? (
            <Button
              variant="ghost"
              size="sm"
              icon={<RefreshIcon />}
              onClick={() => void query.refetch()}
            >
              Güncel durumu yükle
            </Button>
          ) : null
        }
        eyebrow="Alıştırmalar"
        title={session ? puzzleNames[session.gameType] : 'Bulmaca'}
        description={
          session ? (
            <>
              <p>
                <strong className="font-semibold text-fg">{session.listTitle}</strong> · %
                {session.percentage}
              </p>
              <p className="text-small">
                {session.selectedCount} kayıt seçildi; {session.placedCount} kelime{' '}
                {session.boards.length} tahtaya yerleşti.
                {unplaced ? ` ${unplaced} seçili kayıt yerleşmedi.` : ''}
              </p>
            </>
          ) : undefined
        }
      />
      {query.isPending ? (
        <LoadingNotice rows={3}>Oyunun yükleniyor…</LoadingNotice>
      ) : query.isError ? (
        <ErrorPanel error={query.error} retry={() => void query.refetch()} />
      ) : (
        <PuzzlePlay key={query.data.id} session={query.data} />
      )}
    </div>
  );
}

function PuzzlePlay({ session }: { session: PuzzleSession }) {
  const [boardIndex, setBoardIndex] = useState(
    Math.max(
      0,
      session.boards.findIndex((b) => b.entries.some((e) => !e.solved)),
    ),
  );
  const command = usePuzzleCommand(session.id),
    busy = useRef(false);
  const [feedback, setFeedback] = useState<{ board: number; correct: boolean } | null>(null),
    [last, setLast] = useState<PuzzleMove | { action: 'complete' } | null>(null);
  const board = session.boards[boardIndex]!;
  const [draftBusy, setDraftBusy] = useState(false);
  const found = session.boards.flatMap((b) => b.entries).filter((e) => e.solved).length;
  const allFound = found === session.placedCount;
  async function send(input: PuzzleMove | { action: 'complete' }) {
    if (busy.current) return;
    busy.current = true;
    setLast(input);
    try {
      const r = await command.mutateAsync(input);
      if (input.action === 'select')
        setFeedback({ board: input.board, correct: Boolean(r.correct) });
    } catch {
      /* Explicit same-request retry below. */
    } finally {
      busy.current = false;
    }
  }
  const newGame = `/games/${session.gameType}${session.listId ? `?list=${session.listId}` : ''}`;
  if (session.status !== 'ACTIVE')
    return <PuzzleEnded session={session} found={found} newGame={newGame} />;
  return (
    <div className="grid min-w-0 gap-5">
      <Omissions words={session.omitted} />
      <div className="grid gap-4 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
        <div className="grid gap-2">
          <p role="status" className="text-small font-semibold text-fg tabular-nums">
            {found}/{session.placedCount} kelime bulundu
          </p>
          <ProgressBar value={found} max={session.placedCount} tone="mode" />
        </div>
        {session.boards.length > 1 ? (
          <div className="sm:w-60">
            <SelectField
              label="Tahta"
              value={boardIndex}
              disabled={command.isPending || draftBusy}
              onChange={(e) => setBoardIndex(Number(e.target.value))}
            >
              {session.boards.map((b, i) => (
                <option key={i} value={i}>
                  {i + 1}/{session.boards.length} · {b.entries.filter((e) => e.solved).length}/
                  {b.entries.length} bulundu
                </option>
              ))}
            </SelectField>
          </div>
        ) : null}
      </div>
      {command.error ? (
        <div
          role="alert"
          className="grid justify-items-start gap-3 rounded-card border border-danger/35 bg-danger-soft p-4"
        >
          <p className="flex items-start gap-2.5 text-body text-fg">
            <AlertIcon className="mt-0.5 shrink-0 text-[1.2rem] text-danger" />
            <span className="min-w-0 wrap-anywhere">{apiErrorMessage(command.error)}</span>
          </p>
          <Button
            onClick={() => {
              if (last) void send(last);
            }}
          >
            Aynı isteği tekrar dene
          </Button>
          <p className="text-small text-fg">
            Bağlantı hatasında aynı isteği tekrar gönderebilir veya güncel durumu yükleyebilirsin.
          </p>
        </div>
      ) : null}
      <div className={cn(sheetClass, 'min-w-0 p-4 shadow-raised sm:p-7')}>
        {session.gameType === 'word-search' ? (
          <WordSearchBoard
            key={boardIndex}
            board={board}
            busy={command.isPending}
            result={feedback?.board === boardIndex ? feedback : null}
            select={(start, end) =>
              void send({
                action: 'select',
                start,
                end,
                version: session.version,
                commandId: crypto.randomUUID(),
                board: boardIndex,
              })
            }
          />
        ) : (
          <CrosswordBoard
            key={boardIndex}
            session={session}
            boardIndex={boardIndex}
            onPendingChange={setDraftBusy}
          />
        )}
      </div>
      {board.entries.every((e) => e.solved) && !allFound ? (
        <Button
          className="justify-self-start"
          onClick={() => {
            setFeedback(null);
            setBoardIndex(session.boards.findIndex((b) => b.entries.some((e) => !e.solved)));
          }}
        >
          Sıradaki tahtaya geç
        </Button>
      ) : null}
      <div className="flex flex-wrap items-center gap-3 border-t border-line pt-5">
        <Button
          size="lg"
          variant="mode"
          disabled={!allFound}
          loading={command.isPending}
          icon={<CheckIcon strokeWidth={2.5} />}
          onClick={() => void send({ action: 'complete' })}
        >
          Oyunu tamamla
        </Button>
        <CancelPuzzle session={session} />
        <p className="flex items-start gap-2 text-small text-fg sm:basis-full">
          <InfoIcon className="mt-0.5 shrink-0 text-[1.05rem] text-fg-muted" />
          {allFound
            ? 'Tüm kelimeler tamam. Oyunu tamamlayınca sonucun geçmişine eklenir.'
            : 'İlerlemen otomatik saklanır. Tamamlanınca geçmişine eklemek için oyunu tamamla.'}
        </p>
      </div>
    </div>
  );
}

/** Completed or canceled: the board is replaced, so focus moves to this heading. */
function PuzzleEnded({
  session,
  found,
  newGame,
}: {
  session: PuzzleSession;
  found: number;
  newGame: string;
}) {
  const heading = useFocusOnChange<HTMLHeadingElement>(session.status);
  const id = useId();
  if (session.status === 'CANCELED')
    return (
      <section
        aria-labelledby={`${id}-title`}
        className={cn(sheetClass, 'grid justify-items-start gap-4 p-5 sm:p-6')}
      >
        <h2 id={`${id}-title`} ref={heading} tabIndex={-1} className="text-h3 text-fg">
          Oyun iptal edildi
        </h2>
        <p role="status" className="text-body text-fg">
          Oyun iptal edildi. Geçmişine eklenmedi.
        </p>
        <ButtonLink to={newGame} variant="mode" icon={<ModeIcon mode={session.gameType} />}>
          Yeni oyun seç
        </ButtonLink>
      </section>
    );
  const entries = session.boards.flatMap((b) => b.entries);
  return (
    <section aria-labelledby={`${id}-title`} className="grid gap-6">
      <div className={cn(sheetClass, 'grid overflow-hidden shadow-raised')}>
        <div className="mode-art-stage flex flex-wrap items-center gap-x-5 gap-y-4 border-b border-(--mode-soft) p-5 sm:p-8">
          {/* A one-time settle and ring (reduced motion: static). Decorative. */}
          <span
            aria-hidden="true"
            className="celebrate grid size-16 shrink-0 place-items-center rounded-full bg-success text-[1.9rem] text-white shadow-[0_0_0_6px_rgb(255_255_255/0.85),0_16px_30px_-12px_rgb(18_107_66/0.7)]"
          >
            <CheckIcon strokeWidth={3} />
          </span>
          <div className="grid min-w-0 flex-1 basis-64 gap-1">
            <h2 id={`${id}-title`} ref={heading} tabIndex={-1} className="text-h1 text-fg">
              Oyun tamamlandı
            </h2>
            <p role="status" className="text-body text-fg">
              {found} kelimeyi buldun. Sonucun kaydedildi; tekrar önceliğin değişmedi.
            </p>
          </div>
        </div>
        <div className={cn(sheetSectionClass, 'bg-surface/70')}>
          <div className="flex flex-wrap gap-3">
            <ButtonLink to="/history" variant="mode" icon={<HistoryIcon />}>
              Kaydedilmiş sonucunu gör
            </ButtonLink>
            <ButtonLink
              to={newGame}
              variant="secondary"
              icon={<ModeIcon mode={session.gameType} />}
            >
              Yeni oyun seç
            </ButtonLink>
          </div>
        </div>
      </div>
      <section aria-labelledby={`${id}-words`} className="grid gap-3">
        <h3 id={`${id}-words`} className="text-h3 text-fg">
          Kelimelerin
        </h3>
        <ul className={cn(sheetClass, 'grid divide-y divide-line overflow-hidden')}>
          {entries.map((e) => (
            <li
              key={e.id}
              className="flex flex-wrap items-center justify-between gap-x-5 gap-y-1 px-5 py-3.5 sm:px-6"
            >
              <div className="grid min-w-0 gap-0.5 wrap-anywhere">
                <span lang="en" className={cn(headwordClass, 'text-h4 text-fg')}>
                  {e.english}
                </span>
                <span className="text-body text-fg">{e.meanings.join(' / ')}</span>
              </div>
              <span className="text-small font-semibold text-fg-muted tabular-nums">
                {e.attempts} deneme
              </span>
            </li>
          ))}
        </ul>
        {session.unplaced.length ? (
          <details className="group rounded-card border border-line bg-surface-raised">
            <summary className="flex min-h-11 cursor-pointer items-center gap-2 rounded-card px-4 py-2.5 text-body font-semibold text-fg">
              <ArrowRightIcon
                aria-hidden="true"
                className="shrink-0 text-accent transition-transform duration-(--duration-fast) ease-standard group-open:rotate-90"
              />
              Seçilip yerleşmeyen ifadeler
            </summary>
            <ul className="grid gap-2 border-t border-line px-4 py-3 text-small text-fg">
              {session.unplaced.map((w) => (
                <li key={w.id} className="wrap-anywhere">
                  <span lang="en" className={cn(headwordClass, 'text-body')}>
                    {w.english}
                  </span>{' '}
                  — {w.meanings.join(' / ')}
                </li>
              ))}
            </ul>
          </details>
        ) : null}
      </section>
    </section>
  );
}
