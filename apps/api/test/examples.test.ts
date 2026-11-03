import { describe, expect, it, vi } from 'vitest';
import { searchSpec, matchedForm } from '../src/examples/matching.js';
import { irregularVerbs } from '../src/examples/irregular.js';
import {
  contextTier,
  contextWords,
  exampleQuality,
  nearDuplicate,
  selectExamples,
  structure,
  uniqueCandidates,
} from '../src/examples/selection.js';
import { ExampleService } from '../src/examples/service.js';
import { ExampleRateLimit } from '../src/examples/rateLimit.js';
import { UpstreamGate } from '../src/examples/protection.js';
import {
  TatoebaProvider,
  CONTEXT_WORD_COUNT,
  FALLBACK_WORD_COUNT,
  MAX_RESPONSE_BYTES,
  MIN_CONTEXT_POOL,
  retrySeconds,
  suitableText,
} from '../src/examples/tatoeba.js';
import type { ExampleSentence, ExampleSentenceProvider } from '../src/examples/types.js';

export function example(
  id = '1',
  matchedForm = 'run',
  text = `We ${matchedForm} outside today.`,
): ExampleSentence {
  return {
    id,
    text,
    matchedForm,
    provider: 'Tatoeba',
    contributor: 'contributor',
    sourceUrl: `https://tatoeba.org/en/sentences/show/${id}`,
    license: { name: 'CC BY 2.0 FR', url: 'https://creativecommons.org/licenses/by/2.0/fr/' },
  };
}
const requestUrl = (value: Parameters<typeof fetch>[0]) =>
  typeof value === 'string' ? value : value instanceof URL ? value.href : value.url;

const row = (overrides: Record<string, unknown> = {}) => ({
  id: 10,
  text: 'We ran home.',
  lang: 'eng',
  script: null,
  owner: 'Writer',
  license: 'CC BY 2.0 FR',
  is_unapproved: false,
  translations: [],
  ...overrides,
});
const json = (data: unknown) =>
  new Response(JSON.stringify(data), { headers: { 'content-type': 'application/json' } });
function adapter(data: unknown) {
  const fetcher = vi.fn<typeof fetch>().mockImplementation(() => Promise.resolve(json(data)));
  return { provider: new TatoebaProvider(fetcher), fetcher };
}
const pool = Array.from({ length: 12 }, (_, index) =>
  example(
    String(index + 1),
    ['run', 'running', 'ran'][index % 3],
    `They ${['run', 'running', 'ran'][index % 3]} along road ${index}.`,
  ),
);

