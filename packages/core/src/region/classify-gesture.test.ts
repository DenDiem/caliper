import {describe, expect, it} from 'vitest';
import {classifyGesture} from './classify-gesture';
import type {Point} from '../schema/annotation.schema';

const circle = (): Point[] =>
  Array.from({length: 16}, (_, index) => {
    const angle = (index / 16) * Math.PI * 2;
    return {x: 200 + Math.cos(angle) * 80, y: 150 + Math.sin(angle) * 60};
  });

describe('classifyGesture', () => {
  it('treats a single tap as a pick', () => {
    expect(classifyGesture([{x: 100, y: 100}])).toBe('pick');
  });

  it('treats a tiny drag as a pick', () => {
    expect(
      classifyGesture([
        {x: 100, y: 100},
        {x: 103, y: 101},
        {x: 105, y: 102},
      ]),
    ).toBe('pick');
  });

  it('detects a horizontal scribble as a strike', () => {
    const scribble: Point[] = [
      {x: 100, y: 100},
      {x: 200, y: 104},
      {x: 100, y: 108},
      {x: 200, y: 112},
      {x: 100, y: 116},
      {x: 200, y: 120},
    ];
    expect(classifyGesture(scribble)).toBe('strike');
  });

  it('detects a drawn loop as a lasso', () => {
    expect(classifyGesture(circle())).toBe('lasso');
  });
});
