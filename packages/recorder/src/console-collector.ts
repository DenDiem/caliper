import type {TraceConsoleEntry, TraceConsoleLevel} from '@caliper/core';

const LEVELS: readonly TraceConsoleLevel[] = ['log', 'info', 'warn', 'error', 'debug'];

export type ConsoleLike = Record<TraceConsoleLevel, (...args: unknown[]) => void>;

const serialise = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    // A circular or getter-throwing object must not take the page's own console down with it.
    return String(value);
  }
};

export const patchConsole = (
  target: ConsoleLike,
  sink: (entry: TraceConsoleEntry) => void,
  now: () => number,
): (() => void) => {
  const originals = new Map<TraceConsoleLevel, (...args: unknown[]) => void>();

  for (const level of LEVELS) {
    const original = target[level];
    originals.set(level, original);
    target[level] = (...args: unknown[]): void => {
      sink({t: now(), level, text: args.map(serialise).join(' ')});
      original.apply(target, args);
    };
  }

  return () => {
    for (const [level, original] of originals) target[level] = original;
  };
};
