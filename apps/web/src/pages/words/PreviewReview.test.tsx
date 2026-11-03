import { fireEvent, render, screen, within } from '@testing-library/react';
import { describe, expect, it, vi } from 'vitest';
import type { Preview } from '../../lib/words';
import { PreviewReview } from './PreviewReview';

const candidate: Preview = {
  token: 'server-preview',
  canCommit: false,
  unresolvedDecisions: 1,
  invalid: [],
  counts: { newWords: 0, mergedWords: 0, newMeanings: 0, skippedMeanings: 0, duplicateEntries: 0 },
  rows: [
    {
      line: 3,
      english: 'execute',
      status: 'review',
      existingWordId: 'existing-word',
      warnings: [],
      meanings: [
        {
          turkish: 'calistirmak',
          status: 'possible_duplicate',
          similarity: { id: '3:1', existing: 'çalıştırmak', action: null },
        },
      ],
    },
  ],
};

// Server-provided selection states; these fixtures do not recompute domain decisions.
function selected(action: 'skip' | 'keep'): Preview {
  return {
    ...candidate,
    unresolvedDecisions: 0,
    canCommit: action === 'keep',
    rows: [
      {
        ...candidate.rows[0]!,
        status: action === 'keep' ? 'merge' : 'skipped',
        meanings: [
          {
            ...candidate.rows[0]!.meanings[0]!,
            status: action === 'keep' ? 'new' : 'similarity_skipped',
            similarity: { id: '3:1', existing: 'çalıştırmak', action },
          },
        ],
      },
    ],
  };
}

function show(preview = candidate, pending = false) {
  const decide = vi.fn();
  const confirm = vi.fn();
  const props = { preview, pending, decide, confirm };
  const view = render(<PreviewReview {...props} />);
  return { ...view, props, decide, confirm };
}

