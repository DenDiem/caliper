import type {StyleValue} from '../schema/annotation.schema';
import type {Rgb} from './color';
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
  tokenMatch: 'exact' | 'nearest' | 'partial' | null;
}

export interface TokenComponent {
  readonly value: string;
  readonly token?: string | null;
  readonly tokenMatch?: TokenMatch['tokenMatch'];
}

const NO_MATCH: TokenMatch = {token: null, tokenMatch: null};

// Joins the per-component matches of a multi-value shorthand (`padding: 32px 24px`) into one match.
// The token string keeps each component in source order — a token name where it matched, the raw value
// where it did not — so `--space-5 24px` reads as "first is a token, second is a hardcode". All matched
// exactly → `exact`; all matched but some `nearest` → `nearest`; only some matched → `partial`; none → null.
export const combineComponents = (components: readonly TokenComponent[]): TokenMatch => {
  if (components.length === 0) return NO_MATCH;
  const matched = components.filter((component) => component.token != null);
  if (matched.length === 0) return NO_MATCH;

  const token = components.map((component) => component.token ?? component.value).join(' ');
  const allMatched = matched.length === components.length;
  const anyInexact = matched.some((component) => component.tokenMatch !== 'exact');
  const tokenMatch: TokenMatch['tokenMatch'] = !allMatched ? 'partial' : anyInexact ? 'nearest' : 'exact';
  return {token, tokenMatch};
};

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

const matchSingleDimension = (property: string, value: string, tokens: TokenMap): TokenMatch => {
  if (!DIMENSION_VALUE_PATTERN.test(value)) return NO_MATCH;

  const candidates = namesWithValue(tokens, (tokenValue) => tokenValue === value);
  if (candidates.length === 0) return NO_MATCH;

  const only = candidates.length === 1 ? candidates[0] : preferByName(property, candidates);

  return only ? {token: only, tokenMatch: 'exact'} : NO_MATCH;
};

// A collapsed shorthand (`padding: 32px 24px`, `border-radius: 8px 4px`) is matched per component, then
// joined — otherwise the whole shorthand reads as `null` even when every component has an exact token
// (the regression the shorthand fold introduced). A single value falls straight through to the scalar match.
const matchDimension = (property: string, value: string, tokens: TokenMap): TokenMatch => {
  const parts = value.split(/\s+/).filter((part) => part.length > 0);
  if (parts.length <= 1) return matchSingleDimension(property, value, tokens);

  return combineComponents(
    parts.map((part) => ({value: part, ...matchSingleDimension(property, part, tokens)})),
  );
};

const matchColor = (value: string, tokens: TokenMap): TokenMatch => {
  const color = parseColor(value);
  if (!color) return NO_MATCH;

  let bestName: string | null = null;
  let bestColor: Rgb | null = null;
  let bestDistance = Number.POSITIVE_INFINITY;
  let ambiguous = false;

  for (const [name, tokenValue] of tokens) {
    const tokenColor = parseColor(tokenValue);
    if (!tokenColor) continue;

    const distance = deltaE(color, tokenColor);
    if (distance < bestDistance) {
      bestDistance = distance;
      bestName = name;
      bestColor = tokenColor;
      ambiguous = false;
      continue;
    }
    // A tie is only a real guess when the equally-close token is a *different* colour. Several tokens
    // naming one colour any way (`white`, `#fff`, `rgb(255,255,255)` for `--color-surface`,
    // `--color-white`, …) are unambiguous, so the first-declared name is kept instead of being rejected.
    if (distance === bestDistance && bestColor && deltaE(bestColor, tokenColor) !== 0) ambiguous = true;
  }

  if (bestName === null || ambiguous) return NO_MATCH;
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
