import { routerReady } from '../../test/routerReady';
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { Preview, Submission } from '../../lib/words';
import { buildRoutes } from '../../router';

// Word dialog behavior added in Batch 3, through the routed page with a mocked API.
// jsdom has no layout, CSS transitions, top layer or real scrolling: geometry and
// scrolling are stubbed below, and the visual result is checked manually.

const listId = 'e542713d-a716-401f-8986-f6437921ed14';
const list = {
  id: listId,
  title: 'Algorithms',
  wordCount: 1,
  createdAt: '2026-10-21T10:00:00Z',
  updatedAt: '2026-10-21T10:00:00Z',
};
const possible: Preview = {
  token: 'pending-choice',
  canCommit: false,
  unresolvedDecisions: 1,
  invalid: [],
  counts: { newWords: 0, mergedWords: 0, newMeanings: 0, skippedMeanings: 0, duplicateEntries: 0 },
  rows: [
    {
      line: 1,
      english: 'run',
      existingWordId: 'word-run',
      status: 'review',
      warnings: [],
      meanings: [
        {
          turkish: 'calismak',
          status: 'possible_duplicate',
          similarity: { id: '1:1', existing: 'çalışmak', action: null },
        },
      ],
    },
  ],
};
function resolved(action: 'skip' | 'keep'): Preview {
  return {
    ...possible,
    token: `choice-${action}`,
    unresolvedDecisions: 0,
    canCommit: action === 'keep',
    rows: [
      {
        ...possible.rows[0]!,
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
      ...possible.counts,
      mergedWords: action === 'keep' ? 1 : 0,
      newMeanings: action === 'keep' ? 1 : 0,
      skippedMeanings: action === 'skip' ? 1 : 0,
    },
  };
}

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });
const fetchMock = vi.fn<(url: string, options?: RequestInit) => Promise<Response>>();
/** Decision previews wait here while `holdDecisions` is set. */
let holdDecisions: boolean;
let held: (() => void)[];
let failDecisions: boolean;

function previewResponse(submission: Submission): Response {
  const decision = submission.decisions?.[0];
  if (!decision) return json(possible);
  return failDecisions
    ? json({ error: { code: 'INTERNAL_ERROR' } }, 500)
    : json(resolved(decision.action));
}

beforeEach(() => {
  holdDecisions = false;
  held = [];
  failDecisions = false;
  fetchMock.mockReset();
  fetchMock.mockImplementation((url, options) => {
    if (url.endsWith('/preview')) {
      const submission = JSON.parse(options!.body as string) as Submission;
      if (holdDecisions && submission.decisions)
        return new Promise((resolve) => held.push(() => resolve(previewResponse(submission))));
      return Promise.resolve(previewResponse(submission));
    }
    if (url.endsWith('/words')) return Promise.resolve(json({ words: [] }));
    return Promise.resolve(json(url.endsWith('/lists') ? { lists: [list] } : { list }));
  });
  vi.stubGlobal('fetch', fetchMock);
});
afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

async function openAddDialog() {
  const router = createMemoryRouter(buildRoutes({ includeDevRoutes: false }), {
    basename: '/kelime',
    initialEntries: [`/kelime/lists/${listId}`],
  });
  await routerReady(router);
  render(<RouterProvider router={router} />);
  const trigger = await screen.findByRole('button', { name: 'Kelime ekle' });
  fireEvent.click(trigger);
  const dialog = screen.getByRole<HTMLDialogElement>('dialog', { name: 'Kelime ekle' });
  return { dialog, trigger };
}
function fillAndPreview() {
  fireEvent.change(screen.getByRole('textbox', { name: /İngilizce kelime/ }), {
    target: { value: 'run' },
  });
  fireEvent.change(screen.getByRole('textbox', { name: /Türkçe anlam 1/ }), {
    target: { value: 'calismak' },
  });
  const submit = screen.getByRole('button', { name: /Önizlemeyi göster/ });
  submit.focus();
  fireEvent.click(submit);
  return submit;
}
const previews = () => fetchMock.mock.calls.filter(([url]) => url.endsWith('/preview'));
const radio = (name: string) => screen.getByRole<HTMLInputElement>('radio', { name });
const releaseHeld = () => {
  const pending = held;
  held = [];
  act(() => pending.forEach((release) => release()));
};