describe('bounded morphology and complete-expression matching', () => {
  it.each([
    ['run', 'We run daily.', 'run'],
    ['run', 'She runs daily.', 'runs'],
    ['run', 'They are running.', 'running'],
    ['run', 'He ran home.', 'ran'],
    ['study', 'She studied yesterday.', 'studied'],
    ['study', 'He studies here.', 'studies'],
    ['watch', 'She watches birds.', 'watches'],
    ['stop', 'It stopped raining.', 'stopped'],
    ['stop', 'We are stopping.', 'stopping'],
    ['plan', 'They planned a trip.', 'planned'],
    ['hope', 'I hoped for rain.', 'hoped'],
    ['make', 'We are making tea.', 'making'],
    ['die', 'The plant is dying.', 'dying'],
    ['play', 'She played outside.', 'played'],
    ['look after', 'He looked after her.', 'looked after'],
    ['give up', 'She gave up coffee.', 'gave up'],
    ['machine learning', 'We study MACHINE   LEARNING.', 'machine learning'],
    ["don't", 'Please don’t leave.', "don't"],
    ['look after', 'I look—after the house.', 'look after'],
    ['run!', 'RUN, please.', 'run'],
    ['ice-cream', 'I like ice cream.', 'ice-cream'],
  ])('matches %s in %s', (word, text, form) =>
    expect(matchedForm(text, searchSpec(word).forms)).toBe(form),
  );
  it.each([
    ['run', 'A runway is long.'],
    ['run', 'They overran it.'],
    ['run', 'It runned away.'],
    ['run', 'It is runing.'],
    ['look after', 'Look here after class.'],
    ['give up', 'I give it up.'],
    ['machine learning', 'Learning about a machine.'],
    ['study', 'She studyed yesterday.'],
    ['hope', 'She is hopeing.'],
    ['book', 'She booked a trip.'],
    ['can', 'She cans fruit.'],
  ])('rejects unsupported form of %s', (word, text) =>
    expect(matchedForm(text, searchSpec(word).forms)).toBeUndefined(),
  );
  it.each([
    '',
    'x'.repeat(101),
    'run | secret',
    'run*',
    'run @text',
    'run/2',
    '="run"',
    'a b c d e f g',
    'Türkçe',
    '<script>',
    'run\n|foo',
    'C++',
  ])('rejects unsafe or unsupported input %s', (input) =>
    expect(() => searchSpec(input)).toThrow('EXAMPLES_UNSUPPORTED'),
  );
  it('normalizes spaces, apostrophes and case; constructs only exact phrase searches', () => {
    expect(searchSpec('  LOOK   AFTER  ').expression).toBe('look after');
    expect(searchSpec('DON’T').queries).toEqual(['="don\'t"']);
    for (const query of searchSpec('run').queries) expect(query).toMatch(/^="[a-z ]+"$/u);
    expect(searchSpec('run').forms).toContain('ran');
    expect(searchSpec('run').queries.length).toBeLessThanOrEqual(9);
  });
  it('has a reviewed bounded irregular inventory without empty or operator forms', () => {
    expect(irregularVerbs.size).toBeGreaterThanOrEqual(145);
    expect(irregularVerbs.size).toBeLessThan(200);
    for (const [base, forms] of irregularVerbs) {
      expect(base).toMatch(/^[a-z]+$/u);
      expect(forms.length).toBeGreaterThan(0);
      for (const form of forms) expect(form).toMatch(/^[a-z]+$/u);
    }
    expect(searchSpec('write').forms).toContain('written');
    expect(searchSpec('be').forms).toEqual(
      expect.arrayContaining(['am', 'are', 'was', 'were', 'been', 'being']),
    );
    expect(searchSpec('have').forms).not.toContain('haves');
  });
});
describe('server selection and rotation', () => {
  it('prefers distinct inflected forms and concise examples', () => {
    const selected = selectExamples(pool, []);
    expect(selected).toHaveLength(3);
    expect(new Set(selected.map((item) => item.matchedForm)).size).toBe(3);
  });
  it('rotates a shared pool with up to nine recent ids', () => {
    const first = selectExamples(pool, []);
    const second = selectExamples(
      pool,
      first.map((item) => item.id),
    );
    expect(second.every((item) => !first.some((old) => old.id === item.id))).toBe(true);
    const third = selectExamples(
      pool,
      [...first, ...second].map((item) => item.id),
    );
    expect(third.every((item) => ![...first, ...second].some((old) => old.id === item.id))).toBe(
      true,
    );
  });
  it('allows exhausted pools, one form and fewer than three', () => {
    expect(selectExamples(pool.slice(0, 2), ['1', '2'])).toHaveLength(2);
    expect(selectExamples([example()], [])).toEqual([example()]);
    expect(selectExamples([], [])).toEqual([]);
  });
  it('deduplicates ids and normalized sentence text, including punctuation', () => {
    expect(
      uniqueCandidates([
        example(),
        example('1', 'ran', 'He ran home.'),
        example('2', 'run', 'WE RUN OUTSIDE TODAY!'),
      ]),
    ).toHaveLength(1);
  });
});
const sentence = (
  id: string,
  matchedForm: string,
  text: string,
  translated = false,
): ExampleSentence => ({
  ...example(id, matchedForm, text),
  ...(translated
    ? {
        translation: {
          id: `9${id}`,
          text: 'Türkçe çeviri.',
          contributor: 'Translator',
          sourceUrl: `https://tatoeba.org/en/sentences/show/9${id}`,
          license: { name: 'CC0 1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' },
        },
      }
    : {}),
});
const ids = (list: readonly ExampleSentence[]) => list.map((item) => item.id);
const similar = (a: [string, string], b: [string, string]) =>
  nearDuplicate(
    structure({ matchedForm: a[0], text: a[1] }),
    structure({ matchedForm: b[0], text: b[1] }),
  );
