import type {StyleValue} from '../schema/annotation.schema';
import {deltaE, parseColor} from './color';

export type TokenMap = Map<string, string>;

const NEAREST_COLOR_THRESHOLD = 3;

export interface TokenMatch {
  token: string | null;
  tokenMatch: 'exact' | 'nearest' | null;
}

const NO_MATCH: TokenMatch = {token: null, tokenMatch: null};

export const matchToken = (value: string, tokens: TokenMap): TokenMatch => {
  const normalized = value.trim();

  for (const [name, tokenValue] of tokens) {
    if (tokenValue.trim() === normalized) return {token: name, tokenMatch: 'exact'};
  }

  const color = parseColor(normalized);
  if (!color) return NO_MATCH;

  let bestName: string | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;

  for (const [name, tokenValue] of tokens) {
    const tokenColor = parseColor(tokenValue);
    if (!tokenColor) continue;
    const distance = deltaE(color, tokenColor);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestName = name;
    }
  }

  if (bestName === null) return NO_MATCH;
  if (bestDistance === 0) return {token: bestName, tokenMatch: 'exact'};
  if (bestDistance < NEAREST_COLOR_THRESHOLD) return {token: bestName, tokenMatch: 'nearest'};
  return NO_MATCH;
};

export const toStyleValues = (
  styles: Record<string, string>,
  tokens: TokenMap,
): Record<string, StyleValue> => {
  const result: Record<string, StyleValue> = {};
  for (const [property, value] of Object.entries(styles)) {
    const {token, tokenMatch} = matchToken(value, tokens);
    result[property] = {value, token, tokenMatch};
  }
  return result;
};
