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

  it('climbs to a further ancestor when the nearest component is ambiguous', () => {
    render(
      '<ram-page><ram-card><p class="t">1</p></ram-card></ram-page>' +
        '<ram-other><ram-card><p class="t">2</p></ram-card></ram-other>',
    );
    const target = query('ram-other .t');
    const result = buildSelector(target);
    expect(result.selector).toBe('ram-other p.t');
    expect(result.strategy).toBe('component-path');
    expect(document.querySelectorAll(result.selector)).toHaveLength(1);
  });

  it('indexes a repeated component instead of walking up to the document', () => {
    render(
      '<ram-list>' +
        '<ram-card><p class="name">first</p></ram-card>' +
        '<ram-card><p class="name">second</p></ram-card>' +
        '</ram-list>',
    );
    const target = query('ram-card:nth-of-type(2) .name');
    const result = buildSelector(target);
    expect(result.selector).toBe('ram-card:nth-of-type(2) p.name');
    expect(document.querySelector(result.selector)?.textContent).toBe('second');
  });

  it('scopes an nth-child path to the owning component rather than the body', () => {
    render(
      '<ram-root><div><div><ram-footer><div>a</div><div><span>x</span><span>y</span></div></ram-footer></div></div></ram-root>',
    );
    const target = query('ram-footer div:nth-child(2)').children[1];
    if (!target) throw new Error('missing second span');
    const result = buildSelector(target);
    expect(result.strategy).toBe('nth-path');
    expect(result.confidence).toBe('low');
    expect(result.selector.startsWith('ram-footer')).toBe(true);
    expect(result.selector).not.toContain('ram-root');
    expect(document.querySelector(result.selector)?.textContent).toBe('y');
  });

  it('falls back to a body-rooted nth-child path when no component owns the element', () => {
    render('<div><span>a</span><span>b</span></div>');
    const target = query('div').children[1];
    if (!target) throw new Error('missing second span');
    const result = buildSelector(target);
    expect(result.strategy).toBe('nth-path');
    expect(result.confidence).toBe('low');
    expect(document.querySelector(result.selector)?.textContent).toBe('b');
  });
});
