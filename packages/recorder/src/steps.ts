import type {TraceStep} from '@caliper/core';

const TEXT_LIMIT = 60;
// Only keys that move or submit are steps. Recording every keystroke would both bury the timeline and
// transcribe whatever the tester typed, which no debugging question needs.
const MEANINGFUL_KEYS = new Set([
  'Enter',
  'Escape',
  'Tab',
  'ArrowUp',
  'ArrowDown',
  'ArrowLeft',
  'ArrowRight',
]);

const label = (element: Element): string => {
  const text = (element.textContent ?? '').replace(/\s+/g, ' ').trim();
  return text.length > TEXT_LIMIT ? `${text.slice(0, TEXT_LIMIT)}…` : text;
};

// An input's step says that it changed and by how much, never what it now holds. A trace is attached to
// tickets, and field contents are the one channel where carrying them is gratuitous.
const inputLabel = (element: Element): string => {
  const value: unknown = Reflect.get(element, 'value');
  return `${typeof value === 'string' ? value.length : 0} chars`;
};

export const describeStep = (
  event: Event,
  t: number,
  selectorOf: (element: Element) => string,
): TraceStep | null => {
  const {target} = event;
  if (!(target instanceof Element)) return null;

  if (event.type === 'click') {
    return {t, kind: 'click', selector: selectorOf(target), text: label(target)};
  }
  if (event.type === 'input' || event.type === 'change') {
    return {t, kind: 'input', selector: selectorOf(target), text: inputLabel(target)};
  }
  if (event.type === 'keydown' && event instanceof KeyboardEvent && MEANINGFUL_KEYS.has(event.key)) {
    return {t, kind: 'key', selector: selectorOf(target), text: event.key};
  }
  return null;
};

export const navigationStep = (t: number, url: string): TraceStep => ({t, kind: 'navigation', url});
