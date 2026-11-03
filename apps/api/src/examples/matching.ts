import { ApplicationError } from '../http/errors.js';
import { irregularVerbs } from './irregular.js';

// Unknown words get exact matching only; reviewed nouns also get plurals. -ed/-ing is
// restricted to these reviewed bases, rather than guessing a part of speech.
const regularVerbs = new Set(
  `accept add agree allow answer appear arrive ask bake believe borrow call carry change check clean close collect compare complete cook copy count create cry dance decide deliver describe develop die discover discuss enjoy enter explain finish fix follow help hope improve include invite join jump like listen live look love manage move need notice offer open order organize paint pass phone place plan play prefer prepare promise protect provide pull push rain reach receive remember repeat reply return save search seem share shop smile start stay stop study talk travel try turn use visit wait walk want wash watch work worry`.split(
    ' ',
  ),
);
const doubled = new Set(
  `admit begin bet bid chat clap commit cut dig drop fit forbid forget get hit hug jog knit let nod occur permit plan prefer put quit refer regret rob run set shop shut sit skip slip spin split spot stop submit swim win wrap`.split(
    ' ',
  ),
);
const regularPlurals = new Set(
  `apple book car city class box bus family story baby day key boy toy dictionary university word sentence list game cat dog student teacher friend house room school road computer table chair phone bird flower tree garden question answer language lesson week month year hour minute country library party company`.split(
    ' ',
  ),
);
const phrases = new Set([
  'look after',
  'give up',
  'take into account',
  'look for',
  'look up',
  'get up',
  'come back',
  'go on',
  'find out',
  'carry out',
  'take off',
  'put on',
]);
const present: Record<string, string> = { be: 'is', have: 'has', do: 'does', go: 'goes' };
const uninflected = new Set([
  'can',
  'could',
  'may',
  'might',
  'must',
  'shall',
  'should',
  'will',
  'would',
]);

export function normalizeText(text: string): string {
  return text.normalize('NFC').replace(/[’‘]/gu, "'").toLowerCase().trim().replace(/\s+/gu, ' ');
}
export function tokens(text: string): string[] {
  return normalizeText(text).match(/[\p{L}\p{N}]+(?:'[\p{L}\p{N}]+)*/gu) ?? [];
}
function formsFor(base: string): string[] {
  if (!/^[a-z]{2,25}$/u.test(base) || uninflected.has(base)) return [base];
  const third =
    present[base] ??
    (/[bcdfghjklmnpqrstvwxyz]y$/u.test(base)
      ? `${base.slice(0, -1)}ies`
      : /(?:s|x|z|ch|sh)$/u.test(base)
        ? `${base}es`
        : `${base}s`);
  const irregular = irregularVerbs.get(base);
  if (!irregular && !regularVerbs.has(base))
    return regularPlurals.has(base) ? [base, third] : [base];
  const stem = doubled.has(base) ? base + base.at(-1)! : base;
  const ing =
    base === 'be'
      ? 'being'
      : /ie$/u.test(base)
        ? `${base.slice(0, -2)}ying`
        : /[^e]e$/u.test(base)
          ? `${base.slice(0, -1)}ing`
          : `${stem}ing`;
  const past = /[bcdfghjklmnpqrstvwxyz]y$/u.test(base)
    ? `${base.slice(0, -1)}ied`
    : base.endsWith('e')
      ? `${base}d`
      : `${stem}ed`;
  return [...new Set([base, third, ing, ...(irregular ?? [past])])];
}
export interface SearchSpec {
  expression: string;
  forms: string[];
  queries: string[];
  sourceLanguage: 'eng';
  translationLanguage: 'tur';
  configuration: string;
}
export function searchSpec(input: string): SearchSpec {
  const expression = normalizeText(input)
    .replace(/[.!?]+$/u, '')
    .trim();
  // Operators are rejected, not escaped into executable search syntax. Apostrophes
  // and internal hyphens are accepted; punctuation within sentences is tokenized.
  if (
    expression.length > 100 ||
    !/^[a-z]+(?:'[a-z]+)?(?:[ -][a-z]+(?:'[a-z]+)?){0,5}$/u.test(expression)
  ) {
    throw new ApplicationError(422, 'EXAMPLES_UNSUPPORTED');
  }
  const parts = expression.split(' ');
  const forms =
    parts.length === 1
      ? formsFor(expression)
      : phrases.has(expression)
        ? formsFor(parts[0]!).map((form) => [form, ...parts.slice(1)].join(' '))
        : [expression];
  // One bounded page per form ensures rare irregular forms are not starved by
  // thousands of base-form results. '=' disables provider stemming explicitly.
  const queries = forms.map((form) => `="${form.replace(/-/gu, ' ')}"`);
  if (queries.some((query) => query.length > 120) || queries.length > 9)
    throw new ApplicationError(422, 'EXAMPLES_UNSUPPORTED');
  return {
    expression,
    forms,
    queries,
    sourceLanguage: 'eng',
    translationLanguage: 'tur',
    // Part of the shared cache key: change it whenever retrieval or filtering changes.
    configuration: 'v1:direct:owned:approved:context6-24+fallback2-35:quality2:12perform',
  };
}
export function matchedForm(text: string, forms: readonly string[]): string | undefined {
  const actual = tokens(text);
  return forms.find((form) => {
    const expected = tokens(form);
    return actual.some((_, start) =>
      expected.every((token, offset) => actual[start + offset] === token),
    );
  });
}
