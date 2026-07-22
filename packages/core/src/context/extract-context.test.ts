import {beforeEach, describe, expect, it} from 'vitest';
import {elementContextSchema} from '../schema/annotation.schema';
import {extractContext} from './extract-context';

const query = (selector: string): Element => {
  const found = document.querySelector(selector);
  if (!found) throw new Error(`nothing matched ${selector}`);
  return found;
};

const tokens = new Map<string, string>([['--color-text-primary', 'rgb(51, 51, 51)']]);

describe('extractContext', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('produces an object that satisfies the schema', () => {
    document.body.innerHTML =
      '<soa-inform-block><p data-testid="msg" class="info">Closed today</p></soa-inform-block>';
    const context = extractContext(query('[data-testid="msg"]'), tokens);
    expect(() => elementContextSchema.parse(context)).not.toThrow();
  });

  it('carries the selector, component and chain', () => {
    document.body.innerHTML =
      '<soa-menu-page><soa-inform-block><p class="info">Closed</p></soa-inform-block></soa-menu-page>';
    const context = extractContext(query('.info'), tokens);
    expect(context.selector).toBe('soa-inform-block p.info');
    expect(context.componentName).toBe('soa-inform-block');
    expect(context.componentChain).toEqual(['soa-inform-block', 'soa-menu-page']);
  });

  it('truncates long text to 120 characters', () => {
    document.body.innerHTML = `<p class="long">${'x'.repeat(300)}</p>`;
    expect(extractContext(query('.long'), tokens).text).toHaveLength(120);
  });

  it('keeps only identifying attributes', () => {
    document.body.innerHTML =
      '<p class="info" data-testid="msg" aria-label="notice" style="color: red" onclick="x()"></p>';
    const attributes = extractContext(query('.info'), tokens).attributes;
    expect(Object.keys(attributes).sort()).toEqual(['aria-label', 'class', 'data-testid']);
  });
});