describe('possible-duplicate comparison presentation', () => {
  it('labels both actual values, identifies the source row and word, and removes repeated warnings', () => {
    show();
    expect(screen.getByRole('heading', { name: 'Benzer anlam bulundu' })).toBeDefined();
    const group = screen.getByRole('group', {
      name: 'Satır 3 · execute · calistirmak için seçim',
    });
    expect(group.tagName).toBe('FIELDSET');
    const preview = screen.getByRole('region', { name: 'Ekleme önizlemesi' });
    expect(preview.textContent).toContain('Satır 3 · execute');
    for (const [label, value] of [
      ['Mevcut anlam', 'çalıştırmak'],
      ['Girdiğin anlam', 'calistirmak'],
    ]) {
      const term = screen.getByText(label!);
      expect(term.tagName).toBe('DT');
      expect(term.nextElementSibling?.tagName).toBe('DD');
      expect(term.nextElementSibling?.textContent).toBe(value);
    }
    expect(preview.textContent).not.toMatch(
      /Benzer olabilir|seçim bekliyor|için karar ver|Benzer anlam için seçim yap/u,
    );
    expect(screen.getByRole('status').textContent).toBe(
      'Kaydetmek için 1 anlamla ilgili seçimini tamamla.',
    );
    expect(document.getElementById(group.getAttribute('aria-describedby')!)?.textContent).toContain(
      'Aynı olup olmadığına sen karar ver.',
    );
  });

  it('starts with neither native radio selected and exposes each option description', () => {
    show();
    const inputs = screen.getAllByRole<HTMLInputElement>('radio');
    expect(inputs.map((input) => input.checked)).toEqual([false, false]);
    expect(inputs[0]!.name).toBe(inputs[1]!.name);
    expect(inputs.every((input) => input.tabIndex === 0)).toBe(true);
    expect(
      inputs.map(
        (input) => document.getElementById(input.getAttribute('aria-describedby')!)?.textContent,
      ),
    ).toEqual(['Mevcut anlamı koru.', 'Yeni girişi ayrı anlam olarak kaydet.']);
  });

  it.each([
    ['skip', 'Mevcut anlamı koru.', 'Aynı anlam, ekleme'],
    ['keep', 'Yeni girişi ayrı anlam olarak kaydet.', 'Farklı anlam olarak ekle'],
  ] as const)(
    'selects %s by clicking its supporting text and preserves the decision identifier',
    (action, hint, title) => {
      const { decide, confirm, rerender, props } = show();
      fireEvent.click(screen.getByText(hint));
      expect(decide).toHaveBeenCalledExactlyOnceWith({ id: '3:1', action });
      expect(confirm).not.toHaveBeenCalled();
      rerender(<PreviewReview {...props} preview={selected(action)} />);
      expect(screen.getByRole<HTMLInputElement>('radio', { name: title }).checked).toBe(true);
      expect(
        screen.getAllByRole<HTMLInputElement>('radio').filter((input) => input.checked),
      ).toHaveLength(1);
    },
  );

  it('allows changing a resolved choice without confirming or changing its source ID', () => {
    const { decide, confirm, rerender, props } = show(selected('skip'));
    fireEvent.click(screen.getByRole('radio', { name: 'Farklı anlam olarak ekle' }));
    expect(decide).toHaveBeenLastCalledWith({ id: '3:1', action: 'keep' });
    rerender(<PreviewReview {...props} preview={selected('keep')} />);
    expect(
      screen.getByRole<HTMLInputElement>('radio', { name: 'Aynı anlam, ekleme' }).checked,
    ).toBe(false);
    expect(
      screen.getByRole<HTMLInputElement>('radio', { name: 'Farklı anlam olarak ekle' }).checked,
    ).toBe(true);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('keeps candidates in the same row and other rows in separate, clearly named groups', () => {
    const preview: Preview = {
      ...candidate,
      unresolvedDecisions: 2,
      rows: [
        {
          ...selected('keep').rows[0]!,
          meanings: [
            selected('keep').rows[0]!.meanings[0]!,
            {
              turkish: 'yurutmek',
              status: 'possible_duplicate',
              similarity: { id: '3:2', existing: 'yürütmek', action: null },
            },
          ],
        },
        {
          ...candidate.rows[0]!,
          line: 7,
          english: 'learn',
          meanings: [
            {
              turkish: 'ogrenmek',
              status: 'possible_duplicate',
              similarity: { id: '7:1', existing: 'öğrenmek', action: null },
            },
          ],
        },
      ],
    };
    const { decide } = show(preview);
    const groups = screen.getAllByRole('group');
    expect(groups).toHaveLength(3);
    const first = within(
      screen.getByRole('group', { name: 'Satır 3 · execute · calistirmak için seçim' }),
    );
    const second = within(
      screen.getByRole('group', { name: 'Satır 3 · execute · yurutmek için seçim' }),
    );
    const third = within(
      screen.getByRole('group', { name: 'Satır 7 · learn · ogrenmek için seçim' }),
    );
    const names = groups.map(
      (group) => within(group).getAllByRole<HTMLInputElement>('radio')[0]!.name,
    );
    expect(new Set(names).size).toBe(3);
    fireEvent.click(second.getByText('Mevcut anlamı koru.'));
    expect(decide).toHaveBeenLastCalledWith({ id: '3:2', action: 'skip' });
    expect(
      first.getByRole<HTMLInputElement>('radio', { name: 'Farklı anlam olarak ekle' }).checked,
    ).toBe(true);
    expect(third.getAllByRole<HTMLInputElement>('radio').every((input) => !input.checked)).toBe(
      true,
    );
    fireEvent.click(third.getByText('Yeni girişi ayrı anlam olarak kaydet.'));
    expect(decide).toHaveBeenLastCalledWith({ id: '7:1', action: 'keep' });
  });

  it('blocks saving while a decision is unresolved, even if canCommit is true', () => {
    const { confirm } = show({ ...candidate, canCommit: true });
    const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Onayla ve kaydet' });
    expect(button.disabled).toBe(true);
    fireEvent.click(button);
    expect(confirm).not.toHaveBeenCalled();
  });

  it('ignores every choice while a server preview is pending, without disabling the rows', () => {
    const { decide } = show(candidate, true);
    const group = screen.getByRole<HTMLFieldSetElement>('group');
    expect(group.disabled).toBe(false);
    expect(screen.getAllByRole('radio').some((input) => input.matches(':disabled'))).toBe(false);
    fireEvent.click(screen.getByText('Mevcut anlamı koru.'));
    fireEvent.click(screen.getByText('Yeni girişi ayrı anlam olarak kaydet.'));
    expect(decide).not.toHaveBeenCalled();
    expect(screen.getAllByRole<HTMLInputElement>('radio').every((input) => !input.checked)).toBe(
      true,
    );
  });

  it('keeps keyboard focus on the chosen radio after the pending server response', () => {
    const { rerender, props } = show();
    const radio = screen.getByRole<HTMLInputElement>('radio', { name: 'Farklı anlam olarak ekle' });
    radio.focus();
    expect(document.activeElement).toBe(radio);
    expect(radio.checked).toBe(false);
    fireEvent.click(radio);
    rerender(<PreviewReview {...props} pending />);
    rerender(<PreviewReview {...props} preview={selected('keep')} />);
    expect(document.activeElement).toBe(radio);
    expect(radio.checked).toBe(true);
  });
});

// Three independent candidates: 3:1 already resolved by the server (keep), 3:2 and 7:1 open.
const multiple: Preview = {
  ...candidate,
  unresolvedDecisions: 2,
  rows: [
    {
      ...selected('keep').rows[0]!,
      meanings: [
        selected('keep').rows[0]!.meanings[0]!,
        {
          turkish: 'yurutmek',
          status: 'possible_duplicate',
          similarity: { id: '3:2', existing: 'yürütmek', action: null },
        },
      ],
    },
    {
      ...candidate.rows[0]!,
      line: 7,
      english: 'learn',
      meanings: [
        {
          turkish: 'ogrenmek',
          status: 'possible_duplicate',
          similarity: { id: '7:1', existing: 'öğrenmek', action: null },
        },
      ],
    },
  ],
};

const row = (radio: HTMLElement) => radio.closest('label')!;
const spinners = () => document.querySelectorAll('.animate-spin');
const radioIn = (groupName: string, name: string) =>
  within(screen.getByRole('group', { name: groupName })).getByRole<HTMLInputElement>('radio', {
    name,
  });

describe('immediate feedback for a pending similarity decision', () => {
  it('shows the chosen row as selected at once, with an inline busy cue and no grey flash', () => {
    const { decide, rerender, props } = show();
    fireEvent.click(screen.getByText('Yeni girişi ayrı anlam olarak kaydet.'));
    expect(decide).toHaveBeenCalledExactlyOnceWith({ id: '3:1', action: 'keep' });
    // The dialog marks the request as pending; the server preview has not changed yet.
    rerender(<PreviewReview {...props} pending />);

    const keep = screen.getByRole<HTMLInputElement>('radio', { name: 'Farklı anlam olarak ekle' });
    const skip = screen.getByRole<HTMLInputElement>('radio', { name: 'Aynı anlam, ekleme' });
    expect(keep.checked).toBe(true);
    expect(skip.checked).toBe(false);
    expect(row(keep).classList.contains('bg-accent-soft')).toBe(true);
    for (const radio of [keep, skip]) {
      expect(radio.disabled).toBe(false);
      expect(row(radio).className).not.toMatch(/bg-disabled|text-on-disabled|cursor-not-allowed/);
      expect(row(radio).classList.contains('cursor-progress')).toBe(true);
    }
    // Spinner in the chosen row's reserved slot, plus a polite text announcement.
    expect(row(keep).querySelector('.animate-spin')).not.toBeNull();
    expect(row(skip).querySelector('.animate-spin')).toBeNull();
    expect(screen.getByRole('group').getAttribute('aria-busy')).toBe('true');
    expect(screen.getByText('Seçimin uygulanıyor, önizleme güncelleniyor.')).toBeDefined();

    // The server answer replaces the pending presentation.
    rerender(<PreviewReview {...props} preview={selected('keep')} />);
    expect(keep.checked).toBe(true);
    expect(row(keep).querySelector('.animate-spin')).toBeNull();
    expect(screen.getByRole('group').hasAttribute('aria-busy')).toBe(false);
  });

  it('ignores quick repeated and conflicting clicks until the server answers', () => {
    const { decide, rerender, props } = show();
    fireEvent.click(screen.getByText('Yeni girişi ayrı anlam olarak kaydet.'));
    rerender(<PreviewReview {...props} pending />);
    fireEvent.click(screen.getByText('Mevcut anlamı koru.'));
    fireEvent.click(screen.getByRole('radio', { name: 'Aynı anlam, ekleme' }));
    fireEvent.click(screen.getByText('Yeni girişi ayrı anlam olarak kaydet.'));
    expect(decide).toHaveBeenCalledTimes(1);
    expect(
      screen.getByRole<HTMLInputElement>('radio', { name: 'Farklı anlam olarak ekle' }).checked,
    ).toBe(true);
    expect(
      screen.getByRole<HTMLInputElement>('radio', { name: 'Aynı anlam, ekleme' }).checked,
    ).toBe(false);
  });

  it('falls back to the unchanged server preview when the request fails', () => {
    const { decide, rerender, props } = show();
    fireEvent.click(screen.getByText('Yeni girişi ayrı anlam olarak kaydet.'));
    rerender(<PreviewReview {...props} pending />);
    // Failure: pending ends but the preview (and its token) stay as they were.
    rerender(<PreviewReview {...props} />);
    expect(screen.getAllByRole<HTMLInputElement>('radio').every((input) => !input.checked)).toBe(
      true,
    );
    expect(spinners()).toHaveLength(0);
    // The student can choose again.
    fireEvent.click(screen.getByText('Mevcut anlamı koru.'));
    expect(decide).toHaveBeenLastCalledWith({ id: '3:1', action: 'skip' });
  });

  it('shows the server result when it differs from the pending choice', () => {
    const { rerender, props } = show();
    fireEvent.click(screen.getByText('Yeni girişi ayrı anlam olarak kaydet.'));
    rerender(<PreviewReview {...props} pending />);
    rerender(<PreviewReview {...props} preview={selected('skip')} />);
    expect(
      screen.getByRole<HTMLInputElement>('radio', { name: 'Aynı anlam, ekleme' }).checked,
    ).toBe(true);
    expect(
      screen.getByRole<HTMLInputElement>('radio', { name: 'Farklı anlam olarak ekle' }).checked,
    ).toBe(false);
  });

  it('keeps pending feedback inside the decided group when several candidates exist', () => {
    const first = 'Satır 3 · execute · calistirmak için seçim';
    const second = 'Satır 3 · execute · yurutmek için seçim';
    const third = 'Satır 7 · learn · ogrenmek için seçim';
    const { decide, rerender, props } = show(multiple);
    fireEvent.click(radioIn(second, 'Aynı anlam, ekleme'));
    expect(decide).toHaveBeenCalledExactlyOnceWith({ id: '3:2', action: 'skip' });
    rerender(<PreviewReview {...props} pending />);

    expect(radioIn(first, 'Farklı anlam olarak ekle').checked).toBe(true); // server state
    expect(radioIn(second, 'Aynı anlam, ekleme').checked).toBe(true); // pending
    expect(radioIn(third, 'Aynı anlam, ekleme').checked).toBe(false);
    expect(radioIn(third, 'Farklı anlam olarak ekle').checked).toBe(false);
    expect(screen.getByRole('group', { name: second }).getAttribute('aria-busy')).toBe('true');
    for (const name of [first, third])
      expect(screen.getByRole('group', { name }).hasAttribute('aria-busy')).toBe(false);
    expect(
      row(radioIn(second, 'Aynı anlam, ekleme')).querySelector('.animate-spin'),
    ).not.toBeNull();

    // Other groups are locked too (one request at a time), but not disabled.
    fireEvent.click(radioIn(third, 'Farklı anlam olarak ekle'));
    expect(decide).toHaveBeenCalledTimes(1);
    expect(radioIn(third, 'Farklı anlam olarak ekle').disabled).toBe(false);
  });

  it('does not show an earlier choice as pending while saving', () => {
    const { rerender, props } = show();
    fireEvent.click(screen.getByText('Yeni girişi ayrı anlam olarak kaydet.'));
    rerender(<PreviewReview {...props} pending />);
    rerender(<PreviewReview {...props} preview={selected('keep')} />);
    fireEvent.click(screen.getByRole('button', { name: 'Onayla ve kaydet' }));
    // The dialog's commit request is now pending.
    rerender(<PreviewReview {...props} preview={selected('keep')} pending />);
    expect(screen.getByRole('group').hasAttribute('aria-busy')).toBe(false);
    const keep = screen.getByRole('radio', { name: 'Farklı anlam olarak ekle' });
    expect(row(keep).querySelector('.animate-spin')).toBeNull();
  });
});

describe('why saving is unavailable', () => {
  const description = (button: HTMLElement) =>
    (button.getAttribute('aria-describedby') ?? '')
      .split(' ')
      .filter(Boolean)
      .map((id) => document.getElementById(id)?.textContent);

  it('explains next to the disabled button when a skip leaves nothing to save', () => {
    show(selected('skip'));
    const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Onayla ve kaydet' });
    expect(button.disabled).toBe(true);
    const reason = button.previousElementSibling!;
    expect(reason.getAttribute('role')).toBe('status');
    expect(reason.textContent).toBe(
      'Seçimlerine göre bu anlamlar atlanacak. Kaydedilecek yeni anlam yok.',
    );
    expect(reason.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(description(button)).toEqual([reason.textContent]);
  });

  it('explains an all-duplicate preview the same way', () => {
    show({
      ...candidate,
      unresolvedDecisions: 0,
      rows: [
        {
          ...candidate.rows[0]!,
          status: 'duplicate',
          meanings: [{ turkish: 'çalıştırmak', status: 'existing' }],
        },
      ],
    });
    const button = screen.getByRole('button', { name: 'Onayla ve kaydet' });
    expect(description(button)).toEqual([
      'Bu kelime ve anlam zaten listende var. Hiçbir değişiklik kaydedilmeyecek.',
    ]);
    expect(screen.getAllByRole('status')).toHaveLength(1);
  });

  it('points to every visible reason: open decisions and invalid rows', () => {
    show({ ...candidate, invalid: [{ line: 9, codes: ['ENGLISH_REQUIRED'] }] });
    const button = screen.getByRole('button', { name: 'Onayla ve kaydet' });
    expect(description(button)).toEqual([
      'Kaydetmek için 1 anlamla ilgili seçimini tamamla.',
      'Hatalı satırları düzeltip yeniden önizle. Hiçbir kelime kaydedilmedi.',
    ]);
  });

  it('has no description when saving is available', () => {
    show(selected('keep'));
    const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Onayla ve kaydet' });
    expect(button.disabled).toBe(false);
    expect(button.hasAttribute('aria-describedby')).toBe(false);
    expect(screen.queryByText(/Kaydedilecek yeni/)).toBeNull();
  });
});

describe('preview region', () => {
  it('fades in as one region and exposes its heading to the dialog', () => {
    const headingRef = { current: null as HTMLHeadingElement | null };
    render(
      <PreviewReview
        preview={candidate}
        pending={false}
        confirm={vi.fn()}
        decide={vi.fn()}
        headingRef={headingRef}
      />,
    );
    const region = screen.getByRole('region', { name: 'Ekleme önizlemesi' });
    expect(region.classList.contains('fade-in')).toBe(true);
    expect(region.querySelectorAll('.fade-in')).toHaveLength(0);
    expect(headingRef.current?.textContent).toBe('Kaydetmeden önce incele');
  });
});
