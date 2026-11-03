import { afterEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { loadConfig } from '../src/config/env.js';
import { AzureSpeechProvider, maxAudioBytes } from '../src/speech/azure.js';
import { speechConfigSchema } from '../src/speech/config.js';
import { escapeXml, spokenText, ssml } from '../src/speech/pronunciation.js';
import { SpeechRateLimit, SpeechService } from '../src/speech/service.js';
import type { PrismaClient } from '../src/generated/prisma/client.js';
import { ApplicationError } from '../src/http/errors.js';
import { testConfig } from './helpers.js';

const config = speechConfigSchema.parse({ key: 'test-key', region: 'westeurope' });
const audio = () =>
  new Response(new Uint8Array([73, 68, 51, 1]), { headers: { 'content-type': 'audio/mpeg' } });
afterEach(() => vi.useRealTimers());
describe('Azure speech configuration and bounded REST adapter', () => {
  it.each([
    { AZURE_SPEECH_REGION: 'https://evil.test', AZURE_SPEECH_KEY: 'test-key' },
    {
      AZURE_SPEECH_REGION: 'eastus',
      AZURE_SPEECH_VOICE: 'tr-TR-AhmetNeural',
      AZURE_SPEECH_KEY: 'test-key',
    },
    { AZURE_SPEECH_REGION: 'eastus', AZURE_SPEECH_KEY: 'test-key', AZURE_SPEECH_FORMAT: 'raw' },
    { AZURE_SPEECH_KEY: 'hidden-test-value' },
    { AZURE_SPEECH_ENABLED: '1' },
    { AZURE_SPEECH_CACHE_ENABLED: 'yes' },
  ])('rejects unsafe configuration without disclosing credentials: %j', (env) => {
    expect(() => loadConfig(env)).toThrow(/Invalid speech configuration/);
    try {
      loadConfig(env);
    } catch (error) {
      expect(String(error)).not.toContain('hidden-test-value');
    }
  });
  it('defaults to a reviewed en-US neural voice, MP3 and no shared cache; no credentials are required', () => {
    expect(loadConfig({}).speech).toEqual({
      enabled: true,
      voice: 'en-US-JennyNeural',
      format: 'audio-24khz-48kbitrate-mono-mp3',
      cacheEnabled: false,
    });
    expect(
      loadConfig({
        AZURE_SPEECH_KEY: 'test-key',
        AZURE_SPEECH_REGION: 'eastus',
        AZURE_SPEECH_VOICE: 'en-US-BrianNeural',
        AZURE_SPEECH_FORMAT: 'audio-16khz-32kbitrate-mono-mp3',
        AZURE_SPEECH_CACHE_ENABLED: 'true',
      }).speech?.cacheEnabled,
    ).toBe(true);
  });
  it('uses the fixed HTTPS endpoint, authentication header, SSML and no personal metadata', async () => {
    const fetcher = vi.fn<typeof fetch>().mockResolvedValue(audio());
    const provider = new AzureSpeechProvider(config, fetcher);
    expect(await provider.synthesize('algorithm')).toEqual(Buffer.from([73, 68, 51, 1]));
    expect(fetcher.mock.calls[0]![0]).toBe(
      'https://westeurope.tts.speech.microsoft.com/cognitiveservices/v1',
    );
    const request = fetcher.mock.calls[0]![1]!;
    expect(request).toMatchObject({
      method: 'POST',
      redirect: 'error',
      headers: {
        'Ocp-Apim-Subscription-Key': 'test-key',
        'Content-Type': 'application/ssml+xml',
        'X-Microsoft-OutputFormat': config.format,
      },
    });
    expect(request.body).toBe(ssml('algorithm', config.voice));
    expect(typeof request.body === 'string' ? request.body : '').not.toMatch(
      /student|owner|listTitle|Turkish/,
    );
  });
  it('escapes XML text and uses only whole-expression audio overrides', () => {
    expect(escapeXml(`<voice a="x">&'`)).toBe('&lt;voice a=&quot;x&quot;&gt;&amp;&apos;');
    expect(ssml('</voice><audio src="https://evil.test"/>', config.voice)).not.toContain('<audio');
    expect(spokenText('SQL')).toBe('S Q L');
    expect(spokenText(' API ')).toBe('A P I');
    expect(spokenText('C++')).toBe('C plus plus');
    expect(ssml('API', config.voice)).toContain('<say-as interpret-as="characters">API</say-as>');
    expect(ssml('SQL', config.voice)).toContain('<say-as interpret-as="characters">SQL</say-as>');
    for (const term of ['algorithm', 'recursion', 'database', 'network', 'JSON', 'SQL server'])
      expect(spokenText(term)).toBe(term);
  });
  it.each([429, 500, 502, 503, 401, 302])(
    'makes one request for HTTP %s without exposing error content',
    async (status) => {
      const fetcher = vi
        .fn<typeof fetch>()
        .mockResolvedValue(new Response('test-key private error', { status }));
      await expect(
        new AzureSpeechProvider(config, fetcher).synthesize('word'),
      ).rejects.toMatchObject({
        code: status === 429 ? 'SPEECH_RATE_LIMITED' : 'SPEECH_UNAVAILABLE',
      });
      expect(fetcher).toHaveBeenCalledTimes(1);
    },
  );
  it('redacts transport failures and direct invalid configuration', async () => {
    const fetcher = vi.fn<typeof fetch>().mockRejectedValue(new Error('test-key request details'));
    await expect(new AzureSpeechProvider(config, fetcher).synthesize('word')).rejects.toMatchObject(
      { message: 'SPEECH_UNAVAILABLE' },
    );
    expect(() => new AzureSpeechProvider({ ...config, voice: 'tr-TR-Invalid' as never })).toThrow(
      'Invalid speech provider configuration',
    );
  });
  it('aborts a timed-out request without retry', async () => {
    vi.useFakeTimers();
    const fetcher = vi.fn<typeof fetch>().mockImplementation(
      (_url, init) =>
        new Promise((_resolve, reject) => {
          init!.signal!.addEventListener('abort', () => reject(new Error('aborted')));
        }),
    );
    const failure = expect(
      new AzureSpeechProvider(config, fetcher, 20).synthesize('word'),
    ).rejects.toMatchObject({ code: 'SPEECH_TIMEOUT' });
    await vi.advanceTimersByTimeAsync(21);
    await failure;
    expect(fetcher).toHaveBeenCalledTimes(1);
  });
  it.each([
    () => new Response('not audio', { headers: { 'content-type': 'text/html' } }),
    () =>
      new Response(new Uint8Array(1), {
        headers: { 'content-type': 'audio/mpeg', 'content-length': String(maxAudioBytes + 1) },
      }),
    () =>
      new Response(new Uint8Array(maxAudioBytes + 1), {
        headers: { 'content-type': 'audio/mpeg' },
      }),
    () => new Response(new Uint8Array(), { headers: { 'content-type': 'audio/mpeg' } }),
  ])('bounds declared and streamed audio and rejects invalid payloads', async (response) => {
    await expect(
      new AzureSpeechProvider(
        config,
        vi.fn<typeof fetch>().mockResolvedValue(response()),
      ).synthesize('word'),
    ).rejects.toMatchObject({ code: 'SPEECH_INVALID_RESPONSE' });
  });
  it('uses no upstream with absent credentials or a disabled provider', async () => {
    const fetcher = vi.fn<typeof fetch>();
    for (const s of [speechConfigSchema.parse({}), { ...config, enabled: false }])
      await expect(new AzureSpeechProvider(s, fetcher).synthesize('word')).rejects.toMatchObject({
        code: 'SPEECH_UNAVAILABLE',
      });
    expect(fetcher).not.toHaveBeenCalled();
  });
  it('isolates cache keys by text, punctuation, pronunciation, voice, region and format without keys', () => {
    const a = new AzureSpeechProvider(config);
    expect(a.cacheKey('C++')).not.toBe(a.cacheKey('C'));
    for (const s of [
      { ...config, voice: 'en-US-BrianNeural' as const },
      { ...config, region: 'eastus' as const },
      { ...config, format: 'audio-16khz-32kbitrate-mono-mp3' as const },
    ])
      expect(new AzureSpeechProvider(s).cacheKey('API')).not.toBe(a.cacheKey('API'));
    expect(a.cacheKey('API')).toContain('a p i');
    expect(a.cacheKey('API')).not.toContain('test-key');
  });
});

describe('speech admission, coalescing, bounded cache and circuit breaker', () => {
  const provider = () => ({
    cacheKey: (s: string) => s,
    synthesize: vi.fn<(s: string) => Promise<Buffer>>().mockResolvedValue(Buffer.from('audio')),
  });
  it('coalesces identical concurrent requests and reuses permitted cached output', async () => {
    const p = provider(),
      service = new SpeechService(p, true);
    const results = await Promise.all([service.audio('word'), service.audio('word')]);
    expect(results[0]).toEqual(results[1]);
    await service.audio('word');
    expect(p.synthesize).toHaveBeenCalledTimes(1);
  });
  it('does not retain audio when caching is disabled', async () => {
    const p = provider(),
      service = new SpeechService(p, false);
    await service.audio('word');
    await service.audio('word');
    expect(p.synthesize).toHaveBeenCalledTimes(2);
  });
  it('expires entries and bounds both byte storage and entry count', async () => {
    let now = 0;
    const p = provider(),
      service = new SpeechService(p, true, () => now, 2, 10, 4, 50);
    await service.audio('one');
    await service.audio('two');
    await service.audio('three');
    await service.audio('one');
    expect(p.synthesize).toHaveBeenCalledTimes(4);
    now = 51;
    await service.audio('one');
    expect(p.synthesize).toHaveBeenCalledTimes(5);
  });
  it('caps actual distinct upstream operations while permitting coalesced waiters', async () => {
    const p = provider();
    let release!: (audio: Buffer) => void;
    p.synthesize.mockImplementation(
      () =>
        new Promise((resolve) => {
          release = resolve;
        }),
    );
    const service = new SpeechService(p, false, Date.now, 200, 100, 1);
    const first = service.audio('one'),
      same = service.audio('one');
    await expect(service.audio('two')).rejects.toMatchObject({ code: 'SPEECH_BUSY' });
    await Promise.resolve();
    release(Buffer.from('ok'));
    await Promise.all([first, same]);
    expect(p.synthesize).toHaveBeenCalledTimes(1);
  });
  it.each([429, 503])(
    'does not retry/cache failures and bounds outage traffic: %s',
    async (status) => {
      let now = 0;
      const p = provider();
      p.synthesize.mockRejectedValueOnce(new ApplicationError(status, 'private-provider-message'));
      const service = new SpeechService(p, true, () => now);
      await expect(service.audio('one')).rejects.toMatchObject({ code: 'SPEECH_UNAVAILABLE' });
      await expect(service.audio('two')).rejects.toMatchObject({ code: 'SPEECH_UNAVAILABLE' });
      expect(p.synthesize).toHaveBeenCalledTimes(1);
      now = 61000;
      await service.audio('one');
      expect(p.synthesize).toHaveBeenCalledTimes(2);
    },
  );
  it('bounds per-owner rate windows without evicting live identities to bypass limits', () => {
    let now = 0;
    const limit = new SpeechRateLimit(() => now, 2, 1);
    limit.check('one');
    limit.check('one');
    expect(() => limit.check('one')).toThrow('SPEECH_RATE_LIMITED');
    expect(() => limit.check('two')).toThrow('SPEECH_BUSY');
    now = 60000;
    expect(() => limit.check('two')).not.toThrow();
  });
});

const apps: FastifyInstance[] = [];
afterEach(async () => {
  await Promise.all(apps.splice(0).map((a) => a.close()));
});
const id = '10000000-0000-4000-8000-000000000001',
  qid = '10000000-0000-4000-8000-000000000002';
const endpoint = `/api/practice/${id}/questions/${qid}/audio`;
async function routeFixture(auth = true) {
  const question = {
    english: 'C++',
    position: 0,
    resolution: null,
    session: { status: 'ACTIVE', practiceType: 'listening', currentPosition: 0 },
  };
  const findFirst = vi.fn().mockResolvedValue(question);
  const synthesize = vi.fn().mockResolvedValue(Buffer.from('audio'));
  const speech = new SpeechService({ cacheKey: (s) => s, synthesize }, true);
  const app = await buildApp({
    config: testConfig(),
    logger: false,
    speech,
    db: {
      userIdentity: { findUnique: vi.fn().mockResolvedValue({ userId: 'owner' }) },
      practiceQuestion: { findFirst },
    } as unknown as PrismaClient,
    identityProvider: {
      resolve: () => Promise.resolve(auth ? { provider: 'test', subject: 'owner' } : null),
    },
  });
  apps.push(app);
  return { app, findFirst, synthesize, question };
}
describe('current-question-only authenticated speech endpoint', () => {
  it('authorizes before cache access and resolves only immutable snapshot text', async () => {
    const f = await routeFixture();
    for (let i = 0; i < 2; i++) {
      const r = await f.app.inject({ method: 'POST', url: endpoint, payload: {} });
      expect(r.statusCode).toBe(200);
      expect(r.headers['content-type']).toContain('audio/mpeg');
      expect(r.headers['cache-control']).toBe('no-store');
    }
    expect(f.findFirst).toHaveBeenCalledTimes(2);
    expect(f.synthesize).toHaveBeenCalledExactlyOnceWith('C++');
    expect(f.findFirst.mock.calls[0]![0]).toMatchObject({
      where: { id: qid, sessionId: id, session: { ownerId: 'owner' } },
    });
    f.findFirst.mockResolvedValue(null);
    expect((await f.app.inject({ method: 'POST', url: endpoint, payload: {} })).statusCode).toBe(
      404,
    );
    expect(f.synthesize).toHaveBeenCalledTimes(1);
  });
  it('requires authentication without provider or question access', async () => {
    const f = await routeFixture(false);
    expect((await f.app.inject({ method: 'POST', url: endpoint, payload: {} })).statusCode).toBe(
      401,
    );
    expect(f.findFirst).not.toHaveBeenCalled();
    expect(f.synthesize).not.toHaveBeenCalled();
  });
  it.each([
    { text: 'secret' },
    { url: 'https://evil.test' },
    { provider: 'azure' },
    { provider: 'browser', english: 'answer' },
  ])('rejects arbitrary request fields %j', async (payload) => {
    const f = await routeFixture();
    expect((await f.app.inject({ method: 'POST', url: endpoint, payload })).statusCode).toBe(400);
    expect(f.synthesize).not.toHaveBeenCalled();
  });
  it.each([{ status: 'COMPLETED' }, { practiceType: 'written-recall' }, { currentPosition: 1 }])(
    'rejects stale, finished or non-listening questions %j',
    async (change) => {
      const f = await routeFixture();
      f.question.session = { ...f.question.session, ...change };
      expect((await f.app.inject({ method: 'POST', url: endpoint, payload: {} })).statusCode).toBe(
        409,
      );
      expect(f.synthesize).not.toHaveBeenCalled();
    },
  );
  it('maps provider failures to usable browser data, not secrets or raw upstream errors', async () => {
    const f = await routeFixture();
    f.synthesize.mockRejectedValue(new Error('test-key PRIVATE'));
    const r = await f.app.inject({ method: 'POST', url: endpoint, payload: {} });
    expect(r.json()).toEqual({ provider: 'browser', text: 'C plus plus', locale: 'en-US' });
    expect(r.body).not.toContain('test-key');
  });
  it('serves an explicit browser fallback without an Azure request', async () => {
    const f = await routeFixture();
    const r = await f.app.inject({
      method: 'POST',
      url: endpoint,
      payload: { provider: 'browser' },
    });
    expect(r.json()).toEqual({ provider: 'browser', text: 'C plus plus', locale: 'en-US' });
    expect(f.synthesize).not.toHaveBeenCalled();
  });
});
