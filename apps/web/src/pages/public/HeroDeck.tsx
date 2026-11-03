import { useId, useRef, useState } from 'react';
import type { CSSProperties } from 'react';
import { flushSync } from 'react-dom';
import { CheckGlyph, CrossGlyph, EyeGlyph, RestartGlyph } from './landingIcons';
import { deckTitle, deckWords, type SampleWord } from './landingContent';

type Verdict = 'known' | 'missed';

/** The card that just left the deck; drawn once more so it can fly to its pile. */
interface Departure {
  key: number;
  verdict: Verdict;
  word: SampleWord;
}

const verdictLabels: Record<Verdict, string> = { known: 'Bildim', missed: 'Bilemedim' };

/**
 * A local-only flashcard deck for the public page. It follows the real study flow:
 * reveal the answer, then evaluate yourself. The words are synthetic samples;
 * nothing is fetched, stored or credited, and a reload starts the deck over.
 */
export function HeroDeck() {
  const [index, setIndex] = useState(0);
  const [revealed, setRevealed] = useState(false);
  // Like the application, the answer is not in the DOM until it is asked for.
  // Afterwards it stays mounted, so flipping the card back can animate.
  const [seen, setSeen] = useState(false);
  const [verdicts, setVerdicts] = useState<Verdict[]>([]);
  const [departure, setDeparture] = useState<Departure | null>(null);
  const [dealt, setDealt] = useState(false);
  const [message, setMessage] = useState('');
  const toggle = useRef<HTMLButtonElement>(null);
  const summary = useRef<HTMLHeadingElement>(null);
  const id = useId();
  const answerId = `${id}-answer`;
  const total = deckWords.length;
  const word = deckWords[index];
  const known = verdicts.filter((verdict) => verdict === 'known').length;
  const missed = verdicts.length - known;

  function flip(next: boolean) {
    if (!word) return;
    setRevealed(next);
    if (next) setSeen(true);
    setMessage(next ? `Türkçe anlamları: ${word.meanings.join(', ')}.` : '');
  }

  function judge(verdict: Verdict) {
    if (!word || !revealed) return;
    const next = index + 1;
    const finished = next === total;
    const knownTotal = known + (verdict === 'known' ? 1 : 0);
    // The evaluation buttons are disabled for the next card, so focus moves to
    // the reveal button, which stays in place.
    if (!finished) toggle.current?.focus();
    flushSync(() => {
      setDeparture({ key: next, verdict, word });
      setVerdicts((list) => [...list, verdict]);
      setIndex(next);
      setRevealed(false);
      setSeen(false);
      setDealt(true);
      setMessage(
        finished
          ? `Deste tamamlandı: ${knownTotal} bildim, ${total - knownTotal} bilemedim.`
          : `${verdictLabels[verdict]} olarak işaretlendi. Sıradaki kart: ${next + 1} / ${total}.`,
      );
    });
    if (finished) summary.current?.focus();
  }

  function restart() {
    flushSync(() => {
      setIndex(0);
      setVerdicts([]);
      setRevealed(false);
      setSeen(false);
      setDeparture(null);
      setMessage(`Deste baştan başladı. Kart 1 / ${total}.`);
    });
    toggle.current?.focus();
  }

  const remaining = Math.max(0, Math.min(2, total - index - 1));
  const progress = { '--lp-progress': verdicts.length / total } as CSSProperties;

  return (
    <div className="lp-deck">
      <div className="lp-deck-head">
        <p className="lp-deck-list">
          <span className="lp-deck-dot" aria-hidden="true" />
          Örnek liste · <strong>{deckTitle}</strong>
        </p>
        <p className="lp-deck-count">
          {word ? (
            <>
              <span className="lp-sr-only">Kart </span>
              {index + 1} / {total}
            </>
          ) : (
            'Tamamlandı'
          )}
        </p>
      </div>
      <div className="lp-deck-meter" aria-hidden="true" style={progress}>
        <span />
      </div>

      <div className="lp-deck-stage">
        <div className="lp-deck-pile" data-remaining={remaining} aria-hidden="true">
          <span />
          <span />
        </div>
        {departure ? (
          <div
            // Separate key prefixes: the ghost and the next card share a number.
            key={`ghost-${departure.key}`}
            className="lp-card lp-card-departing"
            data-verdict={departure.verdict}
            aria-hidden="true"
          >
            <div className="lp-card-inner" data-flipped="true">
              <div className="lp-card-face lp-card-front">
                <EnglishFace word={departure.word} />
              </div>
              <div className="lp-card-face lp-card-back">
                <MeaningsFace word={departure.word} />
              </div>
            </div>
          </div>
        ) : null}
        {word ? (
          <div
            key={`card-${index}`}
            className="lp-card"
            data-dealt={dealt || undefined}
            onClick={() => flip(!revealed)}
          >
            <div className="lp-card-inner" data-flipped={revealed}>
              <div className="lp-card-face lp-card-front">
                <EnglishFace word={word} />
                <span className="lp-card-hint" aria-hidden="true">
                  Çevirmek için dokun
                </span>
              </div>
              <div
                id={answerId}
                className="lp-card-face lp-card-back"
                aria-hidden={revealed ? undefined : true}
              >
                {seen ? <MeaningsFace word={word} /> : null}
              </div>
            </div>
          </div>
        ) : (
          <div className="lp-deck-summary">
            <h2 ref={summary} tabIndex={-1}>
              Deste tamamlandı
            </h2>
            <p className="lp-deck-score">
              <span>
                <strong>{known}</strong> bildim
              </span>
              <span>
                <strong>{missed}</strong> bilemedim
              </span>
            </p>
            <p>
              {missed ? (
                <>
                  Tekrar edeceklerin:{' '}
                  {deckWords
                    .filter((_, i) => verdicts[i] === 'missed')
                    .map((item, i) => (
                      <span key={item.english}>
                        {i ? ', ' : null}
                        <b lang="en">{item.english}</b>
                      </span>
                    ))}
                </>
              ) : (
                'Bu destedeki kelimelerin hepsini bildin.'
              )}
            </p>
            <p className="lp-deck-summary-note">
              Uygulamada “Bilemedim” dediğin kelimeler tekrar listene girer ve sonraki
              çalışmalarında önce seçilir.
            </p>
            <button type="button" className="lp-btn lp-btn-quiet" onClick={restart}>
              <RestartGlyph />
              Desteyi baştan başlat
            </button>
          </div>
        )}
      </div>

      {word ? (
        // Reveal first, then the two evaluations: the visual order matches the DOM order.
        <div className="lp-deck-controls" role="group" aria-label="Kartı değerlendir">
          <button
            ref={toggle}
            type="button"
            className="lp-reveal"
            aria-expanded={revealed}
            aria-controls={answerId}
            onClick={() => flip(!revealed)}
          >
            <EyeGlyph />
            {revealed ? 'Cevabı gizle' : 'Cevabı göster'}
          </button>
          <button
            type="button"
            className="lp-verdict"
            data-verdict="missed"
            disabled={!revealed}
            onClick={() => judge('missed')}
          >
            <CrossGlyph />
            Bilemedim
          </button>
          <button
            type="button"
            className="lp-verdict"
            data-verdict="known"
            disabled={!revealed}
            onClick={() => judge('known')}
          >
            <CheckGlyph />
            Bildim
          </button>
        </div>
      ) : null}

      <p className="lp-deck-tally" aria-hidden="true">
        <span data-verdict="known" key={`k${known}`}>
          <CheckGlyph /> {known} bildim
        </span>
        <span data-verdict="missed" key={`m${missed}`}>
          <CrossGlyph /> {missed} bilemedim
        </span>
      </p>
      <p role="status" className="lp-sr-only">
        {message}
      </p>
    </div>
  );
}

function EnglishFace({ word }: { word: SampleWord }) {
  return (
    <>
      <span className="lp-card-label">İngilizce</span>
      <span className="lp-card-word" lang="en">
        {word.english}
      </span>
    </>
  );
}

function MeaningsFace({ word }: { word: SampleWord }) {
  return (
    <>
      <span className="lp-card-label">Türkçe anlamları</span>
      <ul className="lp-card-meanings">
        {word.meanings.map((meaning) => (
          <li key={meaning}>{meaning}</li>
        ))}
      </ul>
    </>
  );
}
