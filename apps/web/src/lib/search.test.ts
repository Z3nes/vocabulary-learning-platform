// @vitest-environment node
import { describe, expect, it } from 'vitest';
import { matchesSearch, searchKey } from './search';

describe('searchKey', () => {
  it('folds Turkish dotted and dotless I in both cases', () => {
    expect(searchKey('IŞIK')).toBe('isik');
    expect(searchKey('ışık')).toBe('isik');
    expect(searchKey('İzmir')).toBe('izmir');
  });

  it('ignores diacritics, case and repeated spaces', () => {
    expect(searchKey('  Koşmak   Çalışmak ')).toBe('kosmak calismak');
    expect(searchKey('Binary  Search')).toBe('binary search');
  });
});

describe('matchesSearch', () => {
  it('matches English words and Turkish meanings with a keyed query', () => {
    const texts = ['run', 'koşmak', 'çalıştırmak'];
    expect(matchesSearch(searchKey('KOS'), texts)).toBe(true);
    expect(matchesSearch(searchKey('calis'), texts)).toBe(true);
    expect(matchesSearch(searchKey('Ru'), texts)).toBe(true);
    expect(matchesSearch(searchKey('walk'), texts)).toBe(false);
  });

  it('treats an empty query as a match', () => {
    expect(matchesSearch('', ['anything'])).toBe(true);
  });
});
