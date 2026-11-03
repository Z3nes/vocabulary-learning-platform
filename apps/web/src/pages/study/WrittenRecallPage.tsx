import { useEffect, useId, useRef, useState, type ReactNode, type Ref } from 'react';
import { useNavigate, useParams } from 'react-router';
import { Button } from '../../components/ui/Button';
import { ButtonLink } from '../../components/ui/ButtonLink';
import { sheetClass, sheetSectionClass } from '../../components/ui/Card';
import { EmptyState } from '../../components/ui/EmptyState';
import { Feedback } from '../../components/ui/Feedback';
import { headwordClass } from '../../components/ui/Headword';
import {
  AlertIcon,
  CheckIcon,
  CrossIcon,
  EyeIcon,
  InfoIcon,
  PlusIcon,
} from '../../components/ui/icons';
import { ModeIcon, ModeTile, type Mode } from '../../components/ui/modeIcons';
import { PageHeader } from '../../components/ui/PageHeader';
import { ProgressBar } from '../../components/ui/Progress';
import { apiErrorMessage } from '../../lib/apiErrors';
import { cn } from '../../lib/cn';
import { focusMainHeading } from '../../lib/focus';
import { useList } from '../../lib/lists';
import {
  useActivePractice,
  usePractice,
  usePracticeCommand,
  useStartPractice,
  type PracticeCommand,
  type PracticeEvaluation,
  type PracticeSession,
  practiceNames,
  type PracticeType,
  mixedActivityNames,
  type PracticeQuestion,
} from '../../lib/practice';
import type { StudyPercentage } from '../../lib/study';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { AudioControls } from './AudioControls';
import { ErrorPanel, LoadingNotice } from './parts';
import { PercentageChoices } from './PracticeChoices';

const practiceModes: Record<PracticeType, Mode> = {
  'written-recall': 'written',
  listening: 'listening',
  mixed: 'mixed',
};

export function WrittenSetupPage({
  practiceType = 'written-recall',
}: {
  practiceType?: PracticeType;
}) {
  const { id = '' } = useParams();
  const list = useList(id);
  const active = useActivePractice(id, practiceType);
  const start = useStartPractice(id, practiceType);
  const navigate = useNavigate();
  const busy = useRef(false);
  const formId = useId();
  const [percentage, setPercentage] = useState<StudyPercentage>(25);
  useDocumentTitle(practiceNames[practiceType]);
  const mode = practiceModes[practiceType];
  const listPath = `/lists/${encodeURIComponent(id)}`;
  async function begin() {
    if (busy.current) return;
    busy.current = true;
    try {
      const session = await start.mutateAsync(percentage);
      await navigate(`/study/practice/${session.id}`);
    } catch {
      /* Mutation error is rendered below. */
    } finally {
      busy.current = false;
    }
  }
  return (
    <div data-mode={mode} className="grid max-w-4xl gap-7">
      <PageHeader
        mode={mode}
        art
        back={{ to: listPath, label: 'Listeye dön' }}
        eyebrow="Kelime Çalış"
        title={practiceNames[practiceType]}
        description={
          <p className="wrap-anywhere">
            {/* The list title joins the line once it is known (no stray separator before). */}
            {list.data ? (
              <>
                <strong className="text-fg">{list.data.title}</strong> ·{' '}
              </>
            ) : null}
            {practiceType === 'listening'
              ? 'İngilizce ifadeyi dinle ve duyduğun ifadeyi yaz. Türkçe anlamların tamamı gösterilir.'
              : 'Türkçe anlamlarından İngilizce karşılığını hatırla.'}
          </p>
        }
      />
      {list.isError || active.isError ? (
        <ErrorPanel
          error={list.error ?? active.error}
          retry={() => {
            void list.refetch();
            void active.refetch();
          }}
        />
      ) : list.isPending || active.isPending ? (
        <LoadingNotice rows={3}>Çalışman yükleniyor…</LoadingNotice>
      ) : active.data ? (
        <PracticeResume session={active.data} />
      ) : !list.data.wordCount ? (
        <EmptyState
          icon={<ModeIcon mode={mode} />}
          headingLevel="h2"
          title="Bu listede henüz kelime yok"
          description="Bu yöntemle çalışmak için listende en az bir kelime olmalı. Önce kelime ekle."
          actions={
            <ButtonLink to={listPath} icon={<PlusIcon />}>
              Listeye dön ve kelime ekle
            </ButtonLink>
          }
        />
      ) : (
        <form
          className={cn(sheetClass, 'grid divide-y divide-line overflow-hidden shadow-raised')}
          aria-describedby={start.error ? `${formId}-error` : undefined}
          onSubmit={(e) => {
            e.preventDefault();
            void begin();
          }}
        >
          <div className={sheetSectionClass}>
            <PercentageChoices
              count={list.data.wordCount}
              value={percentage}
              change={setPercentage}
            />
          </div>
          <div className={cn(sheetSectionClass, 'bg-surface/70')}>
            <p className="flex items-start gap-2 text-small text-fg-muted">
              <InfoIcon className="mt-0.5 shrink-0 text-[1.05rem]" />
              Her soruda tek cevap verebilirsin. Sonuçlar ve uygun öğrenme katkıları yalnızca
              çalışmayı tamamladığında kaydedilir. Yanlış cevaplar tekrar önceliğini değiştirmez.
            </p>
            {start.error ? (
              <p id={`${formId}-error`} role="alert" className="text-body text-danger">
                {apiErrorMessage(start.error)}
              </p>
            ) : null}
            <Button
              type="submit"
              size="lg"
              variant="mode"
              loading={start.isPending}
              icon={<ModeIcon mode={mode} />}
              className="justify-self-start"
            >
              Başla
            </Button>
          </div>
        </form>
      )}
    </div>
  );
}

