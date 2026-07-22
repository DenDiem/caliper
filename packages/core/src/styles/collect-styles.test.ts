import {beforeEach, describe, expect, it} from 'vitest';
import {collectStyles} from './collect-styles';
import {STYLE_ALLOWLIST} from './style-allowlist';

const query = (selector: string): Element => {
  const found = document.querySelector(selector);
  if (!found) throw new Error(`nothing matched ${selector}`);
  return found;
};

describe('collectStyles', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('collects only allowlisted properties', () => {
    document.body.innerHTML = '<div id="t" style="color: rgb(51,51,51); padding-top: 8px"></div>';
    const styles = collectStyles(query('#t'));
    for (const property of Object.keys(styles)) {
      expect(STYLE_ALLOWLIST).toContain(property);
    }
  });

  it('reads the computed value of an allowlisted property', () => {
    document.body.innerHTML = '<div id="t" style="padding-top: 8px"></div>';
    expect(collectStyles(query('#t'))['padding-top']).toBe('8px');
  });

  it('omits properties with an empty computed value', () => {
    document.body.innerHTML = '<div id="t"></div>';
    expect(Object.values(collectStyles(query('#t')))).not.toContain('');
  });

  it('keeps the allowlist under 50 properties so annotations stay small', () => {
    expect(STYLE_ALLOWLIST.length).toBeLessThan(50);
  });
});
