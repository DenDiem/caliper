import {describe, expect, it} from 'vitest';
import {matchToken, toStyleValues} from './match-token';

const tokens = new Map<string, string>([
  ['--color-text-primary', '#333333'],
  ['--color-surface-default', 'rgb(255, 255, 255)'],
  ['--spacing-2', '8px'],
]);

describe('matchToken', () => {
  it('matches an identical string exactly', () => {
    expect(matchToken('8px', tokens)).toEqual({token: '--spacing-2', tokenMatch: 'exact'});
  });

  it('matches a colour across notations exactly', () => {
    expect(matchToken('rgb(51, 51, 51)', tokens)).toEqual({
      token: '--color-text-primary',
      tokenMatch: 'exact',
    });
  });

  it('matches an imperceptibly close colour as nearest', () => {
    expect(matchToken('rgb(52, 51, 50)', tokens)).toEqual({
      token: '--color-text-primary',
      tokenMatch: 'nearest',
    });
  });

  it('returns null when nothing is close', () => {
    expect(matchToken('rgb(255, 0, 0)', tokens)).toEqual({token: null, tokenMatch: null});
    expect(matchToken('13px', tokens)).toEqual({token: null, tokenMatch: null});
  });
});

describe('toStyleValues', () => {
  it('annotates each style with its token', () => {
    const result = toStyleValues({color: 'rgb(51, 51, 51)', 'font-size': '13px'}, tokens);
    expect(result['color']).toEqual({
      value: 'rgb(51, 51, 51)',
      token: '--color-text-primary',
      tokenMatch: 'exact',
    });
    expect(result['font-size']).toEqual({value: '13px', token: null, tokenMatch: null});
  });
});
