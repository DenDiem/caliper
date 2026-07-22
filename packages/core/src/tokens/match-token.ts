import type {StyleValue} from '../schema/annotation.schema';
import {deltaE, parseColor} from './color';

export type TokenMap = Map<string, string>;

const NEAREST_COLOR_THRESHOLD = 3;

const COLOR_PROPERTIES: ReadonlySet<string> = new Set([
  'color',
  'background-color',
  'border-top-color',
]);

const DIMENSION_PROPERTY_PATTERN =
  /^(padding|margin|gap|row-gap|column-gap|font-size|line-height|letter-spacing|min-height|max-width|border-radius)|-width$/;

const DIMENSION_VALUE_PATTERN = /^-?[\d.]+(px|rem|em|%)$/;

export interface TokenMatch {
  token: string | null;
  tokenMatch: 'exact' | 'nearest' | null;
}

const NO_MATCH: TokenMatch = {token: null, tokenMatch: null};

const namesWithValue = (tokens: TokenMap, predicate: (value: string) => boolean): string[] => {
  const names: string[] = [];
  for (const [name, value] of tokens) {
    if (predicate(value.trim())) names.push(name);
  }
  return names;
};

const NAME_HINTS: Readonly<Record<string, readonly string[]>> = {
  padding: ['pad', 'offset', 'space', 'gap', 'inset'],
  margin: ['margin', 'offset', 'space', 'gap'],
  gap: ['gap', 'space', 'offset'],
  'font-size': ['font', 'text', 'size'],
  'line-height': ['line', 'leading', 'height'],
  'letter-spacing': ['letter', 'tracking'],
  'border-radius': ['radius', 'round', 'corner'],
  'min-height': ['height', 'size'],
  'max-width': ['width', 'size'],
};

const hintsFor = (property: string): readonly string[] => {
  const direct = NAME_HINTS[property];
  if (direct) return direct;

  const group = Object.keys(NAME_HINTS).find((key) => property.startsWith(key));
  return group ? (NAME_HINTS[group] ?? []) : [];
};

const preferByName = (property: string, candidates: readonly string[]): string | null => {
  const hints = hintsFor(property);
  const preferred = candidates.filter((name) =>
    hints.some((hint) => name.toLowerCase().includes(hint)),
  );
  return preferred.length === 1 ? (preferred[0] ?? null) : null;
};

const matchDimension = (property: string, value: string, tokens: TokenMap): TokenMatch => {
  if (!DIMENSION_VALUE_PATTERN.test(value)) return NO_MATCH;

  const candidates = namesWithValue(tokens, (tokenValue) => tokenValue === value);
  if (candidates.length === 0) return NO_MATCH;

  const only = candidates.length === 1 ? candidates[0] : preferByName(property, candidates);

  return only ? {token: only, tokenMatch: 'exact'} : NO_MATCH;
};

const matchColor = (value: string, tokens: TokenMap): TokenMatch => {
  const color = parseColor(value);
  if (!color) return NO_MATCH;

  let bestName: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  let ties = 0;

  for (const [name, tokenValue] of tokens) {
    const tokenColor = parseColor(tokenValue);
    if (!tokenColor) continue;

    const distance = deltaE(color, tokenColor);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestName = name;
      ties = 1;
      continue;
    }
    if (distance === bestDistance) ties += 1;
  }

  if (bestName === null || ties > 1) return NO_MATCH;
  if (bestDistance === 0) return {token: bestName, tokenMatch: 'exact'};
  if (bestDistance < NEAREST_COLOR_THRESHOLD) return {token: bestName, tokenMatch: 'nearest'};
  return NO_MATCH;
};

export const matchToken = (property: string, value: string, tokens: TokenMap): TokenMatch => {
  const normalized = value.trim();

  if (COLOR_PROPERTIES.has(property)) return matchColor(normalized, tokens);
  if (DIMENSION_PROPERTY_PATTERN.test(property)) return matchDimension(property, normalized, tokens);

  return NO_MATCH;
};

export const toStyleValues = (
  styles: Record<string, string>,
  tokens: TokenMap,
): Record<string, StyleValue> => {
  const result: Record<string, StyleValue> = {};

  for (const [property, value] of Object.entries(styles)) {
    const {token, tokenMatch} = matchToken(property, value, tokens);
    result[property] = token ? {value, token, tokenMatch} : {value};
  }

  return result;
};
