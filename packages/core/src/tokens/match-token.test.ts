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

  it('refuses to guess when several tokens share the value and none fits the property', () => {
    const tied = new Map<string, string>([
      ['--iti-flag-width', '16px'],
      ['--mat-badge-size', '16px'],
    ]);
    expect(matchToken('padding-top', '16px', tied)).toEqual({token: null, tokenMatch: null});
  });

  it('picks the token whose name fits the property when values tie', () => {
    const tied = new Map<string, string>([
      ['--iti-flag-width', '20px'],
      ['--offset-20px', '20px'],
    ]);
    expect(matchToken('padding-top', '20px', tied)).toEqual({
      token: '--offset-20px',
      tokenMatch: 'exact',
    });
  });

  it('matches a background against a token whose value is a named colour', () => {
    const surface = new Map<string, string>([['--color-surface', 'white']]);
    expect(matchToken('background-color', 'rgb(255, 255, 255)', surface)).toEqual({
      token: '--color-surface',
      tokenMatch: 'exact',
    });
  });

  it('matches white written in any notation against a hex token', () => {
    const surface = new Map<string, string>([['--color-surface', '#ffffff']]);
    for (const value of ['#fff', '#ffffff', 'rgb(255,255,255)', 'white']) {
      expect(matchToken('background-color', value, surface)).toEqual({
        token: '--color-surface',
        tokenMatch: 'exact',
      });
    }
  });

  it('matches an exact colour even when several tokens hold that identical value', () => {
    const palette = new Map<string, string>([
      ['--color-surface', '#ffffff'],
      ['--color-white', '#ffffff'],
      ['--color-bg-elevated', 'rgb(255, 255, 255)'],
      ['--color-border', '#e4e7ec'],
    ]);
    expect(matchToken('background-color', 'rgb(255, 255, 255)', palette)).toEqual({
      token: '--color-surface',
      tokenMatch: 'exact',
    });
    expect(matchToken('border-top-color', 'rgb(228, 231, 236)', palette)).toEqual({
      token: '--color-border',
      tokenMatch: 'exact',
    });
  });

  it('treats the same colour written in different notations as one unambiguous match', () => {
    const palette = new Map<string, string>([
      ['--color-surface', 'white'],
      ['--color-white', '#ffffff'],
    ]);
    expect(matchToken('background-color', 'rgb(255, 255, 255)', palette)).toEqual({
      token: '--color-surface',
      tokenMatch: 'exact',
    });
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

  it('matches every component of a multi-value shorthand and joins the tokens', () => {
    const space = new Map<string, string>([
      ['--space-5', '32px'],
      ['--space-4', '24px'],
    ]);
    expect(matchToken('padding', '32px 24px', space)).toEqual({
      token: '--space-5 --space-4',
      tokenMatch: 'exact',
    });
    expect(matchToken('border-radius', '32px 24px 32px 24px', space)).toEqual({
      token: '--space-5 --space-4 --space-5 --space-4',
      tokenMatch: 'exact',
    });
  });

  it('reports a shorthand as partial when only some components match, keeping the raw hardcode', () => {
    const space = new Map<string, string>([['--space-5', '32px']]);
    expect(matchToken('padding', '32px 13px', space)).toEqual({
      token: '--space-5 13px',
      tokenMatch: 'partial',
    });
  });

  it('returns null for a shorthand where no component matches', () => {
    const space = new Map<string, string>([['--space-5', '32px']]);
    expect(matchToken('padding', '13px 11px', space)).toEqual({token: null, tokenMatch: null});
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