/** The scope's unfinished practice session: continue it, or cancel it after confirmation. */
export function PracticeResume({ session }: { session: PracticeSession }) {
  const [trigger, setTrigger] = useState<HTMLElement | null>(null);
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className={cn(sheetClass, 'grid gap-5 border-l-4 border-l-(--mode-deep) p-5 sm:p-6')}
    >
      <div className="grid gap-2">
        <h2 id={titleId} className="text-h3 text-fg">
          Yarım kalan bir çalışman var
        </h2>
        <p className="text-body text-fg tabular-nums">
          {session.currentPosition} / {session.questionCount} soru · %{session.percentage}
        </p>
        <ProgressBar
          value={session.currentPosition}
          max={session.questionCount}
          tone="mode"
          className="max-w-md"
        />
      </div>
      <div className="flex flex-wrap gap-3">
        <ButtonLink
          to={`/study/practice/${session.id}`}
          variant="mode"
          icon={<ModeIcon mode={practiceModes[session.practiceType]} />}
        >
          Devam Et
        </ButtonLink>
        <Button
          variant="secondary"
          aria-haspopup="dialog"
          onClick={(e) => setTrigger(e.currentTarget)}
        >
          İptal Et
        </Button>
      </div>
      {trigger ? (
        <CancelPracticeDialog session={session} trigger={trigger} close={() => setTrigger(null)} />
      ) : null}
    </section>
  );
}

