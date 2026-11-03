import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  canAssemble,
  distinctPairs,
  eligible,
  meaningKey,
  overlaps,
  quizQuestions,
  scrambled,
  type Snapshot,
  type GameItem,
} from '../../lib/games';
import { Quiz } from './QuizPage';
import { Matching } from './MatchingPage';
import { Assembly } from './AssemblyPage';
import { Memory } from './MemoryPage';

const word = (english: string, ...meanings: string[]): Snapshot => ({
  wordId: english,
  english,
  meanings,
});
const words = [
  word('apple', 'elma'),
  word('pear', 'armut'),
  word('melon', 'kavun'),
  word('grape', 'üzüm'),
];
afterEach(() => vi.useRealTimers());
describe('game selection', () => {
  it('uses Turkish normalization including dotted I', () => {
    expect(meaningKey('  İSİM  ')).toBe('isim');
    expect(meaningKey('IŞIK')).toBe('ışık');
  });
  it('detects intersections across all meanings', () =>
    expect(overlaps(word('big', 'iri', 'büyük'), word('large', 'BÜYÜK'))).toBe(true));
  it('keeps distinct multiple meaning groups together', () =>
    expect(
      distinctPairs([word('run', 'koşmak', 'çalıştırmak'), word('walk', 'yürümek')], 5),
    ).toHaveLength(2));
  it('does not allow overlapping pairs', () => {
    const pairs = distinctPairs([...words, word('fruit', 'elma', 'armut')], 5);
    for (const a of pairs) for (const b of pairs) if (a !== b) expect(overlaps(a, b)).toBe(false);
  });
  it('finds a compatible group even when a broad meaning group appears first', () =>
    expect(distinctPairs([word('broad', 'elma', 'armut', 'kavun'), ...words], 4)).toHaveLength(4));
  it('constructs exactly four unambiguous options', () => {
    for (const q of quizQuestions(words)) {
      expect(q.options).toHaveLength(4);
      expect(q.options.filter((o) => o.wordId === q.target.wordId)).toHaveLength(1);
      for (const a of q.options)
        for (const b of q.options) if (a !== b) expect(overlaps(a, b)).toBe(false);
    }
  });
  it('rejects an ambiguous fourth option', () =>
    expect(quizQuestions([...words.slice(0, 3), word('fruit', 'elma')])).toHaveLength(0));
  it('uses shorter valid rounds and never repeats targets', () => {
    const questions = quizQuestions(words);
    expect(questions).toHaveLength(4);
    expect(new Set(questions.map((q) => q.target.wordId)).size).toBe(4);
  });
  it('changes option placement with random input', () =>
    expect(quizQuestions(words, () => 0)).not.toEqual(quizQuestions(words, () => 0.99)));
  it.each(['ab', 'abcdefghijklm', 'take off', 'ice-cream', "can't", 'word2', 'çay'])(
    'excludes %s without modification',
    (text) => expect(eligible(word(text, 'anlam'))).toBe(false),
  );
  it.each(['cat', 'LETTER', 'abcdefghijkl'])('accepts %s', (text) =>
    expect(eligible(word(text, 'anlam'))).toBe(true),
  );
  it('scrambles while preserving repeated letters', () => {
    const letters = scrambled('letter');
    expect(letters.slice().sort()).toEqual([...'letter'].sort());
    expect(letters.join('')).not.toBe('letter');
  });
  it('handles a word containing only repeated letters', () =>
    expect(scrambled('aaa')).toEqual(['a', 'a', 'a']));
  it('does not reuse unavailable tiles', () => {
    expect(canAssemble('LETter', 'letter')).toBe(true);
    expect(canAssemble('ttt', 'letter')).toBe(false);
    expect(canAssemble('z', 'letter')).toBe(false);
  });
});
describe('Klasik test interaction', () => {
  it('shows correct feedback and submits factual results', () => {
    const done = vi.fn<(items: GameItem[]) => void>();
    render(<Quiz words={words} done={done} />);
    for (let i = 0; i < 4; i++) {
      const target = screen.getByRole('heading', { level: 2 }).textContent;
      fireEvent.click(
        screen.getByRole('button', {
          name: words.find((w) => w.english === target)!.meanings.join(' / '),
        }),
      );
      expect(screen.getByRole('status').textContent).toBe('Doğru.');
      fireEvent.click(
        screen.getByRole('button', { name: i === 3 ? 'Turu tamamla' : 'Sonraki soru' }),
      );
    }
    expect(done).toHaveBeenCalledOnce();
    expect(done.mock.calls[0]![0]).toHaveLength(4);
  });
  it('reveals the answer after an incorrect selection and locks reselection', () => {
    render(<Quiz words={words} done={vi.fn()} />);
    const target = screen.getByRole('heading').textContent;
    const wrong = words.find((w) => w.english !== target)!;
    fireEvent.click(screen.getByRole('button', { name: wrong.meanings.join(' / ') }));
    expect(screen.getByRole('status').textContent).toContain('Yanlış. Doğru cevap:');
    fireEvent.click(screen.getAllByRole('button')[0]!);
    expect(screen.getByRole('status').textContent).toContain('Yanlış.');
  });
  it('explains insufficient candidates', () => {
    render(<Quiz words={words.slice(0, 3)} done={vi.fn()} />);
    expect(screen.getByRole('status').textContent).toContain('en az dört');
  });
});
describe('matching interaction', () => {
  it('handles wrong and repeated selections and completes two pairs', () => {
    const done = vi.fn<(items: GameItem[]) => void>();
    render(<Matching words={words.slice(0, 2)} done={done} />);
    fireEvent.click(screen.getByRole('button', { name: 'elma' }));
    expect(screen.getByRole('status').textContent).toContain('Önce');
    fireEvent.click(screen.getByRole('button', { name: 'apple' }));
    fireEvent.click(screen.getByRole('button', { name: 'apple' }));
    expect(screen.getByRole('button', { name: 'apple' }).getAttribute('aria-pressed')).toBe('true');
    fireEvent.click(screen.getByRole('button', { name: 'armut' }));
    expect(screen.getByRole('status').textContent).toContain('eşleşmiyor');
    fireEvent.click(screen.getByRole('button', { name: 'elma' }));
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'apple ✓' }).disabled).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'pear' }));
    fireEvent.click(screen.getByRole('button', { name: 'armut' }));
    fireEvent.click(screen.getByRole('button', { name: 'Turu tamamla' }));
    expect(
      done.mock.calls[0]![0].find((item: Snapshot) => item.english === 'apple')!.attempts,
    ).toBe(2);
  });
  it('rejects fewer than two distinct pairs', () => {
    render(<Matching words={[words[0]!]} done={vi.fn()} />);
    expect(screen.getByRole('status').textContent).toContain('en az iki');
  });
  it('marks rejections and pairs with glyphs and numbers, not color alone', () => {
    render(
      <Matching
        words={[word('run', 'koşmak', 'çalıştırmak'), word('walk', 'yürümek')]}
        done={vi.fn()}
      />,
    );
    fireEvent.click(screen.getByRole('button', { name: 'run' }));
    fireEvent.click(screen.getByRole('button', { name: 'yürümek' }));
    // A rejected meaning shows a cross until the next English choice.
    expect(screen.getByRole('button', { name: 'yürümek' }).querySelector('svg')).not.toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'walk' }));
    expect(screen.getByRole('button', { name: 'yürümek' }).querySelector('svg')).toBeNull();
    fireEvent.click(screen.getByRole('button', { name: 'yürümek' }));
    // Both halves of a pair show the same number.
    expect(within(screen.getByRole('button', { name: 'walk ✓' })).getByText('1')).toBeDefined();
    expect(within(screen.getByRole('button', { name: 'yürümek ✓' })).getByText('1')).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'run' }));
    // A meaning group keeps its separators in the button name.
    fireEvent.click(screen.getByRole('button', { name: 'koşmak / çalıştırmak' }));
    expect(within(screen.getByRole('button', { name: 'run ✓' })).getByText('2')).toBeDefined();
    expect(screen.getByRole('heading', { level: 2 }).textContent).toBe('Bütün çiftler eşleşti');
    expect(screen.getByRole('status').textContent).toContain('Bütün çiftler eşleşti.');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Turu tamamla' }));
  });
});
describe('assembly interaction', () => {
  it('moves focus from a consumed letter tile to the answer field', () => {
    render(<Assembly words={[word('letter', 'mektup')]} done={vi.fn()} />);
    const tile = screen.getByRole('button', { name: /^L harfi/ });
    tile.focus();
    fireEvent.click(tile);
    const input = screen.getByRole<HTMLInputElement>('textbox');
    expect(input.value).toBe('l');
    expect(document.activeElement).toBe(input);
    fireEvent.change(input, { target: { value: 'letter' } });
    fireEvent.submit(input.closest('form')!);
    expect(screen.getByRole('status').textContent).toBe('Doğru.');
    expect(document.activeElement).toBe(screen.getByRole('button', { name: 'Turu tamamla' }));
  });

  it('permits correcting a wrong keyboard answer and case-insensitive submission', () => {
    const done = vi.fn<(items: GameItem[]) => void>();
    render(<Assembly words={[word('letter', 'mektup')]} done={done} />);
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'ttt' } });
    expect((input as HTMLInputElement).value).toBe('');
    fireEvent.change(input, { target: { value: 'let' } });
    fireEvent.click(screen.getByRole('button', { name: 'Kontrol et' }));
    expect(screen.getByRole('status').textContent).toContain('Henüz');
    fireEvent.change(input, { target: { value: 'LETTER' } });
    fireEvent.submit(input.closest('form')!);
    expect(screen.getByRole('status').textContent).toBe('Doğru.');
    fireEvent.click(screen.getByRole('button', { name: 'Turu tamamla' }));
    expect(done.mock.calls[0]![0][0]).toMatchObject({ outcome: 'correct', attempts: 2 });
  });
  it('uses repeated tiles exactly as many times as available', () => {
    render(<Assembly words={[word('letter', 'mektup')]} done={vi.fn()} />);
    const t = screen.getAllByRole('button', { name: /^T harfi/ });
    fireEvent.click(t[0]!);
    const remaining = screen
      .getAllByRole('button', { name: /^T harfi/ })
      .find((b) => !(b as HTMLButtonElement).disabled)!;
    fireEvent.click(remaining);
    expect(screen.getByRole<HTMLInputElement>('textbox').value).toBe('tt');
    expect(
      screen
        .getAllByRole('button', { name: /^T harfi/ })
        .every((b) => (b as HTMLButtonElement).disabled),
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Son harfi sil' }));
    expect(screen.getByRole<HTMLInputElement>('textbox').value).toBe('t');
  });
  it('allows giving up and records a revealed answer', () => {
    const done = vi.fn<(items: GameItem[]) => void>();
    render(<Assembly words={[words[0]!]} done={done} />);
    fireEvent.click(screen.getByRole('button', { name: 'Cevabı göster ve geç' }));
    expect(screen.getByRole('status').textContent).toContain('apple');
    fireEvent.click(screen.getByRole('button', { name: 'Turu tamamla' }));
    expect(done.mock.calls[0]![0][0]!.outcome).toBe('revealed');
  });
  it('explains eligible vocabulary', () => {
    render(<Assembly words={[word('take off', 'havalanmak')]} done={vi.fn()} />);
    expect(screen.getByRole('status').textContent).toContain('3–12');
  });
});
describe('memory interaction', () => {
  it('hides all content from accessibility before reveal', () => {
    render(<Memory words={words.slice(0, 2)} done={vi.fn()} />);
    expect(screen.getAllByRole('button', { name: /Kapalı kart/ })).toHaveLength(4);
    expect(screen.queryByText('apple')).toBeNull();
  });
  it('locks input and double selections during a one-second mismatch', () => {
    vi.useFakeTimers();
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    render(<Memory words={words.slice(0, 2)} done={vi.fn()} />);
    const buttons = screen.getAllByRole('button');
    fireEvent.click(buttons[0]!);
    fireEvent.click(buttons[0]!);
    expect(screen.getAllByRole('button', { name: /Kapalı kart/ })).toHaveLength(3);
    fireEvent.click(buttons[2]!);
    expect(screen.getByRole('status').textContent).toContain('eşleşmedi');
    fireEvent.click(buttons[1]!);
    expect(screen.getAllByRole('button', { name: /Kapalı kart/ })).toHaveLength(2);
    void act(() => vi.advanceTimersByTime(999));
    expect(screen.getAllByRole('button', { name: /Kapalı kart/ })).toHaveLength(2);
    void act(() => vi.advanceTimersByTime(1));
    expect(screen.getAllByRole('button', { name: /Kapalı kart/ })).toHaveLength(4);
    vi.restoreAllMocks();
  });
  it('resolves pairs and completes factual outcomes', () => {
    vi.spyOn(Math, 'random').mockReturnValue(0.99);
    const done = vi.fn<(items: GameItem[]) => void>();
    render(<Memory words={words.slice(0, 2)} done={done} />);
    const buttons = screen.getAllByRole('button');
    for (const button of buttons) fireEvent.click(button);
    expect(within(buttons[0]!).getByText(/apple/)).toBeDefined();
    expect(screen.getByRole('status').textContent).toContain('eşleşti');
    fireEvent.click(screen.getByRole('button', { name: 'Turu tamamla' }));
    expect(done.mock.calls[0]![0]).toHaveLength(2);
    vi.restoreAllMocks();
  });
  it('requires at least two pairs', () => {
    render(<Memory words={words.slice(0, 1)} done={vi.fn()} />);
    expect(screen.getByRole('status').textContent).toContain('en az iki');
  });
});
