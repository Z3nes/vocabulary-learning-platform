import { useQueryClient } from '@tanstack/react-query';
import { useRef, useState } from 'react';
import { Navigate, useNavigate, useParams } from 'react-router';
import { Button } from '../../components/ui/Button';
import { Feedback } from '../../components/ui/Feedback';
import { InfoIcon } from '../../components/ui/icons';
import { PageHeader } from '../../components/ui/PageHeader';
import { apiErrorMessage } from '../../lib/apiErrors';
import {
  isOutdatedError,
  resolvedCount,
  studyKeys,
  useStudyAction,
  useStudySession,
  type ActionInput,
  type StudyAction,
  type StudySession,
} from '../../lib/study';
import { useDocumentTitle } from '../../lib/useDocumentTitle';
import { EndSessionDialog } from './EndSessionDialog';
import { Flashcard } from './Flashcard';
import { ErrorPanel, LoadingNotice } from './parts';
import { sessionFacts, studyPaths } from './studyFormat';
import { StudyActions, StudyProgress } from './StudyControls';

/**
 * Active flashcard session. Everything shown comes from the server session (its
 * immutable card snapshots, queue and counts); the page never rebuilds cards from the
 * current vocabulary and never decides outcomes. Leaving or reloading the page does
 * not end the session: only "Çalışmayı bitir" does.
 */
export function StudySessionPage() {
  const { sessionId = '' } = useParams();
  const query = useStudySession(sessionId);
  useDocumentTitle(query.data ? `${query.data.listTitle} · Kelime kartları` : 'Kelime kartları');

  if (!query.isError && query.data?.status === 'active')
    return <ActiveSession session={query.data} />;
  if (!query.isError && query.data)
    return <Navigate replace to={studyPaths.summary(query.data.id)} />;
  return (
    <div data-mode="flashcards" className="mx-auto grid w-full max-w-3xl gap-6">
      <PageHeader
        variant="session"
        mode="flashcards"
        back={{ to: '/study', label: 'Kelime Çalış sayfasına dön' }}
        eyebrow="Kelime kartları"
        title="Çalışma"
      />
      {query.isError ? (
        <ErrorPanel
          error={query.error}
          retry={() => {
            void query.refetch();
          }}
        />
      ) : (
        <LoadingNotice>Çalışman yükleniyor…</LoadingNotice>
      )}
    </div>
  );
}

/** A request whose result is unknown (network or server failure): resend it as is. */
interface Unconfirmed {
  input: ActionInput;
  message: string;
}

const announcements: Record<StudyAction, string> = {
  known: 'Bildim olarak kaydedildi.',
  missed: 'Bilemedim olarak kaydedildi.',
  skip: 'Kart atlandı; diğer kartlardan sonra tekrar gelecek.',
  remove: 'Kart bu çalışmadan çıkarıldı. Kelimen listende duruyor.',
};

