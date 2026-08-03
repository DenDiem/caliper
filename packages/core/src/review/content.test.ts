import {describe, expect, it} from 'vitest';
import {isSubstantiveText} from './content';

describe('isSubstantiveText', () => {
  it('accepts a real answer', () => {
    expect(isSubstantiveText('use spacing-2')).toBe(true);
    expect(isSubstantiveText('no')).toBe(true);
  });

  it('rejects a single stray character', () => {
    expect(isSubstantiveText('1')).toBe(false);
    expect(isSubstantiveText(' x ')).toBe(false);
  });

  it('rejects a digit-only string with no letters', () => {
    expect(isSubstantiveText('421')).toBe(false);
    expect(isSubstantiveText('123')).toBe(false);
  });

  it('rejects whitespace and empty', () => {
    expect(isSubstantiveText('')).toBe(false);
    expect(isSubstantiveText('   ')).toBe(false);
  });

  it('accepts non-latin letters', () => {
    expect(isSubstantiveText('так')).toBe(true);
  });
});