// Shaped after real Tatoeba results observed for "run" (Session 8.1 live probe).
const informativeRun = [
  sentence('1', 'run', 'I try to run every day.'),
  sentence('2', 'runs', 'This train runs every ten minutes.'),
  sentence('3', 'running', 'Hurry up, we are running late!'),
  sentence('4', 'ran', 'The children ran across the busy street.'),
  sentence('5', 'runs', 'Our lease runs out in October.'),
  sentence('6', 'running', 'Deer escape predators by running away.'),
];
const shortRun = [
  sentence('7', 'ran', 'You ran.'),
  sentence('8', 'running', 'Keep running.', true),
  sentence('9', 'run', 'Better run.'),
];
const longRun = `I run${' along the quiet river with my two friends'.repeat(3)}.`;

describe('educational ranking: context quality', () => {
  it('measures context around single and multiword expressions', () => {
    expect(contextWords({ matchedForm: 'ran', text: 'You ran.' })).toBe(1);
    expect(contextWords({ matchedForm: 'run', text: 'I try to run every day.' })).toBe(5);
    expect(
      contextWords({ matchedForm: 'look after', text: 'We look after our elderly neighbours.' }),
    ).toBe(4);
    expect(contextTier(1)).toBeLessThan(contextTier(3));
    expect(contextTier(3)).toBeLessThan(contextTier(6));
    expect(contextTier(18)).toBeLessThan(contextTier(8));
    expect(contextTier(30)).toBeLessThan(contextTier(18));
  });
  it('ranks very short sentences below informative alternatives', () => {
    // Short candidates first in provider order, as Tatoeba's relevance sort returns them.
    expect(ids(selectExamples([...shortRun, ...informativeRun.slice(0, 3)], []))).toEqual([
      '1',
      '2',
      '3',
    ]);
  });
  it('does not rank excessively long sentences highest', () => {
    const long = sentence('1', 'run', longRun);
    const moderate = sentence('2', 'run', 'We run to school every morning.');
    expect(exampleQuality(long)).toBeLessThan(exampleQuality(moderate));
    expect(selectExamples([long, moderate], [])[0]?.id).toBe('2');
  });
  it('penalizes unfinished fragments', () => {
    expect(
      exampleQuality({ matchedForm: 'memory', text: 'If my memory serves me well...' }),
    ).toBeLessThan(
      exampleQuality({ matchedForm: 'memory', text: 'My grandfather has a good memory.' }),
    );
  });
  it('still returns valid short sentences when nothing better exists', () => {
    // Both kept; the translated one first because the two are otherwise comparable.
    expect(ids(selectExamples(shortRun.slice(0, 2), []))).toEqual(['8', '7']);
    expect(ids(selectExamples(shortRun, []))).toHaveLength(3);
  });
});

