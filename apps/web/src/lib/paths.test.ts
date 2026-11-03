// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { apiUrl } from './api';
import { normalizeBasePath, resolveApiBasePath, toRouterBasename } from './paths';

describe('normalizeBasePath', () => {
  it.each([
    [undefined, '/'],
    ['', '/'],
    ['/', '/'],
    ['kelime', '/kelime/'],
    ['/kelime', '/kelime/'],
    ['/kelime/', '/kelime/'],
    ['//fakulte//kelime//', '/fakulte/kelime/'],
  ])('%j -> %j', (input, expected) => {
    expect(normalizeBasePath(input)).toBe(expected);
  });

  it('rejects absolute URLs and parent segments (keeps the app same-origin)', () => {
    expect(() => normalizeBasePath('https://example.org/app')).toThrow();
    expect(() => normalizeBasePath('/app/../x')).toThrow();
    expect(() => normalizeBasePath('/a b')).toThrow();
  });
});

describe('resolveApiBasePath', () => {
  it('derives the API path from the base path by default', () => {
    expect(resolveApiBasePath('/')).toBe('/api');
    expect(resolveApiBasePath('/kelime/')).toBe('/kelime/api');
  });

  it('prefers an explicit override', () => {
    expect(resolveApiBasePath('/kelime/', '/servis/api/')).toBe('/servis/api');
    expect(resolveApiBasePath('/kelime/', '  ')).toBe('/kelime/api');
  });
});

describe('toRouterBasename', () => {
  it('strips the trailing slash except for the root', () => {
    expect(toRouterBasename('/')).toBe('/');
    expect(toRouterBasename('/kelime/')).toBe('/kelime');
  });
});

describe('apiUrl', () => {
  it('joins without duplicate slashes', () => {
    expect(apiUrl('/health', '/api')).toBe('/api/health');
    expect(apiUrl('health/db', '/kelime/api/')).toBe('/kelime/api/health/db');
    expect(apiUrl('/health', '/')).toBe('/health');
  });
});
