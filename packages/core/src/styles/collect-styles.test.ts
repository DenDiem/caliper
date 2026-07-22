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

  it('drops values that carry no design intent', () => {
    document.body.innerHTML =
      '<div id="t" style="padding-top: 0px; transform: none; opacity: 1; margin-left: 4px"></div>';
    const styles = collectStyles(query('#t'));
    expect(styles).not.toHaveProperty('padding-top');
    expect(styles).not.toHaveProperty('transform');
    expect(styles).not.toHaveProperty('opacity');
    expect(styles['margin-left']).toBe('4px');
  });

  it('drops flex and grid properties when the element is not a layout container', () => {
    document.body.innerHTML = '<div id="t" style="display: block; align-items: center"></div>';
    expect(collectStyles(query('#t'))).not.toHaveProperty('align-items');
  });

  it('keeps flex properties on a flex container', () => {
    document.body.innerHTML = '<div id="t" style="display: flex; align-items: center"></div>';
    expect(collectStyles(query('#t'))['align-items']).toBe('center');
  });

  it('drops an inherited value the element never set itself', () => {
    document.body.innerHTML = '<div style="color: rgb(1, 2, 3)"><p id="t">x</p></div>';
    expect(collectStyles(query('#t'))).not.toHaveProperty('color');
  });

  it('keeps an inherited property the element overrides', () => {
    document.body.innerHTML =
      '<div style="color: rgb(1, 2, 3)"><p id="t" style="color: rgb(9, 9, 9)">x</p></div>';
    expect(collectStyles(query('#t'))['color']).toBe('rgb(9, 9, 9)');
  });

  it('drops the border colour when no border is actually drawn', () => {
    document.body.innerHTML = '<div id="t" style="border-top-color: rgb(1, 2, 3)"></div>';
    expect(collectStyles(query('#t'))).not.toHaveProperty('border-top-color');
  });

  it('keeps the border colour when a border is drawn', () => {
    document.body.innerHTML =
      '<div id="t" style="border-top: 2px solid rgb(1, 2, 3)"></div>';
    expect(collectStyles(query('#t'))['border-top-color']).toBe('rgb(1, 2, 3)');
  });

  it('does not report width and height, which the box already carries', () => {
    expect(STYLE_ALLOWLIST).not.toContain('width');
    expect(STYLE_ALLOWLIST).not.toContain('height');
  });
});
