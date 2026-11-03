import { describe, expect, it } from 'vitest';
import { ConfigError, loadConfig } from '../src/config/env.js';

describe('loadConfig', () => {
  it('applies development defaults', () => {
    expect(loadConfig({})).toEqual({
      host: '127.0.0.1',
      port: 3000,
      apiPrefix: '/api',
      logLevel: 'info',
      databaseUrl: undefined,
      nodeEnv: 'development',
      authMode: undefined,
      exampleSentencesEnabled: false,
      speech: {
        enabled: true,
        voice: 'en-US-JennyNeural',
        format: 'audio-24khz-48kbitrate-mono-mp3',
        cacheEnabled: false,
      },
    });
  });

  it('normalizes the API prefix and treats an empty DATABASE_URL as unset', () => {
    const config = loadConfig({ API_PREFIX: '/kelime/api/', DATABASE_URL: '  ' });
    expect(config.apiPrefix).toBe('/kelime/api');
    expect(config.databaseUrl).toBeUndefined();
  });

  it('rejects invalid values', () => {
    expect(loadConfig({ EXAMPLE_SENTENCES_ENABLED: 'true' }).exampleSentencesEnabled).toBe(true);
    expect(loadConfig({ EXAMPLE_SENTENCES_ENABLED: 'false' }).exampleSentencesEnabled).toBe(false);
    expect(() => loadConfig({ EXAMPLE_SENTENCES_ENABLED: '1' })).toThrow(ConfigError);
    expect(() => loadConfig({ PORT: 'abc' })).toThrow(ConfigError);
    expect(() => loadConfig({ API_PREFIX: 'api' })).toThrow(ConfigError);
  });

  it('does not echo a rejected database URL in the error', () => {
    expect(() => loadConfig({ DATABASE_URL: 'mysql://user:secret@host/db' })).toThrow(
      expect.objectContaining({
        name: 'ConfigError',
        message: expect.not.stringContaining('secret') as unknown,
      }),
    );
  });
});
