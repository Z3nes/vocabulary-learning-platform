import { describe, expect, it } from 'vitest';
import { answerSnapshot, evaluateAnswer } from '../src/practice/evaluation.js';
import { englishKey } from '../src/vocabulary/input.js';
import { sessionCardCount, shuffle } from '../src/study/selection.js';
import { buildApp } from '../src/app.js';
import { testConfig } from './helpers.js';

describe('exact written recall', () => {
  const target = { english: 'algorithm', acceptedAnswers: ['algorithm'], overlappingAnswers: [] };
  it.each(['algorithm', 'Algorithm', ' algorithm ', 'ALGORITHM'])(
    'accepts exact normalized %s',
    (answer) => {
      expect(evaluateAnswer(target, answer)).toMatchObject({
        correct: true,
        masteryEligible: true,
        feedback: 'target',
      });
    },
  );
  it.each(['algoritm', 'algorith', 'algoritmh', 'algorithmx'])(
    'rejects misspelling %s',
    (answer) => {
      expect(evaluateAnswer(target, answer)).toMatchObject({
        correct: false,
        masteryEligible: false,
        feedback: 'incorrect',
      });
    },
  );
  it.each([
    ['machine learning', '  Machine\t  learning  '],
    ['café', 'cafe\u0301'],
    ["don't", 'don’t'],
    ["don't", 'don‘t'],
    ["don't", 'donʼt'],
    ['C++', 'c++'],
  ])('uses the existing canonical English key: %s / %s', (english, answer) => {
    expect(
      evaluateAnswer(
        { english, acceptedAnswers: [englishKey(english)], overlappingAnswers: [] },
        answer,
      ).masteryEligible,
    ).toBe(true);
  });
  it.each([
    ['C++', 'C'],
    ["don't", 'dont'],
    ['machine learning', 'machinelearning'],
  ])('preserves meaningful punctuation/spacing %s', (english, answer) => {
    expect(
      evaluateAnswer(
        { english, acceptedAnswers: [englishKey(english)], overlappingAnswers: [] },
        answer,
      ).correct,
    ).toBe(false);
  });
  it('compares complete Turkish sets independently of order and freezes alternatives and overlap feedback', () => {
    const target = { id: 'a', english: 'big', meanings: ['BÜYÜK', 'iri'] };
    const words = [
      target,
      { id: 'b', english: 'large', meanings: ['iri', 'büyük'] },
      { id: 'c', english: 'huge', meanings: ['büyük'] },
      { id: 'd', english: 'tall', meanings: ['uzun'] },
    ];
    const frozen = { english: target.english, ...answerSnapshot(target, words) };
    expect(evaluateAnswer(frozen, 'large')).toMatchObject({
      correct: true,
      masteryEligible: false,
      feedback: 'alternative',
    });
    expect(evaluateAnswer(frozen, 'huge')).toMatchObject({
      correct: false,
      masteryEligible: false,
      feedback: 'overlap',
    });
    expect(evaluateAnswer(frozen, 'hug')).toMatchObject({ feedback: 'incorrect' });
    words[1]!.meanings = ['başka'];
    expect(evaluateAnswer(frozen, 'large').correct).toBe(true);
    expect(frozen.acceptedAnswers).toEqual(['big', 'large']);
  });
  it.each([
    [20, [3, 5, 10, 20]],
    [80, [12, 20, 40, 80]],
    [250, [38, 63, 125, 250]],
    [1, [1, 1, 1, 1]],
    [0, [0, 0, 0, 0]],
  ])('rounds eligible count %s without a ten-question cap', (count, expected) => {
    expect(([15, 25, 50, 100] as const).map((p) => sessionCardCount(count, p))).toEqual(expected);
  });
  it('shuffles without repeating or mutating identities', () => {
    const ids = Array.from({ length: 250 }, (_, i) => i);
    expect(new Set(shuffle(ids)).size).toBe(250);
    expect(ids[0]).toBe(0);
  });
});

describe('retired example routes', () => {
  it.each([undefined, false])(
    'does not register example routes when enabled=%s',
    async (enabled) => {
      const app = await buildApp({
        config: testConfig(enabled === undefined ? {} : { exampleSentencesEnabled: enabled }),
        logger: false,
      });
      try {
        for (const url of [
          '/api/lists/:listId/words/:wordId/examples',
          '/api/study-sessions/:sessionId/cards/:cardId/examples',
        ])
          expect(app.hasRoute({ method: 'GET', url })).toBe(false);
        expect(
          (
            await app.inject(
              '/api/lists/10000000-0000-4000-8000-000000000001/words/10000000-0000-4000-8000-000000000002/examples',
            )
          ).statusCode,
        ).toBe(404);
      } finally {
        await app.close();
      }
    },
  );
});
