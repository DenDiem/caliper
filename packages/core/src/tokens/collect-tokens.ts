import type {TokenMap} from './match-token';

const ROOT_SELECTOR_HINTS = [':root', 'html', 'body', ':host'];

const declaredTokenNames = (doc: Document): Set<string> => {
  const names = new Set<string>();

  for (const sheet of Array.from(doc.styleSheets)) {
    let rules: CSSRuleList;
    try {
      rules = sheet.cssRules;
    } catch {
      continue;
    }

    for (const rule of Array.from(rules)) {
      if (!(rule instanceof CSSStyleRule)) continue;
      if (!ROOT_SELECTOR_HINTS.some((hint) => rule.selectorText.includes(hint))) continue;
      for (let index = 0; index < rule.style.length; index += 1) {
        const property = rule.style.item(index);
        if (property.startsWith('--')) names.add(property);
      }
    }
  }

  return names;
};

export const collectTokens = (doc: Document): TokenMap => {
  const tokens: TokenMap = new Map();
  const sources = [doc.documentElement, doc.body].filter((element) => element !== null);

  for (const name of declaredTokenNames(doc)) {
    for (const source of sources) {
      const value = getComputedStyle(source).getPropertyValue(name).trim();
      if (value) {
        tokens.set(name, value);
        break;
      }
    }
  }

  return tokens;
};