function ActiveSession({ session }: { session: StudySession }) {
  const navigate = useNavigate();
  const client = useQueryClient();
  const action = useStudyAction(session.id);
  const card = session.currentCard!;
  // Reveal belongs to one card: a new current card starts hidden again.
  const [revealedCard, setRevealedCard] = useState<string | null>(null);
  const [notice, setNotice] = useState('');
  const [announcement, setAnnouncement] = useState('');
  const [unconfirmed, setUnconfirmed] = useState<Unconfirmed | null>(null);
  const [endTrigger, setEndTrigger] = useState<HTMLElement | null>(null);
  const [reloading, setReloading] = useState(false);
  const sending = useRef(false);
  const revealKey = `${card.id}:${card.appearance}`;
  const revealed = revealedCard === revealKey;

  async function send(input: ActionInput) {
    // One request at a time: repeated clicks and key presses are ignored.
    if (sending.current) return;
    sending.current = true;
    setNotice('');
    setAnnouncement('');
    try {
      const result = await action.mutateAsync(input);
      setUnconfirmed(null);
      const { counts } = result.session;
      setAnnouncement(
        `${announcements[input.action]} Tamamlanan ${resolvedCount(counts)} / ${counts.total}.`,
      );
    } catch (error) {
      if (isOutdatedError(error)) {
        // Changed in another tab or device: the mutation reloads the session.
        setUnconfirmed(null);
        setNotice(apiErrorMessage(error));
      } else {
        // The server may or may not have recorded it. Keep the exact request: resending
        // it is safe (an identical request is never applied twice).
        setUnconfirmed({ input, message: apiErrorMessage(error) });
      }
    } finally {
      sending.current = false;
    }
  }

  async function reload() {
    setReloading(true);
    try {
      await client.refetchQueries(
        { queryKey: studyKeys.session(session.id), exact: true },
        { throwOnError: true },
      );
      setUnconfirmed(null);
    } catch {
      /* Keep the retry message; the student can try again. */
    } finally {
      setReloading(false);
    }
  }

  const pending = action.isPending ? (action.variables?.action ?? null) : null;
  const doneCount = resolvedCount(session.counts);
  // Skipped cards still waiting for their second appearance; a returned card on screen
  // is no longer "coming back later".
  const waiting = session.cards.filter(
    (item) => item.skipped && item.outcome === null && item.id !== card.id,
  ).length;
  // An all-lists review session has no list to return to.
  const back = session.listId
    ? { to: studyPaths.list(session.listId), label: 'Listeye dön' }
    : { to: '/study/review', label: 'Zorlandıklarımı Çalış sayfasına dön' };
  const mode = session.reviewOnly ? 'review' : 'flashcards';
  return (
    <div data-mode={mode} className="mx-auto grid w-full max-w-3xl gap-6">
      <PageHeader
        variant="session"
        mode={mode}
        back={back}
        eyebrow={session.reviewOnly ? 'Zorlandıklarımı Çalış' : 'Kelime kartları'}
        title={session.listTitle}
        description={sessionFacts(session)}
        actions={
          <Button
            variant="secondary"
            aria-haspopup="dialog"
            onClick={(event) => setEndTrigger(event.currentTarget)}
          >
            Çalışmayı bitir
          </Button>
        }
      />
      {/*
       * The status region stays mounted (so the first message is announced) and adds no
       * gap while empty: it shares one grid cell with the progress display.
       */}
      <div>
        <StudyProgress session={session} />
        <div role="status">
          {notice ? (
            <Feedback key={notice} tone="info" className="mt-4">
              <p>{notice}</p>
            </Feedback>
          ) : null}
        </div>
      </div>
      <Flashcard
        card={card}
        direction={session.direction}
        revealed={revealed}
        toggle={() => setRevealedCard(revealed ? null : revealKey)}
        origin={session.reviewOnly ? card.originListTitle : null}
      />
      {card.appearance === 2 ? (
        <div className="flex items-start gap-2.5 rounded-card border border-accent/30 bg-accent-soft px-4 py-3 text-small text-fg">
          <InfoIcon className="mt-0.5 shrink-0 text-[1.1rem] text-on-accent-soft" />
          <p>
            Bu kartı daha önce atladın; bir kez daha gelmez. Şimdi değerlendir ya da{' '}
            <strong>Çıkar</strong> ile bu çalışmadan çıkar. Çıkarmak kelimeni listenden silmez ve
            öğrenme geçmişini etkilemez.
          </p>
        </div>
      ) : null}
      <StudyActions
        card={card}
        pending={pending}
        locked={unconfirmed !== null}
        act={(chosen) => {
          void send({ cardId: card.id, version: session.version, action: chosen });
        }}
      />
      {unconfirmed ? (
        <div className="feedback-enter grid justify-items-start gap-3 rounded-card border border-danger/40 bg-danger-soft p-4">
          <p role="alert" className="text-body text-fg">
            {unconfirmed.message} Seçimin kaydedilmemiş olabilir. “Tekrar dene” aynı seçimi yeniden
            gönderir; kart iki kez değerlendirilmez.
          </p>
          <div className="flex flex-wrap gap-2">
            <Button
              variant="secondary"
              loading={action.isPending}
              onClick={() => {
                void send(unconfirmed.input);
              }}
            >
              Tekrar dene
            </Button>
            <Button
              variant="ghost"
              loading={reloading}
              onClick={() => {
                void reload();
              }}
            >
              Güncel durumu yükle
            </Button>
          </div>
        </div>
      ) : null}
      <p aria-live="polite" className="sr-only">
        {announcement}
      </p>
      {/* Notes live below the answer buttons so the buttons never move between clicks. */}
      <div className="grid gap-2 border-t border-line pt-4 text-small text-fg-muted">
        {waiting ? (
          <p className="font-semibold text-fg">
            Atladığın {waiting} kart, diğer kartlardan sonra bir kez daha gelecek.
          </p>
        ) : null}
        {doneCount > 0 ? null : (
          <p>
            Cevabı görmeden de değerlendirebilirsin. <strong className="text-fg">Atla</strong>,
            kartı sona alır; kart bir kez daha gelir.
          </p>
        )}
        <p className="flex items-start gap-2">
          <InfoIcon className="mt-0.5 shrink-0 text-[1.1rem]" />
          İstediğin zaman ayrılabilirsin. Verdiğin cevaplar kaydedilir; kaldığın yerden, başka bir
          cihazdan da devam edebilirsin.
        </p>
      </div>
      {endTrigger ? (
        <EndSessionDialog
          session={session}
          trigger={endTrigger}
          close={() => setEndTrigger(null)}
          ended={(ended) => {
            void navigate(studyPaths.summary(ended.id), { replace: true });
          }}
        />
      ) : null}
    </div>
  );
}
