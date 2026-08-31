import {describe, expect, it, vi} from 'vitest';
import type {TraceConsoleEntry} from '@caliper/core';
import {patchConsole} from './console-collector';

const host = () => ({
  log: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
});

describe('patchConsole', () => {
  it('records each level with a relative timestamp', () => {
    const entries: TraceConsoleEntry[] = [];
    const target = host();
    let clock = 0;
    patchConsole(
      target,
      (entry) => entries.push(entry),
      () => (clock += 100),
    );

    target.warn('careful');
    target.error('boom');

    expect(entries).toEqual([
      {t: 100, level: 'warn', text: 'careful'},
      {t: 200, level: 'error', text: 'boom'},
    ]);
  });

  it('still calls through to the original console', () => {
    const target = host();
    const original = target.log;
    patchConsole(
      target,
      () => undefined,
      () => 0,
    );
    target.log('hello');
    expect(original).toHaveBeenCalledWith('hello');
  });

  it('serialises non-string arguments and joins them', () => {
    const entries: TraceConsoleEntry[] = [];
    const target = host();
    patchConsole(
      target,
      (entry) => entries.push(entry),
      () => 0,
    );
    target.log('count', {n: 2});
    expect(entries[0].text).toBe('count {"n":2}');
  });

  it('restores the originals on uninstall', () => {
    const target = host();
    const original = target.log;
    patchConsole(
      target,
      () => undefined,
      () => 0,
    )();
    expect(target.log).toBe(original);
  });
});