describe('educational ranking: near-duplicates', () => {
  const memory = [
    sentence('1', 'memory', 'Igor lost his memory.'),
    sentence('2', 'memory', 'Stefan lost his memory.', true),
    sentence('3', 'memory', 'Martino lost his memory.'),
    sentence('4', 'memory', 'They drew from memory.'),
    sentence('5', 'memory', 'My grandfather has a good memory.'),
  ];
  it('does not pair name substitutions when distinct examples exist', () => {
    const selected = selectExamples(memory, []);
    expect(selected.filter((item) => item.text.endsWith('lost his memory.'))).toHaveLength(1);
    expect(ids(selected)).toEqual(['5', '2', '4']);
  });
  it('detects structural repetition after collapsing the target inflection', () => {
    expect(
      similar(['memory', 'Igor lost his memory.'], ['memory', 'Stefan lost his memory.']),
    ).toBe(true);
    expect(
      similar(
        ['looking after', 'Thanks for looking after my cat.'],
        ['looking after', 'Thanks for looking after my dog.'],
      ),
    ).toBe(true);
    expect(similar(['runs', 'She runs every morning.'], ['ran', 'She ran every morning.'])).toBe(
      true,
    );
  });
  it('keeps legitimately different structures distinct', () => {
    expect(
      similar(['ran', 'Tom ran away into the forest.'], ['ran', 'Tom ran away three days ago.']),
    ).toBe(false);
    expect(
      similar(['run', 'I try to run every day.'], ['run', 'I run four miles every morning.']),
    ).toBe(false);
    expect(
      similar(
        ['look after', 'Look after my pint for me.'],
        ['look after', 'Can you look after my dog?'],
      ),
    ).toBe(false);
  });
  it('never eliminates every candidate and still excludes exact duplicates', () => {
    expect(ids(selectExamples(memory.slice(0, 3), []))).toEqual(['2', '1', '3']);
    const duplicated = [
      sentence('1', 'ran', 'He ran home.'),
      sentence('2', 'ran', 'HE RAN HOME!'),
      sentence('1', 'ran', 'He ran to the station.'),
    ];
    expect(ids(selectExamples(duplicated, []))).toEqual(['1']);
  });
});

describe('educational ranking: Turkish translation preference', () => {
  it('prefers a translated example over a comparable English-only one', () => {
    const english = sentence('1', 'run', 'We run to school every morning.');
    const translated = sentence('2', 'run', 'I try to run every day.', true);
    expect(selectExamples([english, translated], [])[0]?.id).toBe('2');
  });
  it('lets a strong English-only example outrank a weak translated one', () => {
    const weak = sentence('1', 'running', 'Keep running.', true);
    const strong = sentence('2', 'running', 'Deer escape predators by running away.');
    expect(ids(selectExamples([weak, strong], []))).toEqual(['2', '1']);
  });
  it('allows results without any translation', () => {
    const selected = selectExamples(informativeRun, []);
    expect(selected).toHaveLength(3);
    expect(selected.every((item) => item.translation === undefined)).toBe(true);
  });
});

describe('educational ranking: inflection diversity and rotation', () => {
  it('prefers different verified forms only among comparable sentences', () => {
    const pool = [
      sentence('1', 'run', 'I try to run every day.'),
      sentence('2', 'run', 'We run to school every morning.'),
      sentence('3', 'run', 'They run in the park after work.'),
      sentence('4', 'ran', 'You ran.'),
    ];
    expect(ids(selectExamples(pool, []))).toEqual(['1', '2', '3']);
    expect(new Set(selectExamples(informativeRun, []).map((x) => x.matchedForm)).size).toBe(3);
  });
  it('prefers new high-quality examples on repeated requests', () => {
    const pool = [...shortRun, ...informativeRun];
    const first = selectExamples(pool, []);
    const second = selectExamples(pool, ids(first));
    expect(ids(first)).toEqual(['1', '2', '3']);
    expect(ids(second)).toEqual(['4', '5', '6']);
    // Good pool exhausted: reuse valid good examples instead of forcing "You ran.".
    expect(ids(selectExamples(pool, [...ids(first), ...ids(second)]))).toEqual(['1', '2', '3']);
  });
  it('treats near-duplicates of recently shown sentences as already seen', () => {
    const pool = [
      sentence('1', 'looking after', 'Thanks for looking after my cat.'),
      sentence('2', 'looking after', 'Thanks for looking after my dog.'),
      sentence('3', 'looking after', 'Who is looking after your children?'),
    ];
    expect(ids(selectExamples(pool, ['1']))).toEqual(['3', '2', '1']);
  });
  it('rotates toward fresh reasonable sentences without forcing low-quality ones', () => {
    const pool = [
      ...informativeRun.slice(0, 3),
      ...shortRun,
      sentence('10', 'runs', 'Tom runs fast.'),
      sentence('11', 'runs', 'He runs every day.'),
    ];
    expect(ids(selectExamples(pool, ['1', '2', '3']))).toEqual(['11', '1', '3']);
  });
});

