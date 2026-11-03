import { describe, expect, it } from 'vitest';
import { ApiError } from './api';
import { apiErrorMessage, validateListTitle } from './apiErrors';

describe('list validation and safe API error messages', () => {
  it('normalizes NFC, trims titles and counts Unicode characters consistently', () => {
    expect(validateListTitle('  I\u0307lk  ')).toEqual({ title: 'İlk' });
    expect(validateListTitle('a'.repeat(100)).error).toBeUndefined();
    expect(validateListTitle('a'.repeat(101)).error).toBeDefined();
    expect(validateListTitle('😀'.repeat(100)).error).toBeUndefined();
    expect(validateListTitle('  ').error).toBe('Listene bir başlık ver.');
  });
  it.each([
    'VALIDATION_FAILED',
    'TITLE_REQUIRED',
    'TITLE_TOO_LONG',
    'LIST_NOT_FOUND',
    'UNAUTHENTICATED',
    'INTERNAL_ERROR',
  ])('translates %s without exposing the server message', (code) => {
    const translated = apiErrorMessage(new ApiError('sensitive backend text', 400, code));
    expect(translated).not.toContain('sensitive');
    expect(translated).not.toContain(code);
    expect(translated.length).toBeGreaterThan(10);
  });
  it('uses safe fallbacks for unknown codes and network failures', () => {
    expect(apiErrorMessage(new ApiError('secret', 500, 'FUTURE_CODE'))).toBe(
      'İşlemin tamamlanamadı. Daha sonra tekrar dene.',
    );
    expect(apiErrorMessage(new Error('secret'))).toBe(
      'Sunucuya ulaşılamıyor. Bağlantını kontrol edip tekrar dene.',
    );
    expect(apiErrorMessage(new ApiError('secret', 500, '__proto__'))).toBe(
      'İşlemin tamamlanamadı. Daha sonra tekrar dene.',
    );
  });
});
