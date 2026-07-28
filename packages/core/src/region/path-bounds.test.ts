import {describe, expect, it} from 'vitest';
import {pathBounds} from './path-bounds';

describe('pathBounds', () => {
  it('returns a zero box for an empty path', () => {
    expect(pathBounds([])).toEqual({x: 0, y: 0, width: 0, height: 0});
  });

  it('wraps every point in the path', () => {
    const box = pathBounds([
      {x: 30, y: 10},
      {x: 10, y: 40},
      {x: 50, y: 25},
      {x: 20, y: 5},
    ]);
    expect(box).toEqual({x: 10, y: 5, width: 40, height: 35});
  });

  it('collapses a single point to a zero-size box at that point', () => {
    expect(pathBounds([{x: 7, y: 9}])).toEqual({x: 7, y: 9, width: 0, height: 0});
  });
});
