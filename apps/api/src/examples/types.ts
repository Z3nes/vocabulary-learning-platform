import type { SearchSpec } from './matching.js';

export interface Attribution {
  id: string;
  text: string;
  sourceUrl: string;
  contributor?: string;
  license: { name: string; url: string };
}
export interface ExampleSentence extends Attribution {
  provider: 'Tatoeba';
  matchedForm: string;
  translation?: Attribution;
}
export interface ExampleResult {
  examples: ExampleSentence[];
}
export interface ExampleSentenceProvider {
  candidates(spec: SearchSpec): Promise<ExampleSentence[]>;
}
