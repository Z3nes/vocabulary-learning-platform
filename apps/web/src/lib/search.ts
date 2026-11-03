/**
 * Forgiving key for client-side filtering of the student's own words and lists.
 * Case-insensitive with Turkish rules (I/ı, İ/i), and diacritic-insensitive, so
 * "kosmak" finds "koşmak" and "ISIK" finds "ışık". Only used to narrow what is
 * shown; it never affects stored text, quiz evaluation or matching rules.
 */
export function searchKey(value: string): string {
  return value
    .normalize('NFC')
    .toLocaleLowerCase('tr-TR')
    .normalize('NFD')
    .replace(/\p{M}/gu, '')
    .replace(/ı/gu, 'i')
    .replace(/\s+/gu, ' ')
    .trim();
}

/** True when any of the texts contains the (already keyed) query. */
export function matchesSearch(query: string, texts: readonly string[]): boolean {
  if (!query) return true;
  return texts.some((text) => searchKey(text).includes(query));
}