describe('word dialog: native dialog semantics', () => {
  it('opens as a native modal dialog and still closes instantly with focus restored', async () => {
    const { dialog, trigger } = await openAddDialog();
    expect(dialog.tagName).toBe('DIALOG');
    expect(dialog.classList.contains('list-dialog')).toBe(true);
    expect(dialog.open).toBe(true);
    // No inline animation state: the entrance is CSS only (@starting-style).
    expect(dialog.getAttribute('style')).toBeNull();
    expect(document.activeElement).toBe(screen.getByRole('textbox', { name: /İngilizce kelime/ }));

    fireEvent.click(within(dialog).getByRole('button', { name: 'Vazgeç' }));
    await waitFor(() => expect(screen.queryByRole('dialog')).toBeNull());
    expect(document.activeElement).toBe(trigger);
  });
});

describe('word dialog: similarity decision while the server recalculates', () => {
  it('shows the chosen option at once, then the server result', async () => {
    holdDecisions = true;
    await openAddDialog();
    fillAndPreview();
    const keep = await screen.findByRole<HTMLInputElement>('radio', {
      name: 'Farklı anlam olarak ekle',
    });
    keep.focus();
    fireEvent.click(keep);

    // Request in flight: immediate selection, readable rows, focus kept on the radio.
    expect(held).toHaveLength(1);
    expect(radio('Farklı anlam olarak ekle').checked).toBe(true);
    expect(radio('Aynı anlam, ekleme').checked).toBe(false);
    expect(radio('Aynı anlam, ekleme').disabled).toBe(false);
    expect(document.activeElement).toBe(keep);
    expect(keep.closest('label')!.querySelector('.animate-spin')).not.toBeNull();
    expect(screen.getByRole<HTMLButtonElement>('button', { name: 'Vazgeç' }).disabled).toBe(true);

    releaseHeld();
    await waitFor(() =>
      expect(
        screen.getByRole<HTMLButtonElement>('button', { name: 'Onayla ve kaydet' }).disabled,
      ).toBe(false),
    );
    expect(radio('Farklı anlam olarak ekle').checked).toBe(true);
    expect(document.querySelectorAll('label .animate-spin')).toHaveLength(0);
    expect(document.activeElement).toBe(keep);
  });

  it('sends one request for quick repeated or switching clicks', async () => {
    holdDecisions = true;
    await openAddDialog();
    fillAndPreview();
    fireEvent.click(await screen.findByRole('radio', { name: 'Farklı anlam olarak ekle' }));
    fireEvent.click(radio('Aynı anlam, ekleme'));
    fireEvent.click(radio('Farklı anlam olarak ekle'));
    fireEvent.click(radio('Aynı anlam, ekleme'));
    expect(previews()).toHaveLength(2); // the initial preview and one decision
    expect(radio('Farklı anlam olarak ekle').checked).toBe(true);

    releaseHeld();
    await waitFor(() => expect(document.querySelectorAll('label .animate-spin')).toHaveLength(0));
    // Switching after the answer is a new, explicit decision.
    fireEvent.click(radio('Aynı anlam, ekleme'));
    expect(previews()).toHaveLength(3);
    expect(JSON.parse(previews()[2]![1]!.body as string)).toMatchObject({
      decisions: [{ id: '1:1', action: 'skip' }],
    });
  });

  it('reverts to the server preview and reports the error when the request fails', async () => {
    holdDecisions = true;
    failDecisions = true;
    await openAddDialog();
    fillAndPreview();
    fireEvent.click(await screen.findByRole('radio', { name: 'Farklı anlam olarak ekle' }));
    expect(radio('Farklı anlam olarak ekle').checked).toBe(true);

    releaseHeld();
    expect(await screen.findByRole('alert')).toBeDefined();
    expect(radio('Farklı anlam olarak ekle').checked).toBe(false);
    expect(radio('Aynı anlam, ekleme').checked).toBe(false);
    expect(
      screen.getByRole<HTMLButtonElement>('button', { name: 'Onayla ve kaydet' }).disabled,
    ).toBe(true);

    // Recovery: a new choice is sent and applied.
    holdDecisions = false;
    failDecisions = false;
    fireEvent.click(radio('Aynı anlam, ekleme'));
    await waitFor(() => expect(radio('Aynı anlam, ekleme').checked).toBe(true));
    expect(await screen.findByText(/Kaydedilecek yeni anlam yok/)).toBeDefined();
  });

  it('explains a no-op skip next to the disabled save button and writes nothing', async () => {
    await openAddDialog();
    fillAndPreview();
    fireEvent.click(await screen.findByRole('radio', { name: 'Aynı anlam, ekleme' }));
    const reason = await screen.findByText(
      'Seçimlerine göre bu anlamlar atlanacak. Kaydedilecek yeni anlam yok.',
    );
    const button = screen.getByRole<HTMLButtonElement>('button', { name: 'Onayla ve kaydet' });
    expect(button.disabled).toBe(true);
    expect(button.getAttribute('aria-describedby')).toBe(reason.closest('[role="status"]')!.id);
    fireEvent.click(button);
    expect(fetchMock.mock.calls.some(([url]) => url.endsWith('/commit'))).toBe(false);
  });
});