describe('Tatoeba retrieval passes', () => {
  const turkish = row({
    id: 30,
    lang: 'tur',
    text: 'Her gün koşmaya çalışıyorum.',
    owner: 'Translator',
    is_direct: true,
    license: 'CC0 1.0',
  });
  it('requests only the context window when it yields enough candidates', async () => {
    const { provider, fetcher } = adapter({
      data: Array.from({ length: MIN_CONTEXT_POOL }, (_, index) =>
        row({ id: 100 + index, text: `She left book number ${index} at the library.` }),
      ),
    });
    expect(await provider.candidates(searchSpec('book'))).toHaveLength(MIN_CONTEXT_POOL);
    expect(fetcher).toHaveBeenCalledTimes(searchSpec('book').forms.length);
    for (const [url] of fetcher.mock.calls)
      expect(new URL(requestUrl(url)).searchParams.get('word_count')).toBe(CONTEXT_WORD_COUNT);
  });
  it('merges a thin context pass with the fallback pass and ranks context first', async () => {
    const context = [row({ id: 20, text: 'I try to run every day.', translations: [turkish] })];
    const fallback = [
      row({ id: 21, text: 'You ran.' }),
      row({ id: 20, text: 'I try to run every day.', translations: [turkish] }),
      row({ id: 22, text: 'Keep running.' }),
    ];
    const fetcher = vi.fn<typeof fetch>().mockImplementation((url) =>
      Promise.resolve(
        json({
          data:
            new URL(requestUrl(url)).searchParams.get('word_count') === CONTEXT_WORD_COUNT
              ? context
              : fallback,
        }),
      ),
    );
    const candidates = await new TatoebaProvider(fetcher).candidates(searchSpec('run'));
    expect(ids(candidates)).toEqual(['20', '21', '22']);
    expect(selectExamples(candidates, [])[0]).toMatchObject({
      id: '20',
      matchedForm: 'run',
      sourceUrl: 'https://tatoeba.org/en/sentences/show/20',
      license: { name: 'CC BY 2.0 FR' },
      translation: {
        id: '30',
        text: 'Her gün koşmaya çalışıyorum.',
        contributor: 'Translator',
        sourceUrl: 'https://tatoeba.org/en/sentences/show/30',
        license: { name: 'CC0 1.0' },
      },
    });
  });
});
describe('Tatoeba v1 adapter using realistic fixtures', () => {
  it('maps source and direct Turkish translation attribution without leaking raw nesting', async () => {
    const { provider, fetcher } = adapter({
      data: [
        row({
          translations: [
            row({
              id: 11,
              lang: 'tur',
              text: 'Eve koştuk.',
              owner: 'Translator',
              is_direct: true,
              license: 'CC0 1.0',
            }),
          ],
        }),
      ],
    });
    const result = await provider.candidates(searchSpec('run'));
    expect(result).toEqual([
      {
        id: '10',
        text: 'We ran home.',
        matchedForm: 'ran',
        contributor: 'Writer',
        provider: 'Tatoeba',
        sourceUrl: 'https://tatoeba.org/en/sentences/show/10',
        license: { name: 'CC BY 2.0 FR', url: 'https://creativecommons.org/licenses/by/2.0/fr/' },
        translation: {
          id: '11',
          text: 'Eve koştuk.',
          contributor: 'Translator',
          sourceUrl: 'https://tatoeba.org/en/sentences/show/11',
          license: { name: 'CC0 1.0', url: 'https://creativecommons.org/publicdomain/zero/1.0/' },
        },
      },
    ]);
    for (const [url, options] of fetcher.mock.calls) {
      const parsed = new URL(requestUrl(url));
      expect(parsed.origin).toBe('https://api.tatoeba.org');
      expect(parsed.pathname).toBe('/v1/sentences');
      expect(Object.fromEntries(parsed.searchParams)).toMatchObject({
        lang: 'eng',
        is_orphan: 'no',
        is_unapproved: 'no',
        'showtrans:lang': 'tur',
        'showtrans:is_direct': 'yes',
        'showtrans:is_orphan': 'no',
        'showtrans:is_unapproved': 'no',
        limit: '12',
      });
      expect(parsed.searchParams.has('trans:lang')).toBe(false);
      expect(options?.redirect).toBe('error');
      expect(new Headers(options?.headers).get('User-Agent')).toContain(
        'UniversityVocabularyLearning',
      );
    }
    // One thin context pass, then the full-range fallback pass: one page per form each.
    const forms = searchSpec('run').forms.length;
    expect(fetcher).toHaveBeenCalledTimes(forms * 2);
    expect(
      fetcher.mock.calls.map(([url]) => new URL(requestUrl(url)).searchParams.get('word_count')),
    ).toEqual([
      ...Array<string>(forms).fill(CONTEXT_WORD_COUNT),
      ...Array<string>(forms).fill(FALLBACK_WORD_COUNT),
    ]);
  });
  it('does not label indirect, missing or unsuitable translations as translations', async () => {
    const { provider } = adapter({
      data: [
        row({
          translations: [
            row({ id: 11, lang: 'tur', text: 'Eve koştuk.', is_direct: false }),
            row({ id: 12, lang: 'tur', text: 'Siktir git.', is_direct: true }),
          ],
        }),
      ],
    });
    expect((await provider.candidates(searchSpec('run')))[0]?.translation).toBeUndefined();
  });
  it.each([undefined, []])('supports English only translations=%s', async (translations) => {
    const { provider } = adapter({ data: [row({ translations })] });
    expect((await provider.candidates(searchSpec('run')))[0]?.text).toBe('We ran home.');
  });
  it.each([
    { owner: null },
    { is_unapproved: true },
    { lang: 'deu' },
    { text: '' },
    { text: 'Runway is long.' },
    { text: 'We fucking ran.' },
    { license: 'PROBLEM' },
    { license: 'Unknown' },
    { text: 'We ran <script>bad</script>.' },
    { text: 'We ran ' + 'very '.repeat(40) },
  ])('rejects unsuitable metadata/content %s', async (overrides) => {
    const { provider } = adapter({ data: [row(overrides)] });
    expect(await provider.candidates(searchSpec('run'))).toEqual([]);
  });
  it('bounds pages and never follows an upstream paging URL', async () => {
    const { provider, fetcher } = adapter({
      data: [row()],
      paging: { has_next: true, next: 'http://127.0.0.1/private' },
    });
    await provider.candidates(searchSpec('machine learning'));
    // Context pass plus fallback pass for one exact form; never the returned paging URL.
    expect(fetcher).toHaveBeenCalledTimes(2);
    for (const [url] of fetcher.mock.calls)
      expect(new URL(requestUrl(url)).origin).toBe('https://api.tatoeba.org');
  });
  it('returns honest empty results', async () => {
    const { provider } = adapter({ data: [] });
    expect(await provider.candidates(searchSpec('book'))).toEqual([]);
  });
  it.each([
    { wrong: [] },
    { data: {} },
    { data: [{ id: 'not a number' }] },
    { data: Array.from({ length: 13 }, () => row()) },
  ])('rejects malformed v1 payload %s', async (data) => {
    await expect(adapter(data).provider.candidates(searchSpec('run'))).rejects.toMatchObject({
      code: 'EXAMPLES_INVALID_RESPONSE',
    });
  });
  it('rejects invalid JSON', async () => {
    const provider = new TatoebaProvider(
      vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response('{', { headers: { 'content-type': 'application/json' } })),
    );
    await expect(provider.candidates(searchSpec('book'))).rejects.toMatchObject({
      status: 502,
      code: 'EXAMPLES_INVALID_RESPONSE',
    });
  });
  it.each([500, 503, 400, 302])('maps upstream HTTP %i safely', async (status) => {
    const provider = new TatoebaProvider(
      vi
        .fn<typeof fetch>()
        .mockImplementation(() => Promise.resolve(new Response('internal detail', { status }))),
    );
    await expect(provider.candidates(searchSpec('book'))).rejects.toMatchObject({
      status: 503,
      code: 'EXAMPLES_UNAVAILABLE',
    });
  });
  it('honors 429 Retry-After with a shared provider cooldown and no retries', async () => {
    const fetcher = vi
      .fn<typeof fetch>()
      .mockImplementation(() =>
        Promise.resolve(new Response('', { status: 429, headers: { 'retry-after': '12' } })),
      );
    const provider = new TatoebaProvider(fetcher);
    await expect(provider.candidates(searchSpec('book'))).rejects.toMatchObject({
      status: 429,
      retryAfter: 12,
    });
    await expect(provider.candidates(searchSpec('run'))).rejects.toMatchObject({
      status: 429,
      code: 'EXAMPLES_RATE_LIMITED',
    });
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it('handles timeout distinctly', async () => {
    const provider = new TatoebaProvider(
      vi
        .fn<typeof fetch>()
        .mockImplementation(
          (_url, options) =>
            new Promise((_resolve, reject) =>
              options?.signal?.addEventListener('abort', () =>
                reject(new DOMException('timeout', 'AbortError')),
              ),
            ),
        ),
      new UpstreamGate(),
      5,
    );
    await expect(provider.candidates(searchSpec('book'))).rejects.toMatchObject({
      status: 504,
      code: 'EXAMPLES_TIMEOUT',
    });
  });
  it('maps network failures safely', async () => {
    const provider = new TatoebaProvider(
      vi.fn<typeof fetch>().mockRejectedValue(new Error('private detail')),
    );
    await expect(provider.candidates(searchSpec('book'))).rejects.toMatchObject({
      code: 'EXAMPLES_UNAVAILABLE',
    });
  });
  it.each([true, false])('bounds body size with/without Content-Length=%s', async (header) => {
    const fetcher = vi.fn<typeof fetch>().mockImplementation(() =>
      Promise.resolve(
        new Response(' '.repeat(MAX_RESPONSE_BYTES + 1), {
          headers: {
            'content-type': 'application/json',
            ...(header ? { 'content-length': String(MAX_RESPONSE_BYTES + 1) } : {}),
          },
        }),
      ),
    );
    await expect(new TatoebaProvider(fetcher).candidates(searchSpec('book'))).rejects.toMatchObject(
      { code: 'EXAMPLES_INVALID_RESPONSE' },
    );
  });
  it('validates dates and seconds in Retry-After', () => {
    expect(retrySeconds('5', 0)).toBe(5);
    expect(retrySeconds('Thu, 01 Jan 1970 00:01:00 GMT', 0)).toBe(60);
    expect(retrySeconds('bad', 0)).toBeUndefined();
    expect(retrySeconds('-2', Date.now())).toBeUndefined();
  });
  it('keeps the blocklist narrow', () => {
    expect(suitableText('The class studies biology.')).toBe(true);
    expect(suitableText('We walked to the hospital.')).toBe(true);
  });
});
describe('shared candidate cache', () => {
  function cache(ttl = 100, max = 2) {
    let now = 0;
    const candidates = vi.fn<ExampleSentenceProvider['candidates']>().mockResolvedValue(pool);
    return {
      service: new ExampleService({ candidates }, () => now, ttl, max),
      candidates,
      advance: (ms: number) => {
        now += ms;
      },
    };
  }
  it('reuses normalized expressions while selecting per request', async () => {
    const { service, candidates } = cache();
    const a = await service.lookup('run', []);
    const b = await service.lookup(
      ' RUN ',
      a.examples.map((x) => x.id),
    );
    expect(candidates).toHaveBeenCalledTimes(1);
    expect(a).not.toEqual(b);
  });
  it('uses distinct entries for distinct complete search specifications', async () => {
    const { service, candidates } = cache();
    await service.lookup('run', []);
    await service.lookup('look after', []);
    expect(candidates).toHaveBeenCalledTimes(2);
    expect(candidates.mock.calls[0]?.[0]).not.toEqual(candidates.mock.calls[1]?.[0]);
  });
  it('expires at TTL', async () => {
    const { service, candidates, advance } = cache();
    await service.lookup('run', []);
    advance(100);
    await service.lookup('run', []);
    expect(candidates).toHaveBeenCalledTimes(2);
  });
  it('evicts oldest entry at capacity', async () => {
    const { service, candidates } = cache();
    await service.lookup('run', []);
    await service.lookup('book', []);
    await service.lookup('look after', []);
    await service.lookup('run', []);
    expect(candidates).toHaveBeenCalledTimes(4);
  });
  it('coalesces identical concurrent lookups and cleans failures', async () => {
    const candidates = vi
      .fn<ExampleSentenceProvider['candidates']>()
      .mockRejectedValueOnce(new Error('offline'))
      .mockResolvedValue(pool);
    const service = new ExampleService({ candidates });
    const results = await Promise.allSettled([
      service.lookup('run', []),
      service.lookup('run', []),
    ]);
    expect(results.every((x) => x.status === 'rejected')).toBe(true);
    expect(candidates).toHaveBeenCalledTimes(1);
    await service.lookup('run', []);
    expect(candidates).toHaveBeenCalledTimes(2);
  });
  it('bounds distinct in-flight lookups', async () => {
    let release!: (value: ExampleSentence[]) => void;
    const wait = new Promise<ExampleSentence[]>((resolve) => {
      release = resolve;
    });
    const service = new ExampleService({ candidates: () => wait });
    const pending = Array.from({ length: 32 }, (_, i) =>
      service.lookup(
        `word${String.fromCharCode(97 + (i % 26))}${String.fromCharCode(97 + Math.floor(i / 26))}`,
        [],
      ),
    );
    await expect(service.lookup('different', [])).rejects.toMatchObject({ code: 'EXAMPLES_BUSY' });
    release([]);
    await Promise.all(pending);
  });
});
describe('HTTP concurrency gate and authenticated request windows', () => {
  it('never runs more than four actual requests and transfers waiting slots', async () => {
    const gate = new UpstreamGate();
    let active = 0;
    let max = 0;
    const releases: (() => void)[] = [];
    const work = () =>
      gate.run(async () => {
        active++;
        max = Math.max(active, max);
        await new Promise<void>((resolve) => releases.push(resolve));
        active--;
      });
    const promises = Array.from({ length: 6 }, work);
    expect(active).toBe(4);
    releases.shift()!();
    await vi.waitFor(() => expect(releases).toHaveLength(4));
    while (releases.length) {
      releases.shift()!();
      await Promise.resolve();
      await Promise.resolve();
    }
    await Promise.all(promises);
    expect(max).toBe(4);
  });
  it('rejects overflow and bounds waiting', async () => {
    const gate = new UpstreamGate(1, 1, 5);
    let release!: () => void;
    const first = gate.run(
      () =>
        new Promise<void>((resolve) => {
          release = resolve;
        }),
    );
    const second = gate.run(() => Promise.resolve(undefined));
    await expect(gate.run(() => Promise.resolve(undefined))).rejects.toMatchObject({
      code: 'EXAMPLES_BUSY',
    });
    await expect(second).rejects.toMatchObject({ code: 'EXAMPLES_BUSY' });
    release();
    await first;
    expect(await gate.run(() => Promise.resolve(42))).toBe(42);
  });
  it('releases slots on failed operations', async () => {
    const gate = new UpstreamGate(1);
    await expect(
      gate.run(() =>
        Promise.resolve().then(() => {
          throw new Error('failure');
        }),
      ),
    ).rejects.toThrow('failure');
    expect(await gate.run(() => Promise.resolve(1))).toBe(1);
  });
  it('limits each internal user independently, expires windows and bounds identities', () => {
    let now = 0;
    const limiter = new ExampleRateLimit(() => now, 2, 100, 2);
    limiter.check('a');
    limiter.check('a');
    expect(() => limiter.check('a')).toThrow('EXAMPLES_RATE_LIMITED');
    limiter.check('b');
    expect(() => limiter.check('c')).toThrow('EXAMPLES_BUSY');
    now = 100;
    expect(() => limiter.check('a')).not.toThrow();
    expect(() => limiter.check('c')).not.toThrow();
  });
});
