import { z } from 'zod';
import { ApplicationError } from '../http/errors.js';

export const displayText = (text: string) => text.trim().normalize('NFC').replace(/\s+/gu, ' ');
export const englishKey = (text: string) => displayText(text).replace(/[’‘ʼ]/gu, "'").toLowerCase();
export const meaningKey = (text: string) => displayText(text).toLocaleLowerCase('tr-TR');

/** Keyboard similarity only: never use this key for canonical equality or persistence. */
const turkishKeyboardLetters: Record<string, string> = {
  ç: 'c',
  ğ: 'g',
  ı: 'i',
  ö: 'o',
  ş: 's',
  ü: 'u',
};
export const meaningSimilarityKey = (text: string) =>
  meaningKey(text).replace(/[çğıöşü]/gu, (letter) => turkishKeyboardLetters[letter]!);

const decisionSchema = z
  .object({
    id: z
      .string()
      .max(24)
      .regex(/^[1-9]\d*:[1-9]\d*$/u),
    action: z.enum(['skip', 'keep']),
  })
  .strict();
export type SimilarityDecision = z.infer<typeof decisionSchema>;

function textSchema(kind: 'WORD' | 'MEANING', limit: number) {
  return z
    .string()
    .transform(displayText)
    .refine((text) => [...text].length > 0, `${kind}_REQUIRED`)
    .refine((text) => [...text].length <= limit, `${kind}_TOO_LONG`);
}
export const entrySchema = z
  .object({
    english: textSchema('WORD', 120),
    meanings: z.array(textSchema('MEANING', 160)).min(1, 'MEANING_REQUIRED'),
  })
  .strict();
export const editSchema = entrySchema.refine(
  (entry) => new Set(entry.meanings.map(meaningKey)).size === entry.meanings.length,
  'MEANING_ALREADY_EXISTS',
);
export type EntryInput = z.input<typeof entrySchema>;
export interface Entry {
  line: number;
  english: string;
  key: string;
  meanings: { turkish: string; key: string }[];
  warnings: string[];
}
export interface InvalidEntry {
  line: number;
  codes: string[];
}
export interface ParsedInput {
  entries: Entry[];
  invalid: InvalidEntry[];
}

const validationCodes = [
  'WORD_REQUIRED',
  'WORD_TOO_LONG',
  'MEANING_REQUIRED',
  'MEANING_TOO_LONG',
  'MEANING_ALREADY_EXISTS',
];
export function issues(error: z.ZodError): string[] {
  return [
    ...new Set(
      error.issues.map((issue) =>
        validationCodes.includes(issue.message) ? issue.message : 'VALIDATION_FAILED',
      ),
    ),
  ];
}
export function parseEntry(input: unknown, line = 1): ParsedInput {
  const parsed = entrySchema.safeParse(input);
  if (!parsed.success) return { entries: [], invalid: [{ line, codes: issues(parsed.error) }] };
  return {
    entries: [
      {
        line,
        english: parsed.data.english,
        key: englishKey(parsed.data.english),
        meanings: parsed.data.meanings.map((turkish) => ({ turkish, key: meaningKey(turkish) })),
        warnings: parsed.data.meanings.some((text) => text.includes(',')) ? ['COMMA_HINT'] : [],
      },
    ],
    invalid: [],
  };
}

/** Only parsing differs between single and bulk entry; all decisions use Entry[]. */
export function parseBulk(text: string): ParsedInput {
  if (Buffer.byteLength(text, 'utf8') > 100 * 1024)
    throw new ApplicationError(413, 'BULK_TOO_LARGE');
  const lines = text.split(/\r\n|\n/u);
  if (lines.length > 500) throw new ApplicationError(400, 'BULK_TOO_MANY_LINES');
  const result: ParsedInput = { entries: [], invalid: [] };
  lines.forEach((value, index) => {
    if (!value.trim()) return;
    const equals = value.indexOf('=');
    const tab = value.indexOf('\t');
    const separator = equals < 0 ? tab : tab < 0 ? equals : Math.min(equals, tab);
    // A TAB beyond the first separator is an ambiguous extra spreadsheet column.
    if (separator < 0 || value.slice(separator + 1).includes('\t')) {
      result.invalid.push({ line: index + 1, codes: ['BULK_INVALID_CONTENT'] });
      return;
    }
    const parsed = parseEntry(
      { english: value.slice(0, separator), meanings: value.slice(separator + 1).split(';') },
      index + 1,
    );
    result.entries.push(...parsed.entries);
    result.invalid.push(...parsed.invalid);
  });
  if (!result.entries.length && !result.invalid.length)
    result.invalid.push({ line: 1, codes: ['BULK_INVALID_CONTENT'] });
  return result;
}

export const submissionSchema = z.discriminatedUnion('kind', [
  z
    .object({
      kind: z.literal('single'),
      entry: z.unknown(),
      decisions: z.array(decisionSchema).optional(),
    })
    .strict(),
  z
    .object({
      kind: z.literal('bulk'),
      text: z.string(),
      decisions: z.array(decisionSchema).optional(),
    })
    .strict(),
]);
export type Submission = z.infer<typeof submissionSchema>;
export function parseSubmission(input: Submission): ParsedInput {
  return input.kind === 'single' ? parseEntry(input.entry) : parseBulk(input.text);
}