describe('word dialog: bringing a new preview into view', () => {
  let scrollTo: ReturnType<typeof vi.fn>;
  let headingTop: number;
  const box = (top: number, height: number) =>
    ({ top, bottom: top + height, height, left: 0, right: 0, width: 0, x: 0, y: top }) as DOMRect;

  beforeEach(() => {
    headingTop = 900;
    scrollTo = vi.fn();
    Object.defineProperty(HTMLDialogElement.prototype, 'scrollTo', {
      configurable: true,
      writable: true,
      value: scrollTo,
    });
    vi.spyOn(Element.prototype, 'getBoundingClientRect').mockImplementation(function (
      this: Element,
    ) {
      if (this.tagName === 'DIALOG') return box(0, 600);
      if (this.textContent === 'Kaydetmeden önce incele') return box(headingTop, 24);
      return box(0, 0);
    });
  });
  afterEach(() => {
    Reflect.deleteProperty(HTMLDialogElement.prototype, 'scrollTo');
  });

  it('scrolls only the dialog to the heading, keeps focus, and not again for decisions', async () => {
    const { dialog } = await openAddDialog();
    // After the page's own scroll restoration: only the reveal is observed from here.
    const windowScroll = vi.spyOn(window, 'scrollTo');
    const submit = fillAndPreview();
    await screen.findByRole('heading', { name: 'Kaydetmeden önce incele' });

    await waitFor(() => expect(scrollTo).toHaveBeenCalledTimes(1));
    expect(scrollTo.mock.contexts[0]).toBe(dialog);
    expect(scrollTo).toHaveBeenCalledWith({ top: 900 - 16, behavior: 'smooth' });
    expect(windowScroll).not.toHaveBeenCalled();
    expect(document.activeElement).toBe(submit);

    // A decision recalculates the preview in place: no further jump.
    fireEvent.click(radio('Farklı anlam olarak ekle'));
    await waitFor(() => expect(radio('Farklı anlam olarak ekle').checked).toBe(true));
    await waitFor(() =>
      expect(
        screen.getByRole<HTMLButtonElement>('button', { name: 'Onayla ve kaydet' }).disabled,
      ).toBe(false),
    );
    expect(scrollTo).toHaveBeenCalledTimes(1);
  });

  it('jumps without smooth scrolling under reduced motion', async () => {
    const original = window.matchMedia.bind(window);
    vi.spyOn(window, 'matchMedia').mockImplementation((query) =>
      query === '(prefers-reduced-motion: reduce)'
        ? ({ matches: true, media: query } as MediaQueryList)
        : original(query),
    );
    await openAddDialog();
    fillAndPreview();
    await screen.findByRole('heading', { name: 'Kaydetmeden önce incele' });
    await waitFor(() => expect(scrollTo).toHaveBeenCalledWith({ top: 884, behavior: 'instant' }));
  });

  it('does not scroll when the heading is already comfortably visible', async () => {
    headingTop = 200;
    await openAddDialog();
    fillAndPreview();
    await screen.findByRole('heading', { name: 'Kaydetmeden önce incele' });
    expect(scrollTo).not.toHaveBeenCalled();
  });
});
