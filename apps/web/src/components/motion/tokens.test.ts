// @vitest-environment node
import { describe, expect, it } from 'vitest';
import css from '../../styles/tokens.css?raw';
import { motionDuration, motionEase } from './tokens';

function cssValue(name: string): string {
  const match = new RegExp(String.raw`--${name}:\s*([^;]+);`).exec(css);
  if (!match?.[1]) throw new Error(`tokens.css does not define --${name}`);
  return match[1].trim();
}

function seconds(value: string): number {
  const match = /^(\d+(?:\.\d+)?)(ms|s)$/.exec(value);
  if (!match) throw new Error(`Unsupported duration: "${value}"`);
  const amount = Number(match[1]);
  return match[2] === 'ms' ? amount / 1000 : amount;
}

function bezier(value: string): number[] {
  const match = /^cubic-bezier\(([^)]+)\)$/.exec(value);
  if (!match?.[1]) throw new Error(`Unsupported easing: "${value}"`);
  return match[1].split(',').map((part) => Number(part.trim()));
}

describe('motion token bridge', () => {
  it.each(Object.entries(motionDuration))('duration "%s" mirrors tokens.css', (name, value) => {
    expect(value).toBe(seconds(cssValue(`duration-${name}`)));
  });

  it.each(Object.entries(motionEase))('easing "%s" mirrors tokens.css', (name, value) => {
    expect([...value]).toEqual(bezier(cssValue(`ease-${name}`)));
  });

  it('covers every motion token defined in tokens.css', () => {
    const names = (prefix: string) =>
      [...css.matchAll(new RegExp(String.raw`--${prefix}-([\w-]+):`, 'g'))]
        .map((match) => match[1])
        .sort();
    expect(names('duration')).toEqual(Object.keys(motionDuration).sort());
    expect(names('ease')).toEqual(Object.keys(motionEase).sort());
  });
});
