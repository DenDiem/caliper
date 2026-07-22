import {describe, expect, it} from 'vitest';
import {matchToken, toStyleValues} from './match-token';

const tokens = new Map<string, string>([
  ['--color-text-primary', '#333333'],
  ['--color-surface-default', 'rgb(255, 255, 255)'],
  ['--spacing-2', '8px'],
  ['--iti-flag-width', '16px'],
  ['--offset-16px', '16px'],
]);

describe('matchToken', () => {
  it('matches an identical dimension exactly', () => {
    expect(matchToken('padding-top', '8px', tokens)).toEqual({
      token: '--spacing-2',
      tokenMatch: 'exact',
    });
  });

  it('matches a colour across notations exactly', () => {
    expect(matchToken('color', 'rgb(51, 51, 51)', tokens)).toEqual({
      token: '--color-text-primary',
      tokenMatch: 'exact',
    });
  });

  it('matches an imperceptibly close colour as nearest', () => {
    expect(matchToken('color', 'rgb(52, 51, 50)', tokens)).toEqual({
      token: '--color-text-primary',
      tokenMatch: 'nearest',
    });
  });

  it('refuses to guess when several tokens share the value', () => {
    expect(matchToken('padding-top', '16px', tokens)).toEqual({token: null, tokenMatch: null});
  });

  it('never matches a dimension against a colour token', () => {
    expect(matchToken('padding-top', 'rgb(51, 51, 51)', tokens)).toEqual({
      token: null,
      tokenMatch: null,
    });
  });

  it('never matches a colour against a dimension token', () => {
    expect(matchToken('color', '8px', tokens)).toEqual({token: null, tokenMatch: null});
  });

  it('ignores properties that carry no token semantics', () => {
    expect(matchToken('display', '8px', tokens)).toEqual({token: null, tokenMatch: null});
  });

  it('returns null when nothing is close', () => {
    expect(matchToken('color', 'rgb(255, 0, 0)', tokens)).toEqual({token: null, tokenMatch: null});
    expect(matchToken('font-size', '13px', tokens)).toEqual({token: null, tokenMatch: null});
  });
});

describe('toStyleValues', () => {
  it('annotates a matched style with its token', () => {
    const result = toStyleValues({color: 'rgb(51, 51, 51)'}, tokens);
    expect(result['color']).toEqual({
      value: 'rgb(51, 51, 51)',
      token: '--color-text-primary',
      tokenMatch: 'exact',
    });
  });

  it('omits the token keys entirely when nothing matched', () => {
    const result = toStyleValues({'font-size': '13px'}, tokens);
    expect(result['font-size']).toEqual({value: '13px'});
  });
});
