import { displayText, englishKey } from '../vocabulary/input.js';
import { speechLocale } from './config.js';

/** Whole-expression audio-only overrides. SQL/API are deliberately letter-spelled;
 * JSON and ordinary technical words use the selected voice's normal pronunciation. */
const overrides: Readonly<Record<string, string>> = {
  sql: 'S Q L',
  api: 'A P I',
  'c++': 'C plus plus',
};
export const spokenText = (text: string) => overrides[englishKey(text)] ?? displayText(text);
export const escapeXml = (text: string) =>
  text.replace(
    /[&<>"']/gu,
    (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&apos;' })[c]!,
  );
export function ssml(text: string, voice: string) {
  const key = englishKey(text);
  const content = ['sql', 'api'].includes(key)
    ? `<say-as interpret-as="characters">${key.toUpperCase()}</say-as>`
    : escapeXml(spokenText(text));
  return `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${speechLocale}"><voice name="${escapeXml(voice)}">${content}</voice></speak>`;
}
