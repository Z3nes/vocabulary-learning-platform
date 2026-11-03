import { routerReady } from '../../test/routerReady';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { buildRoutes } from '../../router';
import type { Preview, Submission, Word } from '../../lib/words';

const listId = 'e542713d-a716-401f-8986-f6437921ed14';
const run: Word = {
  id: 'word-run',
  english: 'run',
  meanings: [{ id: 'meaning-1', turkish: 'koşmak', position: 0 }],
};
const merged: Word = {
  ...run,
  meanings: [...run.meanings, { id: 'meaning-2', turkish: 'çalıştırmak', position: 1 }],
};
const newPreview: Preview = {
  token: 'receipt',
  canCommit: true,
  unresolvedDecisions: 0,
  invalid: [],
  rows: [
    {
      line: 1,
      english: 'run',
      existingWordId: null,
      status: 'new',
      meanings: [{ turkish: 'koşmak', status: 'new' }],
      warnings: [],
    },
  ],
  counts: { newWords: 1, mergedWords: 0, newMeanings: 1, skippedMeanings: 0, duplicateEntries: 0 },
};
const mergePreview: Preview = {
  ...newPreview,
  rows: [
    {
      ...newPreview.rows[0]!,
      status: 'merge',
      existingWordId: run.id,
      meanings: [
        { turkish: 'koşmak', status: 'existing' },
        { turkish: 'çalıştırmak', status: 'new' },
      ],
    },
  ],
  counts: { newWords: 0, mergedWords: 1, newMeanings: 1, skippedMeanings: 1, duplicateEntries: 0 },
};
const duplicatePreview: Preview = {
  ...newPreview,
  canCommit: false,
  rows: [
    {
      ...newPreview.rows[0]!,
      status: 'duplicate',
      existingWordId: run.id,
      meanings: [{ turkish: 'koşmak', status: 'existing' }],
    },
  ],
  counts: { newWords: 0, mergedWords: 0, newMeanings: 0, skippedMeanings: 1, duplicateEntries: 1 },
};
const possiblePreview: Preview = {
  ...newPreview,
  token: 'pending-choice',
  canCommit: false,
  unresolvedDecisions: 1,
  rows: [
    {
      ...newPreview.rows[0]!,
      status: 'review',
      existingWordId: run.id,
      meanings: [
        {
          turkish: 'calismak',
          status: 'possible_duplicate',
          similarity: { id: '1:1', existing: 'çalışmak', action: null },
        },
      ],
    },
  ],
  counts: { newWords: 0, mergedWords: 0, newMeanings: 0, skippedMeanings: 0, duplicateEntries: 0 },
};
function resolvedSimilarity(action: 'skip' | 'keep'): Preview {
  return {
    ...possiblePreview,
    token: `choice-${action}`,
    unresolvedDecisions: 0,
    canCommit: action === 'keep',
    rows: [
      {
        ...possiblePreview.rows[0]!,
        status: action === 'keep' ? 'merge' : 'skipped',
        meanings: [
          {
            turkish: 'calismak',
            status: action === 'keep' ? 'new' : 'similarity_skipped',
            similarity: { id: '1:1', existing: 'çalışmak', action },
          },
        ],
      },
    ],
    counts: {
      newWords: 0,
      mergedWords: action === 'keep' ? 1 : 0,
      newMeanings: action === 'keep' ? 1 : 0,
      skippedMeanings: action === 'skip' ? 1 : 0,
      duplicateEntries: 0,
    },
  };
}
const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const fetchMock = vi.fn<(url: string, options?: RequestInit) => Promise<Response>>();
let stored: Word[];
let committed: Word[];
let proposal: Preview;
let staleOnce: boolean;
let wordError: boolean;
let editError: string | undefined;
beforeEach(() => {
  stored = [];
  committed = [run];
  proposal = structuredClone(newPreview);
  staleOnce = false;
  wordError = false;
  editError = undefined;
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, options) => {
    if (url.endsWith('/preview')) return Promise.resolve(json(proposal));
    if (url.endsWith('/commit')) {
      if (staleOnce) {
        staleOnce = false;
        proposal = structuredClone(mergePreview);
        return Promise.resolve(json({ error: { code: 'PREVIEW_STALE' } }, 409));
      }
      stored = committed;
      return Promise.resolve(json({ ...proposal, changed: proposal.canCommit }));
    }
    if (options?.method === 'PATCH') {
      if (editError) return Promise.resolve(json({ error: { code: editError } }, 409));
      const input = JSON.parse(options.body as string) as { english: string; meanings: string[] };
      stored = [
        {
          ...run,
          english: input.english,
          meanings: input.meanings.map((turkish, position) => ({
            id: `replacement-${position}`,
            turkish,
            position,
          })),
        },
      ];
      return Promise.resolve(json({ word: stored[0], changed: true }));
    }
    if (options?.method === 'DELETE') {
      stored = [];
      return Promise.resolve(new Response(null, { status: 204 }));
    }
    if (url.endsWith('/words'))
      return wordError
        ? Promise.reject(new Error('offline'))
        : Promise.resolve(json({ words: stored }));
    const list = {
      id: listId,
      title: 'Algorithms',
      wordCount: stored.length,
      createdAt: '2026-10-21T10:00:00Z',
      updatedAt: '2026-10-21T10:00:00Z',
    };
    return Promise.resolve(json(url.endsWith('/lists') ? { lists: [list] } : { list }));
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => vi.unstubAllGlobals());
async function start() {
  const router = createMemoryRouter(buildRoutes({ includeDevRoutes: false }), {
    basename: '/kelime',
    initialEntries: [`/kelime/lists/${listId}`],
  });
  await routerReady(router);
  render(<RouterProvider router={router} />);
  return router;
}
async function open(action: 'add' | 'bulk' | 'edit' | 'delete' = 'add') {
  const trigger = await screen.findByRole('button', {
    name: {
      add: 'Kelime ekle',
      bulk: 'Toplu ekle',
      edit: 'run kelimesini düzenle',
      delete: 'run kelimesini sil',
    }[action],
  });
  trigger.focus();
  fireEvent.click(trigger);
  const dialog = screen.getByRole<HTMLDialogElement>('dialog', {
    name: {
      add: 'Kelime ekle',
      bulk: 'Toplu kelime ekle',
      edit: 'Kelimeyi düzenle',
      delete: 'Kelimeyi sil',
    }[action],
  });
  return { dialog, trigger };
}
function fillSingle(english = 'run', meaning = 'koşmak') {
  fireEvent.change(screen.getByRole('textbox', { name: /İngilizce kelime/ }), {
    target: { value: english },
  });
  fireEvent.change(screen.getByRole('textbox', { name: /Türkçe anlam 1/ }), {
    target: { value: meaning },
  });
}
function showPreview() {
  fireEvent.click(screen.getByRole('button', { name: /Önizlemeyi göster/ }));
}
const requests = (suffix: string) => fetchMock.mock.calls.filter(([url]) => url.endsWith(suffix));

describe('vocabulary screens with a mocked API (not PostgreSQL evidence)', () => {
  it('keeps an active word search clearable after deletion drops below the search threshold', async () => {
    stored = [
      run,
      ...Array.from({ length: 7 }, (_, i) => ({ ...run, id: `word-${i}`, english: `term-${i}` })),
    ];
    const implementation = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url, options) => {
      if (options?.method === 'DELETE') {
        stored = stored.filter((word) => word.id !== run.id);
        return Promise.resolve(new Response(null, { status: 204 }));
      }
      return implementation(url, options);
    });
    await start();
    fireEvent.change(await screen.findByRole('searchbox', { name: 'Kelimelerde ara' }), {
      target: { value: 'run' },
    });
    expect(screen.queryByRole('heading', { name: 'term-0' })).toBeNull();
    const { dialog } = await open('delete');
    fireEvent.click(within(dialog).getByRole('button', { name: 'Kelimeyi sil' }));
    await screen.findByText(/ile eşleşen bir kelime ya da anlam yok/);
    const search = screen.getByRole<HTMLInputElement>('searchbox', { name: 'Kelimelerde ara' });
    expect(search.value).toBe('run');
    search.focus();
    fireEvent.change(search, { target: { value: '' } });
    expect(document.activeElement).toBe(search);
    expect(search.isConnected).toBe(true);
    expect(screen.getByRole('heading', { name: 'term-0' })).toBeDefined();
    expect(screen.getByRole('heading', { name: 'term-6' })).toBeDefined();
  });

  it('keeps format instructions and spreadsheet guidance visible with a compact example', async () => {
    await start();
    await open('bulk');
    expect(screen.getByText(/Her satıra bir İngilizce kelime veya ifade/).textContent).toMatch(
      /= veya TAB karakteriyle ayır; birden fazla anlam için ; kullan/,
    );
    expect(screen.getByText(/Excel veya Google Sheets/).textContent).toMatch(
      /Kaydetmeden önce önizlemeyi incele/,
    );
    const example = screen.getByText('Örnek biçimi gör').closest('details')!;
    expect(example.hasAttribute('open')).toBe(false);
    fireEvent.click(within(example).getByText('Örnek biçimi gör'));
    expect(example.textContent).toContain('binary search = ikili arama');
  });
  it.each(['single', 'bulk'] as const)(
    'requires an unselected explicit similarity choice in %s mode and re-previews it',
    async (kind) => {
      stored = [{ ...run, meanings: [{ id: 'original', turkish: 'çalışmak', position: 0 }] }];
      committed = [
        {
          ...run,
          meanings: [...stored[0]!.meanings, { id: 'ascii', turkish: 'calismak', position: 1 }],
        },
      ];
      proposal = possiblePreview;
      const implementation = fetchMock.getMockImplementation()!;
      fetchMock.mockImplementation((url, options) => {
        if (url.endsWith('/preview')) {
          const input = JSON.parse(options!.body as string) as Submission;
          return Promise.resolve(
            json(
              input.decisions?.[0]
                ? resolvedSimilarity(input.decisions[0].action)
                : possiblePreview,
            ),
          );
        }
        if (url.endsWith('/commit')) {
          stored = committed;
          return Promise.resolve(json({ ...resolvedSimilarity('keep'), changed: true }));
        }
        return implementation(url, options);
      });
      await start();
      await open(kind === 'bulk' ? 'bulk' : 'add');
      if (kind === 'bulk')
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'run=calismak' } });
      else fillSingle('run', 'calismak');
      showPreview();
      const skip = await screen.findByRole<HTMLInputElement>('radio', {
        name: 'Aynı anlam, ekleme',
      });
      const keep = screen.getByRole<HTMLInputElement>('radio', {
        name: 'Farklı anlam olarak ekle',
      });
      expect(skip.checked).toBe(false);
      expect(keep.checked).toBe(false);
      expect(screen.getByRole('heading', { name: 'Benzer anlam bulundu' })).toBeDefined();
      expect(screen.getByText('Mevcut anlam').nextElementSibling?.textContent).toBe('çalışmak');
      expect(screen.getByText('Girdiğin anlam').nextElementSibling?.textContent).toBe('calismak');
      expect(
        screen.getByRole<HTMLButtonElement>('button', { name: 'Onayla ve kaydet' }).disabled,
      ).toBe(true);
      keep.focus();
      fireEvent.click(keep);
      await waitFor(() =>
        expect(
          screen.getByRole<HTMLInputElement>('radio', { name: 'Farklı anlam olarak ekle' }).checked,
        ).toBe(true),
      );
      expect(document.activeElement).toBe(
        screen.getByRole('radio', { name: 'Farklı anlam olarak ekle' }),
      );
      expect(JSON.parse(requests('/preview')[1]![1]!.body as string)).toMatchObject({
        decisions: [{ id: '1:1', action: 'keep' }],
      });
      fireEvent.click(screen.getByRole('button', { name: 'Onayla ve kaydet' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(JSON.parse(requests('/commit')[0]![1]!.body as string)).toMatchObject({
        submission: { decisions: [{ id: '1:1', action: 'keep' }] },
        token: 'choice-keep',
      });
      expect(screen.getByText('çalışmak')).toBeDefined();
      expect(screen.getByText('calismak')).toBeDefined();
    },
  );
  it.each(['single', 'bulk'] as const)(
    'lets the student explicitly skip a possible duplicate in %s entry without claiming a saved addition',
    async (kind) => {
      proposal = possiblePreview;
      await start();
      await open(kind === 'bulk' ? 'bulk' : 'add');
      if (kind === 'bulk')
        fireEvent.change(screen.getByRole('textbox'), { target: { value: 'run=calismak' } });
      else fillSingle('run', 'calismak');
      showPreview();
      const skip = await screen.findByRole('radio', { name: 'Aynı anlam, ekleme' });
      proposal = resolvedSimilarity('skip');
      fireEvent.click(skip);
      expect(await screen.findByText(/Kaydedilecek yeni anlam yok/)).toBeDefined();
      expect(
        screen.getByRole<HTMLInputElement>('radio', { name: 'Aynı anlam, ekleme' }).checked,
      ).toBe(true);
      expect(screen.queryByText(/Bu kelime ve anlam zaten listende var/)).toBeNull();
      expect(requests('/commit')).toHaveLength(0);
    },
  );
  it('drops old similarity choices after a stale preview and requires a new decision', async () => {
    proposal = possiblePreview;
    await start();
    await open();
    fillSingle('run', 'calismak');
    showPreview();
    const keep = await screen.findByRole('radio', { name: 'Farklı anlam olarak ekle' });
    proposal = resolvedSimilarity('keep');
    fireEvent.click(keep);
    await waitFor(() =>
      expect(
        screen.getByRole<HTMLInputElement>('radio', { name: 'Farklı anlam olarak ekle' }).checked,
      ).toBe(true),
    );
    const implementation = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url, options) => {
      if (url.endsWith('/commit')) {
        proposal = possiblePreview;
        return Promise.resolve(json({ error: { code: 'PREVIEW_STALE' } }, 409));
      }
      return implementation(url, options);
    });
    fireEvent.click(screen.getByRole('button', { name: 'Onayla ve kaydet' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Önizlemeden sonra/);
    expect(JSON.parse(requests('/preview')[2]![1]!.body as string)).not.toHaveProperty('decisions');
    expect(
      screen.getByRole<HTMLInputElement>('radio', { name: 'Farklı anlam olarak ekle' }).checked,
    ).toBe(false);
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Onayla ve kaydet' }).disabled,
    ).toBe(true);
  });
  it('shows the empty state, real word count and base-path navigation', async () => {
    await start();
    expect(
      await screen.findByRole('heading', { name: 'Bu listende henüz kelime yok' }),
    ).toBeDefined();
    expect(screen.getByText(/0 kelime/)).toBeDefined();
    expect(screen.getByRole('link', { name: 'Listelerime dön' }).getAttribute('href')).toBe(
      '/kelime/lists',
    );
  });
  it('shows loading before the word response arrives', async () => {
    const implementation = fetchMock.getMockImplementation()!;
    let resolve!: (value: Response) => void;
    fetchMock.mockImplementation((url, options) =>
      url.endsWith('/words')
        ? new Promise((done) => {
            resolve = done;
          })
        : implementation(url, options),
    );
    await start();
    expect(await screen.findByText('Kelimelerin yükleniyor…')).toBeDefined();
    act(() => resolve(json({ words: [] })));
    expect(await screen.findByText('Bu listende henüz kelime yok')).toBeDefined();
  });
  it('shows network errors and allows retry', async () => {
    wordError = true;
    await start();
    expect(await screen.findByRole('alert')).toBeDefined();
    wordError = false;
    fireEvent.click(screen.getByRole('button', { name: 'Tekrar dene' }));
    expect(await screen.findByText('Bu listende henüz kelime yok')).toBeDefined();
  });
  it('requires preview and explicit confirmation, then refreshes words, counts and dashboard', async () => {
    const router = await start();
    const { trigger } = await open();
    fillSingle();
    showPreview();
    expect(await screen.findByText('Kaydetmeden önce incele')).toBeDefined();
    expect(requests('/commit')).toHaveLength(0);
    expect(JSON.parse(requests('/preview')[0]![1]!.body as string)).toEqual({
      kind: 'single',
      entry: { english: 'run', meanings: ['koşmak'] },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Onayla ve kaydet' }));
    expect(await screen.findByRole('heading', { name: 'run' })).toBeDefined();
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(trigger);
    expect(screen.getByText(/1 kelime ·/)).toBeDefined();
    expect(screen.getByText(/1 yeni kelime ve 1 yeni anlam kaydedildi/)).toBeDefined();
    await act(() => router.navigate('/lists'));
    expect(await screen.findByText(/1 kelime ·/)).toBeDefined();
    await act(() => router.navigate('/'));
    expect(await screen.findByText('1 kelime')).toBeDefined();
    expect(requests('/commit')).toHaveLength(1);
  });
  it('adds and removes meaning fields while preserving one required field', async () => {
    await start();
    await open();
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: '1. anlamı kaldır' }).disabled,
    ).toBe(true);
    fireEvent.click(screen.getByRole('button', { name: 'Anlam ekle' }));
    expect(screen.getByRole('textbox', { name: /Türkçe anlam 2/ })).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: '1. anlamı kaldır' }));
    expect(screen.queryByRole('textbox', { name: /Türkçe anlam 2/ })).toBeNull();
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: '1. anlamı kaldır' }).disabled,
    ).toBe(true);
  });
  it('sends multiple meaning fields as structured input', async () => {
    await start();
    await open();
    fillSingle();
    fireEvent.click(screen.getByRole('button', { name: 'Anlam ekle' }));
    fireEvent.change(screen.getByRole('textbox', { name: /Türkçe anlam 2/ }), {
      target: { value: 'çalıştırmak' },
    });
    showPreview();
    await screen.findByText('Kaydetmeden önce incele');
    expect(JSON.parse(requests('/preview')[0]![1]!.body as string)).toMatchObject({
      entry: { meanings: ['koşmak', 'çalıştırmak'] },
    });
  });
  it.each([
    ['', 'koşmak', /İngilizce kelimeyi/],
    ['run', ' ', /En az bir Türkçe anlam/],
    ['a'.repeat(121), 'anlam', /120 karakter/],
    ['run', 'a'.repeat(161), /160 karakter/],
  ])('validates the form before sending invalid input', async (english, meaning, expected) => {
    await start();
    await open();
    fillSingle(english, meaning);
    showPreview();
    expect((await screen.findByRole('alert')).textContent).toMatch(expected);
    expect(requests('/preview')).toHaveLength(0);
  });
  it('shows exact duplicates without a successful-save state or commit', async () => {
    stored = [run];
    proposal = duplicatePreview;
    await start();
    await open();
    fillSingle();
    showPreview();
    expect(await screen.findByText(/Bu kelime ve anlam zaten listende var/)).toBeDefined();
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Onayla ve kaydet' }).disabled,
    ).toBe(true);
    expect(screen.queryByText(/kaydedildi/)).toBeNull();
    expect(requests('/commit')).toHaveLength(0);
  });
  it('reviews a partially duplicated meaning merge and preserves one word', async () => {
    stored = [run];
    committed = [merged];
    proposal = mergePreview;
    await start();
    await open();
    fillSingle('run', 'çalıştırmak');
    showPreview();
    expect(await screen.findByText(/Listendeki kelimeye yeni anlam/)).toBeDefined();
    expect(screen.getByText(/koşmak — Listende var/)).toBeDefined();
    fireEvent.click(screen.getByRole('button', { name: 'Onayla ve kaydet' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(screen.getAllByRole('heading', { name: 'run' })).toHaveLength(1);
    expect(screen.getByText('çalıştırmak')).toBeDefined();
    expect(screen.getByText(/1 kelime ·/)).toBeDefined();
  });
  it('edits using a complete replacement of meanings and shows the saved values', async () => {
    stored = [merged];
    await start();
    await open('edit');
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: /İngilizce kelime/ }).value).toBe(
      'run',
    );
    fireEvent.change(screen.getByRole('textbox', { name: /İngilizce kelime/ }), {
      target: { value: 'execute' },
    });
    fireEvent.click(screen.getByRole('button', { name: '1. anlamı kaldır' }));
    fireEvent.change(screen.getByRole('textbox', { name: /Türkçe anlam 1/ }), {
      target: { value: 'yürütmek' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Değişiklikleri kaydet' }));
    expect(await screen.findByRole('heading', { name: 'execute' })).toBeDefined();
    expect(screen.getByText('yürütmek')).toBeDefined();
    expect(screen.queryByText('koşmak')).toBeNull();
    expect(requests('/preview')).toHaveLength(0);
    const patch = fetchMock.mock.calls.find(([, options]) => options?.method === 'PATCH')!;
    expect(JSON.parse(patch[1]!.body as string)).toEqual({
      english: 'execute',
      meanings: ['yürütmek'],
    });
  });
  it('rejects duplicate normalized meanings during editing', async () => {
    stored = [run];
    await start();
    await open('edit');
    fireEvent.click(screen.getByRole('button', { name: 'Anlam ekle' }));
    fireEvent.change(screen.getByRole('textbox', { name: /Türkçe anlam 2/ }), {
      target: { value: 'KOŞMAK' },
    });
    fireEvent.click(screen.getByRole('button', { name: 'Değişiklikleri kaydet' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Aynı anlamı/);
    expect(fetchMock.mock.calls.some(([, options]) => options?.method === 'PATCH')).toBe(false);
  });
  it('keeps edit conflicts visible without closing or silently merging', async () => {
    stored = [run];
    editError = 'WORD_ALREADY_EXISTS';
    proposal = mergePreview;
    await start();
    await open('edit');
    fireEvent.click(screen.getByRole('button', { name: 'Değişiklikleri kaydet' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Bu kelime listende zaten var/);
    expect(screen.getByRole('dialog')).toBeDefined();
    expect(screen.getByRole('link', { name: 'Listendeki kelimeye git' }).getAttribute('href')).toBe(
      '#word-word-run',
    );
  });
  it('requires deletion confirmation, starts focus on cancel and restores heading after deletion', async () => {
    stored = [run];
    await start();
    const { dialog, trigger } = await open('delete');
    expect(document.activeElement).toBe(within(dialog).getByRole('button', { name: 'Vazgeç' }));
    fireEvent.click(within(dialog).getByRole('button', { name: 'Vazgeç' }));
    await waitFor(() => expect(document.activeElement).toBe(trigger));
    expect(stored).toHaveLength(1);
    await open('delete');
    fireEvent.click(
      within(screen.getByRole('dialog')).getByRole('button', { name: 'Kelimeyi sil' }),
    );
    expect(await screen.findByText('Bu listende henüz kelime yok')).toBeDefined();
    await waitFor(() =>
      expect(document.activeElement).toBe(screen.getByRole('heading', { level: 1 })),
    );
  });
  it('supports native Escape close and restores add-trigger focus', async () => {
    await start();
    const { dialog, trigger } = await open();
    expect(document.activeElement).toBe(
      within(dialog).getByRole('textbox', { name: /İngilizce kelime/ }),
    );
    fireEvent(dialog, new Event('cancel', { cancelable: true }));
    act(() => dialog.close());
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(trigger);
    expect(requests('/commit')).toHaveLength(0);
  });
  it.each(['apple=elma\nrun=koşmak;çalıştırmak', 'apple\telma\r\nrun\tkoşmak; çalıştırmak'])(
    'passes plain text and spreadsheet input intact to server preview and commit',
    async (text) => {
      await start();
      await open('bulk');
      fireEvent.change(screen.getByRole('textbox', { name: 'Kelime ve anlamlarını yapıştır' }), {
        target: { value: text },
      });
      showPreview();
      await screen.findByText('Kaydetmeden önce incele');
      const input = JSON.parse(requests('/preview')[0]![1]!.body as string) as Submission;
      expect(input).toEqual({ kind: 'bulk', text: text.replace(/\r\n/gu, '\n') });
      fireEvent.click(screen.getByRole('button', { name: 'Onayla ve kaydet' }));
      await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
      expect(JSON.parse(requests('/commit')[0]![1]!.body as string)).toEqual({
        submission: input,
        token: proposal.token,
      });
      expect(screen.getByText(/yeni kelime ve/)).toBeDefined();
    },
  );
  it('shows comma hints and distinguishes repeated meanings', async () => {
    proposal = {
      ...newPreview,
      rows: [
        {
          ...newPreview.rows[0]!,
          warnings: ['COMMA_HINT'],
          meanings: [
            { turkish: 'sağlık, esenlik', status: 'new' },
            { turkish: 'sağlık, esenlik', status: 'repeated' },
          ],
        },
      ],
    };
    await start();
    await open('bulk');
    fireEvent.change(screen.getByRole('textbox'), {
      target: { value: 'well-being=sağlık, esenlik;sağlık, esenlik' },
    });
    showPreview();
    expect(
      await screen.findByText('Birden fazla anlam mı yazdın? Anlamları noktalı virgülle ayır.'),
    ).toBeDefined();
    expect(screen.getByText(/Bu girişte tekrar ediyor/)).toBeDefined();
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Onayla ve kaydet' }).disabled,
    ).toBe(false);
  });
  it('disables commit for malformed rows and requires correction and another preview', async () => {
    proposal = {
      ...newPreview,
      canCommit: false,
      invalid: [{ line: 2, codes: ['WORD_REQUIRED'] }],
    };
    await start();
    await open('bulk');
    const input = screen.getByRole('textbox');
    fireEvent.change(input, { target: { value: 'run=koşmak\n=eksik' } });
    showPreview();
    expect((await screen.findByRole('alert')).textContent).toMatch(/Satır 2: Geçersiz/);
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Onayla ve kaydet' }).disabled,
    ).toBe(true);
    fireEvent.change(input, { target: { value: 'run=koşmak' } });
    expect(screen.queryByText('Kaydetmeden önce incele')).toBeNull();
    proposal = newPreview;
    showPreview();
    await screen.findByText('Kaydetmeden önce incele');
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Onayla ve kaydet' }).disabled,
    ).toBe(false);
    expect(requests('/preview')).toHaveLength(2);
  });
  it('refreshes a stale preview and requires another explicit confirmation', async () => {
    staleOnce = true;
    committed = [merged];
    await start();
    await open();
    fillSingle();
    showPreview();
    await screen.findByText('Kaydetmeden önce incele');
    fireEvent.click(screen.getByRole('button', { name: 'Onayla ve kaydet' }));
    expect((await screen.findByRole('alert')).textContent).toMatch(/Önizlemeden sonra/);
    expect(await screen.findByText(/Listendeki kelimeye yeni anlam/)).toBeDefined();
    expect(requests('/commit')).toHaveLength(1);
    expect(requests('/preview')).toHaveLength(2);
    fireEvent.click(screen.getByRole('button', { name: 'Onayla ve kaydet' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(requests('/commit')).toHaveLength(2);
  });
  it('reports preview network failure while preserving input for retry', async () => {
    await start();
    await open();
    fillSingle();
    const implementation = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url, options) =>
      url.endsWith('/preview')
        ? Promise.reject(new Error('offline'))
        : implementation(url, options),
    );
    showPreview();
    expect((await screen.findByRole('alert')).textContent).toMatch(/Sunucuya ulaşılamıyor/);
    expect(screen.getByRole<HTMLInputElement>('textbox', { name: /İngilizce kelime/ }).value).toBe(
      'run',
    );
  });
  it('blocks repeated submissions and Escape while waiting for a preview', async () => {
    await start();
    const { dialog } = await open();
    fillSingle();
    let resolve!: (response: Response) => void;
    const implementation = fetchMock.getMockImplementation()!;
    fetchMock.mockImplementation((url, options) =>
      url.endsWith('/preview')
        ? new Promise((done) => {
            resolve = done;
          })
        : implementation(url, options),
    );
    showPreview();
    showPreview();
    expect(requests('/preview')).toHaveLength(1);
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Vazgeç' }).disabled).toBe(true);
    const cancel = new Event('cancel', { cancelable: true });
    fireEvent(dialog, cancel);
    expect(cancel.defaultPrevented).toBe(true);
    act(() => resolve(json(newPreview)));
    await screen.findByText('Kaydetmeden önce incele');
  });
});
