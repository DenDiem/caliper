import {describe, expect, it} from 'vitest';
import {deltaE, parseColor} from './color';

describe('parseColor', () => {
  it('parses 6-digit hex', () => {
    expect(parseColor('#333333')).toEqual({r: 51, g: 51, b: 51});
  });

  it('parses 3-digit hex', () => {
    expect(parseColor('#333')).toEqual({r: 51, g: 51, b: 51});
  });

  it('parses rgb() with and without spaces', () => {
    expect(parseColor('rgb(51,51,51)')).toEqual({r: 51, g: 51, b: 51});
    expect(parseColor('rgb(51, 51, 51)')).toEqual({r: 51, g: 51, b: 51});
  });

  it('parses rgba() and drops alpha', () => {
    expect(parseColor('rgba(51, 51, 51, 0.5)')).toEqual({r: 51, g: 51, b: 51});
  });

  it('returns null for a non-colour', () => {
    expect(parseColor('8px')).toBeNull();
    expect(parseColor('var(--x)')).toBeNull();
  });
});

describe('deltaE', () => {
  it('is zero for identical colours', () => {
    expect(deltaE({r: 51, g: 51, b: 51}, {r: 51, g: 51, b: 51})).toBe(0);
  });

  it('is under 3 for imperceptibly close colours', () => {
    expect(deltaE({r: 51, g: 51, b: 51}, {r: 52, g: 51, b: 50})).toBeLessThan(3);
  });

  it('is well over 3 for clearly different colours', () => {
    expect(deltaE({r: 255, g: 0, b: 0}, {r: 0, g: 0, b: 255})).toBeGreaterThan(3);
  });
});