function CancelPracticeDialog({
  session,
  trigger,
  close,
}: {
  session: PracticeSession;
  trigger: HTMLElement;
  close: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const heading = useId();
  const description = useId();
  const cancel = usePracticeCommand(session.id);
  const busy = useRef(false);
  // After a confirmed cancellation the trigger leaves with the session, so focus
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
        if (cancel.isPending) e.preventDefault();
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
            Çalışmayı iptal etmek istiyor musun?
          </h2>
        </div>
        <p id={description} className="text-body text-fg">
          Bu çalışma tamamlanmış sayılmaz ve öğrenme katkısı sağlamaz. Sonra yeni bir çalışma
          başlatabilirsin.
        </p>
        {cancel.error ? (
          <p role="alert" className="text-body text-danger">
            {apiErrorMessage(cancel.error)}
          </p>
        ) : null}
        <div className="flex flex-col gap-3 border-t border-line pt-5 sm:flex-row sm:justify-end">
          <Button
            data-keep
            variant="secondary"
            disabled={cancel.isPending}
            onClick={() => ref.current?.close()}
          >
            Devam Et
          </Button>
          <Button
            variant="danger"
            loading={cancel.isPending}
            onClick={() => {
              if (busy.current) return;
              busy.current = true;
              void cancel
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

export function WrittenSessionPage() {
  const { sessionId = '' } = useParams();
  const query = usePractice(sessionId);
  useDocumentTitle(query.data ? practiceNames[query.data.practiceType] : 'Kelime Çalış');
  // A failed (re)load shows the error with an explicit retry, as before the redesign.
  if (!query.isError && query.data) return <WrittenSession session={query.data} />;
  return (
    <div className="mx-auto grid w-full max-w-3xl gap-6">
      <PageHeader
        variant="session"
        back={{ to: '/study', label: 'Kelime Çalış sayfasına dön' }}
        eyebrow="Kelime Çalış"
        title="Çalışma"
      />
      {query.isError ? (
        <ErrorPanel error={query.error} retry={() => void query.refetch()} />
      ) : (
        <LoadingNotice rows={3}>Çalışman yükleniyor…</LoadingNotice>
      )}
    </div>
  );
}

/**
 * Feedback for one evaluated question, built only from the server's evaluation.
 * It has no live-region role: the active question wraps it in a persistent status
 * region, and the result list shows it statically.
 */
function EvaluationFeedback({
  evaluation: e,
  animate = true,
}: {
  evaluation: PracticeEvaluation;
  animate?: boolean;
}) {
  if (e.feedback === 'self')
    return (
      <Feedback tone="neutral" animate={animate}>
        <p>
          Öz değerlendirmen: {e.answer === 'known' ? 'Bildim' : 'Bilemedim'}. Bu, otomatik doğruluk
          değerlendirmesi değildir.
        </p>
      </Feedback>
    );
  return (
    <Feedback
      // Amber, not red: a wrong answer marks a word to review, not a system error.
      tone={e.correct ? 'success' : 'highlight'}
      title={e.correct ? 'Doğru' : 'Yanlış'}
      animate={animate}
    >
      <p>
        Hedef İngilizce karşılık:{' '}
        <strong lang="en" className={cn(headwordClass, 'text-body-lg')}>
          {e.english}
        </strong>
      </p>
      {e.feedback === 'alternative' ? (
        <p>
          Bu cevap da kayıtlı anlamların tamamıyla eşleşiyor. Hedef kelimeye öğrenme katkısı
          sağlamaz.
        </p>
      ) : e.feedback === 'overlap' ? (
        <p>
          Bu da bir karşılık olabilir, ancak bu sorunun hedefi: <span lang="en">{e.english}</span>.
        </p>
      ) : null}
    </Feedback>
  );
}

const questionTitle = (question: PracticeQuestion, listening: boolean) =>
  question.activityType === 'flashcard'
    ? 'Kelime kartı · Kendini değerlendir'
    : question.activityType === 'choice'
      ? 'Seçenekli tanıma · Türkçe karşılığı seç'
      : listening
        ? 'Dinle ve duyduğun İngilizce ifadeyi yaz'
        : 'İngilizce karşılığını yaz';

const questionMode = (question: PracticeQuestion, listening: boolean): Mode =>
  question.activityType === 'flashcard'
    ? 'flashcards'
    : question.activityType === 'choice'
      ? 'quiz'
      : listening
        ? 'listening'
        : 'written';

function WrittenSession({ session }: { session: PracticeSession }) {
  const mutation = usePracticeCommand(session.id);
  const [trigger, setTrigger] = useState<HTMLElement | null>(null);
  const [unconfirmed, setUnconfirmed] = useState<PracticeCommand | null>(null);
  const [audioFailureQuestion, setAudioFailureQuestion] = useState<string | null>(null);
  const busy = useRef(false);
  const id = useId();
  const nextButton = useRef<HTMLButtonElement>(null);
  const openQuestion = useRef<string | null>(null);
  // Finishing here replaces "Çalışmayı tamamla" with the result, so focus moves to
  // it; a session that was already finished on load keeps the route's heading focus.
  const [startedActive] = useState(() => session.status === 'ACTIVE');
  async function send(command: PracticeCommand) {
    if (busy.current) return;
    busy.current = true;
    try {
      await mutation.mutateAsync(command);
      setUnconfirmed(null);
    } catch {
      setUnconfirmed(command);
    } finally {
      busy.current = false;
    }
  }
  const question = session.currentQuestion;
  const mixed = session.practiceType === 'mixed';
  const listening = session.practiceType === 'listening' || question?.activityType === 'listening';
  const card = question?.activityType === 'flashcard';
  const choice = question?.activityType === 'choice';
  const skipped = question?.resolution === 'audio_unavailable';
  const resolved = Boolean(question?.evaluation) || skipped;
  const active = session.status === 'ACTIVE';
  const last = session.currentPosition + 1 === session.questionCount;

  // When a question is resolved while the student is on it, the answer controls are
  // disabled; move focus to the next step instead of letting it fall to the page.
  // A question that was already resolved on load keeps the route's heading focus.
  useEffect(() => {
    if (!question) return;
    if (!resolved) openQuestion.current = question.id;
    else if (openQuestion.current === question.id) {
      openQuestion.current = null;
      nextButton.current?.focus();
    }
  }, [question, resolved]);

  const setupPath = mixed
    ? `/study/mixed${session.listId ? `?list=${session.listId}` : ''}`
    : session.listId
      ? `/lists/${session.listId}/${listening ? 'listening' : 'written'}`
      : '/study';

  return (
    <div
      data-mode={practiceModes[session.practiceType]}
      className="mx-auto grid w-full max-w-3xl gap-6"
    >
      <PageHeader
        variant="session"
        mode={practiceModes[session.practiceType]}
        back={{ to: setupPath, label: 'Kelime Çalış sayfasına dön' }}
        eyebrow={session.listTitle}
        title={practiceNames[session.practiceType]}
        actions={
          active ? (
            <Button
              variant="secondary"
              aria-haspopup="dialog"
              disabled={mutation.isPending}
              onClick={(e) => setTrigger(e.currentTarget)}
            >
              İptal Et
            </Button>
          ) : null
        }
      />
      {session.status === 'CANCELED' ? (
        <div className={cn(sheetClass, 'grid justify-items-start gap-4 p-5 sm:p-6')}>
          <p role="status" className="text-body text-fg">
            Çalışman iptal edildi. Öğrenme katkısı uygulanmadı.
          </p>
          <ButtonLink
            to={setupPath}
            variant="mode"
            icon={<ModeIcon mode={practiceModes[session.practiceType]} />}
          >
            Yeni çalışma başlat
          </ButtonLink>
        </div>
      ) : session.status === 'COMPLETED' ? (
        <Completed
          session={session}
          listening={listening}
          setupPath={setupPath}
          focusHeading={startedActive}
        />
      ) : (
        <>
          <div className="grid gap-2.5">
            <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1">
              <p aria-live="polite" className="text-body font-semibold text-fg tabular-nums">
                Soru {Math.min(session.currentPosition + 1, session.questionCount)} /{' '}
                {session.questionCount}
              </p>
              {mixed && question ? (
                <p className="text-small text-fg-muted">
                  {question.originListTitle} ·{' '}
                  {question.activityType ? mixedActivityNames[question.activityType] : ''}
                </p>
              ) : null}
            </div>
            {/* Counts the question on screen once it is answered, like the game rounds. */}
            <ProgressBar
              value={Math.min(session.currentPosition + (resolved ? 1 : 0), session.questionCount)}
              max={session.questionCount}
              tone="mode"
            />
          </div>
          {question ? (
            <section
              aria-labelledby={`${id}-question`}
              // In a mixed session every question takes the colors of its own activity.
              data-mode={questionMode(question, listening)}
              className={cn(sheetClass, 'overflow-hidden shadow-raised')}
            >
              <div className="flex items-center gap-3 border-b border-(--mode-soft) bg-(--mode-tint) px-5 py-3 sm:px-7">
                <ModeTile mode={questionMode(question, listening)} size="sm" tone="solid" />
                <h2 id={`${id}-question`} className="text-h4 text-fg">
                  {questionTitle(question, listening)}
                </h2>
              </div>
              <div key={question.id} className="stage-enter grid gap-6 px-5 py-6 sm:px-7 sm:py-8">
                <p
                  className={cn(
                    'wrap-anywhere text-center text-fg',
                    question.prompt ? cn(headwordClass, 'text-display') : 'text-h2',
                  )}
                >
                  {question.prompt ? (
                    <span lang="en">{question.prompt}</span>
                  ) : (
                    question.meanings.join('; ')
                  )}
                </p>
                {card ? (
                  <MixedCard
                    question={question}
                    pending={mutation.isPending || unconfirmed !== null}
                    send={(command) =>
                      void send({ ...command, questionId: question.id, version: session.version })
                    }
                  />
                ) : null}
                {choice ? (
                  <MixedChoices
                    question={question}
                    pending={mutation.isPending || unconfirmed !== null}
                    choose={(optionId) =>
                      void send({
                        action: 'choice',
                        optionId,
                        questionId: question.id,
                        version: session.version,
                      })
                    }
                  />
                ) : null}
                {listening && !question.evaluation && !skipped ? (
                  <AudioControls
                    sessionId={session.id}
                    questionId={question.id}
                    availability={(ready) => setAudioFailureQuestion(ready ? null : question.id)}
                  />
                ) : null}
                {/* The status region stays mounted for the whole question. */}
                <div className="grid gap-4">
                  {!skipped && !card && !choice ? (
                    <AnswerForm
                      evaluation={question.evaluation}
                      pending={mutation.isPending}
                      locked={unconfirmed !== null}
                      submit={(answer) =>
                        void send({
                          action: 'answers',
                          questionId: question.id,
                          version: session.version,
                          answer,
                        })
                      }
                    />
                  ) : null}
                  <div role="status">
                    {question.evaluation ? (
                      <EvaluationFeedback evaluation={question.evaluation} />
                    ) : skipped ? (
                      <Feedback tone="neutral" title="Soru atlandı">
                        <p>
                          Ses kullanılamadığı için atlandı. Bu soru doğru veya yanlış sayılmaz ve
                          öğrenme katkısı sağlamaz.
                        </p>
                      </Feedback>
                    ) : null}
                  </div>
                </div>
                {listening &&
                !question.evaluation &&
                !skipped &&
                audioFailureQuestion === question.id ? (
                  <Button
                    variant="secondary"
                    className="justify-self-start"
                    loading={mutation.isPending}
                    disabled={unconfirmed !== null}
                    onClick={() =>
                      void send({
                        action: 'skip-audio',
                        questionId: question.id,
                        version: session.version,
                      })
                    }
                  >
                    Ses kullanılamıyor, soruyu atla
                  </Button>
                ) : null}
                {resolved ? (
                  <Button
                    ref={nextButton}
                    size="lg"
                    variant="mode"
                    className="justify-self-start"
                    loading={mutation.isPending}
                    disabled={unconfirmed !== null}
                    onClick={() =>
                      void send(
                        last
                          ? { action: 'complete' }
                          : { action: 'next', questionId: question.id, version: session.version },
                      )
                    }
                  >
                    {last ? 'Çalışmayı tamamla' : 'Sonraki soru'}
                  </Button>
                ) : null}
              </div>
            </section>
          ) : (
            <div className={cn(sheetClass, 'grid justify-items-start gap-4 p-5 sm:p-6')}>
              <p className="text-body text-fg">
                Tüm soruları cevapladın. Sonuçlarını kaydetmek için çalışmayı tamamla.
              </p>
              <Button
                loading={mutation.isPending}
                onClick={() => void send({ action: 'complete' })}
              >
                Çalışmayı tamamla
              </Button>
            </div>
          )}
        </>
      )}
      {mutation.error ? (
        <div className="feedback-enter grid justify-items-start gap-3 rounded-card border border-danger/40 bg-danger-soft p-4">
          <p role="alert" className="text-body text-fg">
            {apiErrorMessage(mutation.error)} Güncel durumu yükleyebilir veya aynı isteği tekrar
            gönderebilirsin.
          </p>
          <div className="flex flex-wrap gap-2">
            {unconfirmed ? (
              <Button
                variant="secondary"
                loading={mutation.isPending}
                onClick={() => void send(unconfirmed)}
              >
                Tekrar dene
              </Button>
            ) : null}
            <ReloadPractice sessionId={session.id} clear={() => setUnconfirmed(null)} />
          </div>
        </div>
      ) : null}
      {active ? (
        <p className="flex items-start gap-2 border-t border-line pt-4 text-small text-fg-muted">
          <InfoIcon className="mt-0.5 shrink-0 text-[1.1rem]" />
          Kaydedilen cevaplar korunur. Ayrılıp başka bir cihazdan devam edebilirsin.
        </p>
      ) : null}
      {trigger ? (
        <CancelPracticeDialog session={session} trigger={trigger} close={() => setTrigger(null)} />
      ) : null}
    </div>
  );
}

function Completed({
  session,
  listening,
  setupPath,
  focusHeading,
}: {
  session: PracticeSession;
  listening: boolean;
  setupPath: string;
  focusHeading: boolean;
}) {
  const id = useId();
  const heading = useRef<HTMLHeadingElement>(null);
  useEffect(() => {
    if (focusHeading) heading.current?.focus();
  }, [focusHeading]);
  const mixed = session.practiceType === 'mixed';
  return (
    <>
      <section
        aria-labelledby={`${id}-done`}
        className={cn(sheetClass, 'grid gap-5 overflow-hidden p-5 shadow-raised sm:p-7')}
      >
        <div className="mode-art-stage -mx-5 -mt-5 flex items-center gap-4 border-b border-(--mode-soft) px-5 py-6 sm:-mx-7 sm:-mt-7 sm:px-7">
          {/* A one-time settle and ring (reduced motion: static). Decorative. */}
          <span
            aria-hidden="true"
            className="celebrate grid size-14 shrink-0 place-items-center rounded-full bg-success text-[1.6rem] text-white shadow-[0_0_0_5px_rgb(255_255_255/0.85),0_14px_28px_-12px_rgb(18_107_66/0.7)]"
          >
            <CheckIcon strokeWidth={3} />
          </span>
          <h2
            ref={heading}
            id={`${id}-done`}
            tabIndex={-1}
            className="min-w-0 wrap-anywhere text-h1 text-fg"
          >
            Çalışmayı tamamladın
          </h2>
        </div>
        <div className="grid gap-2">
          <p className="text-h4 text-fg tabular-nums">
            {session.questionCount} soru · Doğru: {session.correctCount} · Yanlış:{' '}
            {session.incorrectCount ??
              session.questionCount - session.correctCount - (session.skippedCount ?? 0)}
            {listening || mixed
              ? ` · Ses kullanılamadığı için atlanan: ${session.skippedCount ?? 0}`
              : null}
          </p>
          <p className="text-body text-fg tabular-nums">
            {mixed ? 'Pozitif katkıya uygun değerlendirme' : 'Hedefi doğru yazdığın cevap'}:{' '}
            {session.masteryEligibleCount} · Uygulanan öğrenme katkısı:{' '}
            {session.masteryAppliedCount}
          </p>
          {mixed ? (
            <p className="text-body text-fg tabular-nums">
              Öz bildirim · Bildim: {session.selfKnownCount ?? 0} · Bilemedim:{' '}
              {session.selfMissedCount ?? 0}. Bu sayılar doğru/yanlış cevaplardan ayrıdır.
            </p>
          ) : null}
        </div>
        {mixed && session.distribution?.length ? (
          <div className="overflow-x-auto rounded-card border border-line">
            <table className="w-full min-w-[28rem] text-start text-small text-fg tabular-nums">
              <caption className="sr-only">Yönteme göre soru dağılımı</caption>
              <thead className="bg-surface-sunken text-caption text-fg-muted">
                <tr>
                  <th scope="col" className="px-3 py-2 text-start font-semibold">
                    Yöntem
                  </th>
                  <th scope="col" className="px-3 py-2 text-end font-semibold">
                    Soru
                  </th>
                  <th scope="col" className="px-3 py-2 text-end font-semibold">
                    Doğru
                  </th>
                  <th scope="col" className="px-3 py-2 text-end font-semibold">
                    Yanlış
                  </th>
                  <th scope="col" className="px-3 py-2 text-end font-semibold">
                    Atlanan
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-line">
                {session.distribution.map((d) => (
                  <tr key={d.activityType}>
                    <th scope="row" className="px-3 py-2 text-start font-semibold">
                      {mixedActivityNames[d.activityType]}
                    </th>
                    <td className="px-3 py-2 text-end">{d.total}</td>
                    <td className="px-3 py-2 text-end">{d.correct}</td>
                    <td className="px-3 py-2 text-end">{d.incorrect}</td>
                    <td className="px-3 py-2 text-end">{d.skipped}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        ) : null}
        <p className="flex items-start gap-2 text-small text-fg-muted">
          <InfoIcon className="mt-0.5 shrink-0 text-[1.05rem]" />
          {listening
            ? 'Dinleme ve yazım sonucu öğrenme sürecine katkı sağlar; Türkçe anlamlar gösterildiği için bu oyun bağımsız anlam hatırlamayı veya tam dil yetkinliğini kanıtlamaz.'
            : 'Bu sonuç öğrenme sürecine katkı sağlar; dilde tam yetkinliğin göstergesi değildir.'}
        </p>
        <div className="flex flex-wrap gap-3">
          <ButtonLink
            to={setupPath}
            variant="mode"
            size="lg"
            icon={<ModeIcon mode={practiceModes[session.practiceType]} />}
          >
            Yeni çalışma başlat
          </ButtonLink>
          <ButtonLink to="/history" variant="ghost" size="lg">
            Çalışma Geçmişi
          </ButtonLink>
        </div>
      </section>
      {session.results.length ? (
        <section aria-labelledby={`${id}-results`} className="grid gap-3">
          <h2 id={`${id}-results`} className="text-h3 text-fg">
            Soruların
          </h2>
          <ol className={cn(sheetClass, 'grid divide-y divide-line overflow-hidden')}>
            {session.results.map((q, index) => (
              <li key={q.id} className="grid gap-2.5 px-5 py-4 wrap-anywhere sm:px-6">
                <div className="flex items-baseline gap-3">
                  <span className="text-caption text-fg-muted tabular-nums">{index + 1}.</span>
                  <div className="grid min-w-0 gap-1">
                    <p className="text-body font-semibold text-fg">{q.meanings.join('; ')}</p>
                    {q.activityType === 'flashcard' ? (
                      <p lang="en" className={cn(headwordClass, 'text-body-lg text-fg')}>
                        {q.prompt}
                      </p>
                    ) : null}
                    {q.activityType ? (
                      <p className="text-small text-fg-muted">
                        {mixedActivityNames[q.activityType]} · {q.originListTitle}
                      </p>
                    ) : null}
                  </div>
                </div>
                {q.evaluation ? (
                  <EvaluationFeedback evaluation={q.evaluation} animate={false} />
                ) : null}
                {q.resolution === 'audio_unavailable' ? (
                  <p className="text-small text-fg">
                    Ses kullanılamadığı için atlandı · Öğrenme katkısı yok.
                  </p>
                ) : null}
              </li>
            ))}
          </ol>
        </section>
      ) : null}
    </>
  );
}

function ReloadPractice({ sessionId, clear }: { sessionId: string; clear: () => void }) {
  const query = usePractice(sessionId);
  return (
    <Button
      variant="ghost"
      loading={query.isFetching}
      onClick={() => {
        void query.refetch().then((r) => {
          if (r.isSuccess) clear();
        });
      }}
    >
      Güncel durumu yükle
    </Button>
  );
}

const selfTones = {
  known: 'border-success/60 bg-success-soft text-success enabled:hover:border-success',
  missed: 'border-on-highlight/40 bg-highlight text-on-highlight enabled:hover:border-on-highlight',
} as const;

/** Self-report button with the same colors as the flashcard evaluation buttons. */
function SelfButton({
  tone,
  icon,
  children,
  ref,
  ...props
}: {
  tone: keyof typeof selfTones;
  icon: ReactNode;
  children: ReactNode;
  ref?: Ref<HTMLButtonElement> | undefined;
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      ref={ref}
      type="button"
      className={cn(
        'inline-flex min-h-14 items-center justify-center gap-2 rounded-control border-2 px-4 text-body font-semibold',
        'transition-[background-color,border-color,color] duration-(--duration-fast) ease-standard',
        'disabled:cursor-not-allowed disabled:border-transparent disabled:bg-disabled disabled:text-on-disabled',
        selfTones[tone],
      )}
      {...props}
    >
      <span aria-hidden="true" className="text-[1.2em]">
        {icon}
      </span>
      {children}
    </button>
  );
}

function MixedCard({
  question,
  pending,
  send,
}: {
  question: PracticeQuestion;
  pending: boolean;
  send: (
    command: { action: 'reveal' } | { action: 'self-evaluation'; evaluation: 'known' | 'missed' },
  ) => void;
}) {
  const control = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    control.current?.focus();
  }, [question.revealed]);
  return (
    <div className="grid gap-4">
      {question.revealed ? (
        <>
          <div className="reveal-enter grid justify-items-center gap-2.5 rounded-card border-2 border-dashed border-(--mode-soft) bg-(--mode-tint)/60 px-4 py-6 text-center">
            <p className="inline-flex w-fit items-center rounded-full bg-surface-raised px-3 py-1 text-caption font-bold tracking-[0.08em] text-(--mode-ink) uppercase shadow-[inset_0_0_0_1px_var(--mode-soft)]">
              Türkçe anlamları
            </p>
            <p className="wrap-anywhere text-h3 text-fg">{question.meanings.join('; ')}</p>
          </div>
          {!question.evaluation ? (
            <div className="grid grid-cols-2 gap-3">
              <SelfButton
                ref={control}
                tone="known"
                icon={<CheckIcon />}
                disabled={pending}
                onClick={() => send({ action: 'self-evaluation', evaluation: 'known' })}
              >
                Bildim
              </SelfButton>
              <SelfButton
                tone="missed"
                icon={<CrossIcon />}
                disabled={pending}
                onClick={() => send({ action: 'self-evaluation', evaluation: 'missed' })}
              >
                Bilemedim
              </SelfButton>
            </div>
          ) : null}
        </>
      ) : (
        <Button
          ref={control}
          variant="mode-soft"
          size="lg"
          icon={<EyeIcon />}
          className="justify-self-center"
          disabled={pending}
          onClick={() => send({ action: 'reveal' })}
        >
          Anlamları göster
        </Button>
      )}
    </div>
  );
}

function MixedChoices({
  question,
  pending,
  choose,
}: {
  question: PracticeQuestion;
  pending: boolean;
  choose: (optionId: string) => void;
}) {
  const first = useRef<HTMLButtonElement>(null);
  useEffect(() => {
    first.current?.focus();
  }, []);
  const answered = Boolean(question.evaluation);
  return (
    <div className="grid gap-3">
      <div
        role="group"
        aria-label="Türkçe karşılık seçenekleri"
        className="grid gap-2.5 sm:grid-cols-2"
      >
        {question.options?.map((option, index) => {
          const chosen = question.evaluation?.answer === option.id;
          const correct = question.correctOptionId === option.id;
          return (
            <button
              ref={index === 0 ? first : null}
              key={option.id}
              type="button"
              disabled={pending || answered}
              aria-pressed={chosen}
              onClick={() => choose(option.id)}
              className={cn(
                'flex min-h-14 items-center gap-3 rounded-card border-2 px-4 py-3 text-start text-body font-semibold wrap-anywhere',
                'transition-[background-color,border-color,color,box-shadow] duration-(--duration-fast) ease-standard',
                correct
                  ? 'border-success bg-success-soft text-success'
                  : chosen
                    ? 'border-on-highlight/50 bg-highlight text-on-highlight'
                    : answered
                      ? 'border-line bg-surface-raised text-fg-muted'
                      : 'border-line-strong/70 bg-surface-raised text-fg shadow-card enabled:hover:border-(--mode-deep) enabled:hover:bg-(--mode-tint) enabled:hover:text-(--mode-ink) enabled:hover:shadow-raised',
                'disabled:cursor-default',
              )}
            >
              <span>
                {option.meanings.join(' / ')}
                {correct ? ' · ✓ Doğru karşılık' : ''}
              </span>
            </button>
          );
        })}
      </div>
      <p className="text-small text-fg-muted">Seçenekli tanıma öğrenme katkısı sağlamaz.</p>
    </div>
  );
}

function AnswerForm({
  evaluation,
  submit,
  pending,
  locked,
}: {
  evaluation: PracticeEvaluation | null;
  submit: (answer: string) => void;
  pending: boolean;
  locked: boolean;
}) {
  const [answer, setAnswer] = useState('');
  const composing = useRef(false);
  const input = useRef<HTMLInputElement>(null);
  const id = useId();
  useEffect(() => {
    if (!evaluation) input.current?.focus();
  }, [evaluation]);
  return (
    <form
      className="grid gap-2"
      onSubmit={(event) => {
        event.preventDefault();
        if (!composing.current && !pending && !locked && !evaluation && answer.trim())
          submit(answer);
      }}
    >
      <label htmlFor={id} className="text-small font-semibold text-fg">
        İngilizce cevabın
      </label>
      <div className="flex flex-col gap-3 sm:flex-row">
        <input
          ref={input}
          id={id}
          lang="en"
          value={evaluation?.answer ?? answer}
          onChange={(e) => setAnswer(e.target.value)}
          className={cn(
            // flex-1 only in the row layout: in the phone column it would override h-14.
            'h-14 w-full min-w-0 rounded-card border-2 border-line-strong bg-surface-raised px-4 font-headword text-body-lg font-semibold text-fg sm:flex-1',
            'shadow-[inset_0_2px_4px_rgb(13_19_33/0.06)] transition-[border-color,background-color,box-shadow] duration-(--duration-fast) ease-standard',
            'enabled:hover:border-fg focus-visible:border-(--mode-deep) focus-visible:shadow-[0_0_0_4px_var(--mode-soft)]',
            'focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus',
            // The submitted answer stays readable once it is locked.
            'disabled:cursor-not-allowed disabled:border-line disabled:bg-surface-sunken disabled:text-fg',
          )}
          disabled={!!evaluation || pending || locked}
          maxLength={500}
          required
          autoCapitalize="none"
          autoCorrect="off"
          spellCheck={false}
          autoComplete="off"
          {...{ writingsuggestions: 'false' }}
          onCompositionStart={() => {
            composing.current = true;
          }}
          onCompositionEnd={() => {
            composing.current = false;
          }}
          onKeyDown={(e) => {
            if (
              e.key === 'Enter' &&
              (e.nativeEvent.isComposing || composing.current || e.keyCode === 229)
            )
              e.preventDefault();
          }}
        />
        {!evaluation ? (
          <Button
            type="submit"
            size="lg"
            variant="mode"
            loading={pending}
            disabled={locked || !answer.trim()}
          >
            Cevabı kontrol et
          </Button>
        ) : null}
      </div>
    </form>
  );
}
