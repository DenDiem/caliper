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

const matchDimension = (value: string, tokens: TokenMap): TokenMatch => {
  if (!DIMENSION_VALUE_PATTERN.test(value)) return NO_MATCH;

  const candidates = namesWithValue(tokens, (tokenValue) => tokenValue === value);
  const only = candidates.length === 1 ? candidates[0] : null;

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
  if (DIMENSION_PROPERTY_PATTERN.test(property)) return matchDimension(normalized, tokens);

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
