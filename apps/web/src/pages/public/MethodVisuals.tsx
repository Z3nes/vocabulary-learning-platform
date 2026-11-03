import { useId, useRef, useState } from 'react';
import type { CSSProperties, ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { CheckGlyph, CrossGlyph, PlayGlyph, RestartGlyph, SkipGlyph } from './landingIcons';
import type { MethodId } from './landingContent';

// Miniature renderings of the application's study activities. Three of them are
// small local demonstrations (written answer, classic test, word assembly); the
// rest are illustrations and are hidden from assistive technology, because the
// surrounding caption already describes them. Nothing here talks to the API.

const vars = (values: Record<string, number | string>) => values as CSSProperties;

/** The miniature for one method; see `interactiveMethods` for the playable ones. */
export function MethodVisual({ id }: { id: MethodId }) {
  switch (id) {
    case 'cards':
      return <CardsVisual />;
    case 'written':
      return <WrittenDemo />;
    case 'listening':
      return <ListeningVisual />;
    case 'mixed':
      return <MixedVisual />;
    case 'quiz':
      return <QuizDemo />;
    case 'matching':
      return <MatchingVisual />;
    case 'assembly':
      return <AssemblyDemo />;
    case 'memory':
      return <MemoryVisual />;
    case 'word-search':
      return <WordSearchVisual />;
    case 'crossword':
      return <CrosswordVisual />;
  }
}

function Illustration({ className, children }: { className: string; children: ReactNode }) {
  return (
    <div className={`lp-v ${className}`} aria-hidden="true">
      {children}
    </div>
  );
}

function CardsVisual() {
  return (
    <Illustration className="lp-v-cards">
      <div className="lp-mini-bar">
        <span>İngilizce → Türkçe</span>
        <span>%25 · 6 kart</span>
      </div>
      <div className="lp-v-cards-pair">
        <div className="lp-v-flash lp-v-flash-back">
          <small>Türkçe anlamları</small>
          <span>son teslim tarihi</span>
        </div>
        <div className="lp-v-flash lp-v-flash-front">
          <small>İngilizce</small>
          <span className="lp-en">deadline</span>
        </div>
      </div>
      <div className="lp-v-actions">
        <span data-tone="known">
          <CheckGlyph /> Bildim
        </span>
        <span>
          <SkipGlyph /> Atla
        </span>
        <span data-tone="missed">
          <CrossGlyph /> Bilemedim
        </span>
      </div>
    </Illustration>
  );
}

const normalize = (value: string) => value.trim().replace(/\s+/gu, ' ').toLocaleLowerCase('en-US');

function WrittenDemo() {
  const [answer, setAnswer] = useState('');
  const [result, setResult] = useState<'correct' | 'wrong' | null>(null);
  const input = useRef<HTMLInputElement>(null);
  const retry = useRef<HTMLButtonElement>(null);
  const id = useId();
  return (
    <form
      className="lp-v lp-mini lp-v-written"
      aria-labelledby={`${id}-title`}
      onSubmit={(event) => {
        event.preventDefault();
        if (result !== null || !answer.trim()) return;
        // The field and the check button lock after an answer, so focus moves on to
        // "Yeniden dene" instead of being lost; the status line announces the result.
        flushSync(() => setResult(normalize(answer) === 'requirement' ? 'correct' : 'wrong'));
        retry.current?.focus();
      }}
    >
      <p id={`${id}-title`} className="lp-mini-label">
        Örnek soru · Türkçe → İngilizce
      </p>
      <p className="lp-v-prompt">gereksinim · şart</p>
      <label htmlFor={`${id}-answer`} className="lp-v-field-label">
        İngilizce cevabın
      </label>
      <div className="lp-v-answer">
        <input
          ref={input}
          id={`${id}-answer`}
          lang="en"
          value={answer}
          onChange={(event) => setAnswer(event.target.value)}
          disabled={result !== null}
          maxLength={60}
          autoComplete="off"
          autoCorrect="off"
          autoCapitalize="none"
          spellCheck={false}
          onKeyDown={(event) => {
            if (event.nativeEvent.isComposing && event.key === 'Enter') event.preventDefault();
          }}
        />
        <button
          type="submit"
          className="lp-btn lp-btn-primary"
          disabled={result !== null || !answer.trim()}
        >
          Kontrol et
        </button>
      </div>
      <p role="status" className="lp-v-feedback" data-result={result ?? undefined}>
        {result === 'correct' ? (
          <>
            <CheckGlyph />
            <span>
              Doğru! İngilizce karşılık: <b lang="en">requirement</b>.
            </span>
          </>
        ) : result === 'wrong' ? (
          <>
            <CrossGlyph />
            <span>
              Bu örnekte beklenen cevap: <b lang="en">requirement</b>.
            </span>
          </>
        ) : (
          'Cevabını yaz ve kontrol et.'
        )}
      </p>
      {/* Reserved row: the demo keeps its height when the button appears. */}
      <div className="lp-v-after">
        {result ? (
          <button
            ref={retry}
            type="button"
            className="lp-btn lp-btn-quiet lp-btn-small"
            onClick={() => {
              flushSync(() => {
                setAnswer('');
                setResult(null);
              });
              input.current?.focus();
            }}
          >
            <RestartGlyph /> Yeniden dene
          </button>
        ) : null}
      </div>
    </form>
  );
}

const waveform = [0.35, 0.6, 0.9, 0.55, 0.75, 1, 0.65, 0.4, 0.8, 0.5, 0.3, 0.6, 0.45, 0.25];

function ListeningVisual() {
  return (
    <Illustration className="lp-mini lp-v-listen">
      <div className="lp-v-listen-top">
        <span className="lp-v-play">
          <PlayGlyph />
        </span>
        <span className="lp-v-wave">
          {waveform.map((height, i) => (
            <i key={i} style={vars({ '--h': height, '--i': i })} />
          ))}
        </span>
      </div>
      <div className="lp-v-chips">
        <span>Tekrar dinle</span>
        <span>0.8× · Yavaş</span>
      </div>
      <p className="lp-v-field-label">Duyduğun ifade</p>
      <div className="lp-v-typed">
        <span className="lp-v-typed-text lp-en">sustainable</span>
        <span className="lp-v-caret" />
      </div>
      <p className="lp-v-ok">
        <CheckGlyph /> Doğru yazdın
      </p>
    </Illustration>
  );
}

function MixedVisual() {
  return (
    <Illustration className="lp-v-mixed">
      <div className="lp-mini-bar">
        <span>Karma Çalışma · Tüm listelerin</span>
        <span>7 / 20</span>
      </div>
      <ol>
        <li style={vars({ '--i': 0 })}>
          <b>Kelime kartı</b>
          <span className="lp-en">network</span>
          <em>ağ · iletişim ağı</em>
        </li>
        <li style={vars({ '--i': 1 })}>
          <b>Yazılı Cevap</b>
          <span>verim · iş hacmi</span>
          <em className="lp-en">throughput</em>
        </li>
        <li style={vars({ '--i': 2 })}>
          <b>Dinle ve Yaz</b>
          <span className="lp-v-mixed-audio">
            <PlayGlyph />
            <i />
            <i />
            <i />
            <i />
          </span>
          <em className="lp-en">deadline</em>
        </li>
        <li style={vars({ '--i': 3 })} data-current="true">
          <b>Seçenekli tanıma</b>
          <span className="lp-en">assessment</span>
          <em>değerlendirme · ölçme</em>
        </li>
      </ol>
    </Illustration>
  );
}

const quizOptions = [
  { text: 'son teslim tarihi', correct: false },
  { text: 'değerlendirme / ölçme', correct: true },
  { text: 'gereksinim / şart', correct: false },
  { text: 'ağ / iletişim ağı', correct: false },
] as const;

function QuizDemo() {
  const [choice, setChoice] = useState<number | null>(null);
  const first = useRef<HTMLButtonElement>(null);
  const id = useId();
  const chosen = choice === null ? null : quizOptions[choice];
  return (
    <div className="lp-v lp-mini lp-v-quiz">
      <p className="lp-mini-label">Örnek soru · Klasik test</p>
      <p className="lp-v-question lp-en" lang="en">
        assessment
      </p>
      <p id={`${id}-instruction`} className="lp-v-instruction">
        Doğru Türkçe anlam grubunu seç.
      </p>
      <div className="lp-v-options" role="group" aria-labelledby={`${id}-instruction`}>
        {quizOptions.map((option, i) => {
          const state =
            choice === null
              ? undefined
              : option.correct
                ? 'correct'
                : choice === i
                  ? 'wrong'
                  : 'idle';
          return (
            <button
              key={option.text}
              ref={i === 0 ? first : undefined}
              type="button"
              // Focus stays on the chosen option, so it is never disabled.
              aria-disabled={choice !== null || undefined}
              data-state={state}
              onClick={() => {
                if (choice === null) setChoice(i);
              }}
            >
              <span>{option.text}</span>
              {state === 'correct' ? <CheckGlyph /> : state === 'wrong' ? <CrossGlyph /> : null}
            </button>
          );
        })}
      </div>
      <p
        role="status"
        className="lp-v-feedback"
        data-result={chosen ? (chosen.correct ? 'correct' : 'wrong') : undefined}
      >
        {chosen ? (
          chosen.correct ? (
            <>
              <CheckGlyph />
              <span>
                Doğru! <b lang="en">assessment</b>: değerlendirme / ölçme.
              </span>
            </>
          ) : (
            <>
              <CrossGlyph />
              <span>Yanlış. Doğru cevap: değerlendirme / ölçme.</span>
            </>
          )
        ) : (
          'Bir seçeneğe dokun.'
        )}
      </p>
      {/* Reserved row: the demo keeps its height when the button appears. */}
      <div className="lp-v-after">
        {chosen ? (
          <button
            type="button"
            className="lp-btn lp-btn-quiet lp-btn-small"
            onClick={() => {
              setChoice(null);
              first.current?.focus();
            }}
          >
            <RestartGlyph /> Yeniden dene
          </button>
        ) : null}
      </div>
    </div>
  );
}

const matchLeft = ['deadline', 'queue', 'network', 'requirement'];
const matchRight = ['kuyruk', 'gereksinim / şart', 'son teslim tarihi', 'ağ / iletişim ağı'];
/** Left row → right row, for the pairs already matched. */
const matched: [number, number][] = [
  [0, 2],
  [1, 0],
  [2, 3],
];
// Row geometry in the SVG's own units (1 unit = 1px at the default 16px rem):
// 2.75rem rows with 0.6rem gaps, so the curves meet the row centres at any zoom.
const rowCentre = (row: number) => 22 + row * 53.6;

function MatchingVisual() {
  return (
    <Illustration className="lp-mini lp-v-matching">
      <div className="lp-mini-bar">
        <span>Eşleştirme</span>
        <span>3 / 4 eşleşti</span>
      </div>
      <div className="lp-v-match-board">
        <ul>
          {matchLeft.map((word, row) => (
            <li
              key={word}
              className="lp-en"
              data-state={row === 3 ? 'selected' : 'matched'}
              style={vars({ '--i': row })}
            >
              {word}
            </li>
          ))}
        </ul>
        <svg viewBox="0 0 72 205" preserveAspectRatio="none" focusable="false">
          {matched.map(([from, to], i) => (
            <path
              key={from}
              pathLength={1}
              style={vars({ '--i': i })}
              d={`M0 ${rowCentre(from)} C36 ${rowCentre(from)}, 36 ${rowCentre(to)}, 72 ${rowCentre(to)}`}
            />
          ))}
        </svg>
        <ul>
          {matchRight.map((meaning, row) => (
            <li
              key={meaning}
              data-state={row === 1 ? 'idle' : 'matched'}
              style={vars({ '--i': row })}
            >
              {meaning}
            </li>
          ))}
        </ul>
      </div>
    </Illustration>
  );
}

const assemblyTarget = 'queue';
const assemblyTiles = ['u', 'e', 'q', 'e', 'u'] as const;

function AssemblyDemo() {
  const [picked, setPicked] = useState<number[]>([]);
  const tiles = useRef(new Map<number, HTMLButtonElement>());
  const id = useId();
  const built = picked.map((tile) => assemblyTiles[tile]).join('');
  const complete = picked.length === assemblyTiles.length;
  const correct = complete && built === assemblyTarget;
  return (
    <div className="lp-v lp-mini lp-v-assembly">
      <p className="lp-mini-label">Örnek soru · Kelime Oluşturma</p>
      <p id={`${id}-prompt`} className="lp-v-prompt">
        kuyruk / sıra
      </p>
      <div
        className="lp-v-slots"
        role="group"
        aria-label={`Oluşturduğun kelime: ${built || 'henüz harf yok'}`}
        data-result={correct ? 'correct' : complete ? 'wrong' : undefined}
      >
        {assemblyTiles.map((_, slot) => {
          const tile = picked[slot];
          return tile === undefined ? (
            <span key={slot} className="lp-v-slot" aria-hidden="true" />
          ) : (
            <button
              key={slot}
              type="button"
              className="lp-v-slot"
              data-filled="true"
              aria-label={`${assemblyTiles[tile]} harfini geri al`}
              aria-disabled={correct || undefined}
              onClick={() => {
                if (correct) return;
                flushSync(() => setPicked((list) => list.filter((_, i) => i !== slot)));
                tiles.current.get(tile)?.focus();
              }}
            >
              {assemblyTiles[tile]}
            </button>
          );
        })}
      </div>
      <div className="lp-v-tiles" role="group" aria-label="Karışık harfler">
        {assemblyTiles.map((letter, tile) => {
          const used = picked.includes(tile);
          return (
            <button
              key={tile}
              ref={(node) => {
                if (node) tiles.current.set(tile, node);
                else tiles.current.delete(tile);
              }}
              type="button"
              className="lp-v-tile"
              lang="en"
              aria-describedby={`${id}-prompt`}
              aria-disabled={used || correct || undefined}
              data-used={used || undefined}
              onClick={() => {
                if (!used && !correct) setPicked((list) => [...list, tile]);
              }}
            >
              {letter}
            </button>
          );
        })}
      </div>
      <p
        role="status"
        className="lp-v-feedback"
        data-result={correct ? 'correct' : complete ? 'wrong' : undefined}
      >
        {correct ? (
          <>
            <CheckGlyph />
            <span>
              Doğru! <b lang="en">queue</b>: kuyruk / sıra.
            </span>
          </>
        ) : complete ? (
          'Bu sıralama doğru değil. Yerleştirdiğin bir harfe dokunarak geri al.'
        ) : (
          'Harflere sırayla dokun.'
        )}
      </p>
      {/* Reserved row: the demo keeps its height when the button appears. */}
      <div className="lp-v-after">
        {picked.length ? (
          <button
            type="button"
            className="lp-btn lp-btn-quiet lp-btn-small"
            onClick={() => {
              flushSync(() => setPicked([]));
              tiles.current.get(0)?.focus();
            }}
          >
            <RestartGlyph /> Baştan başla
          </button>
        ) : null}
      </div>
    </div>
  );
}

type MemoryCard = { text: string; english?: boolean; state: 'down' | 'open' | 'matched' };
const memoryCards: MemoryCard[] = [
  { text: '', state: 'down' },
  { text: 'queue', english: true, state: 'matched' },
  { text: '', state: 'down' },
  { text: 'network', english: true, state: 'open' },
  { text: '', state: 'down' },
  { text: '', state: 'down' },
  { text: 'kuyruk', state: 'matched' },
  { text: '', state: 'down' },
  { text: 'ağ / iletişim ağı', state: 'open' },
  { text: '', state: 'down' },
  { text: '', state: 'down' },
  { text: '', state: 'down' },
];

function MemoryVisual() {
  return (
    <Illustration className="lp-mini lp-v-memory">
      <div className="lp-mini-bar">
        <span>Hafıza Oyunu</span>
        <span>1 / 6 çift eşleşti</span>
      </div>
      <div className="lp-v-memory-grid">
        {memoryCards.map((card, i) => (
          <span
            key={i}
            className={card.english ? 'lp-en' : undefined}
            data-state={card.state}
            style={vars({ '--i': i })}
          >
            {card.text}
          </span>
        ))}
      </div>
    </Illustration>
  );
}

const searchRows = ['KLMBTRNS', 'PAWCHIOF', 'DQUEUEDG', 'AZYVLXEJ', 'TMKSWBYR', 'ACINFPLE'];
/** Cell key → how it is marked on the board. */
const searchMarks = new Map<string, string>([
  ...[1, 2, 3, 4, 5].map((col) => [`2-${col}`, 'found'] as [string, string]),
  ...[0, 1, 2, 3].map((row) => [`${row}-6`, 'found'] as [string, string]),
  ...[2, 3, 4].map((row) => [`${row}-0`, 'selecting'] as [string, string]),
]);

function WordSearchVisual() {
  return (
    <Illustration className="lp-mini lp-v-search">
      <div className="lp-mini-bar">
        <span>Kelime Avı</span>
        <span>2 / 3 bulundu</span>
      </div>
      <div className="lp-v-search-body">
        <div className="lp-v-search-grid">
          {searchRows.flatMap((row, r) =>
            [...row].map((letter, c) => (
              <span
                key={`${r}-${c}`}
                data-mark={searchMarks.get(`${r}-${c}`)}
                style={vars({ '--i': r + c })}
              >
                {letter}
              </span>
            )),
          )}
        </div>
        <ul className="lp-v-clues">
          <li data-done="true">
            <CheckGlyph /> kuyruk
          </li>
          <li data-done="true">
            <CheckGlyph /> düğüm
          </li>
          <li>veri</li>
        </ul>
      </div>
    </Illustration>
  );
}

/** Crossword letters by cell; the animated ones are typed in order. */
const crossword: { r: number; c: number; letter: string; number?: number; typed?: number }[] = [
  { r: 0, c: 3, letter: 'Q', number: 1 },
  { r: 2, c: 3, letter: 'E' },
  { r: 3, c: 3, letter: 'U' },
  { r: 4, c: 3, letter: 'E' },
  { r: 0, c: 7, letter: '', number: 2 },
  { r: 2, c: 7, letter: '' },
  { r: 3, c: 7, letter: '' },
  ...[...'RECURSION'].map((letter, c) => ({
    r: 1,
    c,
    letter,
    ...(c === 0 ? { number: 3 } : {}),
    ...(c === 3 ? {} : { typed: c > 3 ? c - 1 : c }),
  })),
];

function CrosswordVisual() {
  return (
    <Illustration className="lp-mini lp-v-crossword">
      <div className="lp-mini-bar">
        <span>Çapraz Bulmaca</span>
        <span>Taslağın kaydedildi</span>
      </div>
      <div className="lp-v-cross-body">
        <div className="lp-v-cross-grid">
          {crossword.map((cell) => (
            <span
              key={`${cell.r}-${cell.c}`}
              style={vars({ gridRow: cell.r + 1, gridColumn: cell.c + 1, '--i': cell.typed ?? 0 })}
              data-typed={cell.typed === undefined ? undefined : 'true'}
              data-active={cell.r === 2 && cell.c === 7 ? 'true' : undefined}
            >
              {cell.number ? <small>{cell.number}</small> : null}
              {cell.letter}
            </span>
          ))}
        </div>
        <ul className="lp-v-clues">
          <li data-done="true">
            <b>1 ↓</b> kuyruk
          </li>
          <li>
            <b>2 ↓</b> düğüm
          </li>
          <li data-done="typing">
            <b>3 →</b> özyineleme
          </li>
        </ul>
      </div>
    </Illustration>
  );
}
