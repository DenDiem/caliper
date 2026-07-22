import {beforeEach, describe, expect, it} from 'vitest';
import {buildSelector} from './build-selector';
import {isGeneratedId} from './is-generated-id';

const render = (html: string): HTMLElement => {
  document.body.innerHTML = html;
  const root = document.body.firstElementChild;
  if (!(root instanceof HTMLElement)) throw new Error('render produced no element');
  return root;
};

const query = (selector: string): Element => {
  const found = document.querySelector(selector);
  if (!found) throw new Error(`nothing matched ${selector}`);
  return found;
};

describe('isGeneratedId', () => {
  it('flags framework-generated ids', () => {
    expect(isGeneratedId('mat-input-3')).toBe(true);
    expect(isGeneratedId('cdk-overlay-0')).toBe(true);
    expect(isGeneratedId('a1b2c3d4e5')).toBe(true);
    expect(isGeneratedId('field-12345')).toBe(true);
  });

  it('accepts human-authored ids', () => {
    expect(isGeneratedId('delivery-address')).toBe(false);
    expect(isGeneratedId('main')).toBe(false);
  });
});

describe('buildSelector', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('prefers data-testid', () => {
    render('<div data-testid="inform"><p>text</p></div>');
    const result = buildSelector(query('[data-testid="inform"]'));
    expect(result).toEqual({
      selector: '[data-testid="inform"]',
      strategy: 'testid',
      confidence: 'high',
    });
  });

  it('uses a human-authored id when there is no testid', () => {
    render('<section id="delivery-address"></section>');
    const result = buildSelector(query('#delivery-address'));
    expect(result.selector).toBe('#delivery-address');
    expect(result.strategy).toBe('id');
    expect(result.confidence).toBe('high');
  });

  it('skips a generated id and falls through to the component path', () => {
    render('<soa-inform-block><p id="mat-text-4821">text</p></soa-inform-block>');
    const result = buildSelector(query('#mat-text-4821'));
    expect(result.selector).toBe('soa-inform-block p');
    expect(result.strategy).toBe('component-path');
    expect(result.confidence).toBe('medium');
  });

  it('includes a stable class in the component path when present', () => {
    render('<soa-inform-block><p class="info">text</p></soa-inform-block>');
    const result = buildSelector(query('.info'));
    expect(result.selector).toBe('soa-inform-block p.info');
    expect(result.strategy).toBe('component-path');
  });

  it('falls back to an nth-child path with low confidence', () => {
    render('<div><span>a</span><span>b</span></div>');
    const target = query('div').children[1];
    if (!target) throw new Error('missing second span');
    const result = buildSelector(target);
    expect(result.strategy).toBe('nth-path');
    expect(result.confidence).toBe('low');
    expect(document.querySelector(result.selector)?.textContent).toBe('b');
  });
});
