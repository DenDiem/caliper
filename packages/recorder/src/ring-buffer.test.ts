import {describe, expect, it} from 'vitest';
import {createRingBuffer} from './ring-buffer';

describe('createRingBuffer', () => {
  it('discards everything while capacity is zero', () => {
    const buffer = createRingBuffer<number>(0);
    buffer.push(1);
    buffer.push(2);
    expect(buffer.size).toBe(0);
    expect(buffer.drain()).toEqual([]);
  });

  it('keeps the newest items once capacity opens', () => {
    const buffer = createRingBuffer<number>(0);
    buffer.setCapacity(3);
    for (const value of [1, 2, 3, 4, 5]) buffer.push(value);
    expect(buffer.drain()).toEqual([3, 4, 5]);
  });

  it('empties on drain', () => {
    const buffer = createRingBuffer<number>(2);
    buffer.push(1);
    buffer.drain();
    expect(buffer.drain()).toEqual([]);
    expect(buffer.size).toBe(0);
  });

  it('trims immediately when capacity shrinks', () => {
    const buffer = createRingBuffer<number>(5);
    for (const value of [1, 2, 3, 4, 5]) buffer.push(value);
    buffer.setCapacity(2);
    expect(buffer.drain()).toEqual([4, 5]);
  });
});
