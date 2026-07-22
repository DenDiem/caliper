import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {buildComponentChain, resolveComponent} from './resolve-component';

const query = (selector: string): Element => {
  const found = document.querySelector(selector);
  if (!found) throw new Error(`nothing matched ${selector}`);
  return found;
};

describe('resolveComponent', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  afterEach(() => {
    Reflect.deleteProperty(globalThis, 'ng');
  });

  it('reads the component name from the Angular dev-mode global when present', () => {
    document.body.innerHTML = '<div class="inner"></div>';
    Reflect.set(globalThis, 'ng', {
      getOwningComponent: () => ({constructor: {name: 'InformBlockComponent'}}),
    });
    expect(resolveComponent(query('.inner'))).toEqual({
      name: 'InformBlockComponent',
      source: 'ng-devmode',
    });
  });

  it('falls back to the custom element tag on a production build', () => {
    document.body.innerHTML = '<soa-inform-block></soa-inform-block>';
    expect(resolveComponent(query('soa-inform-block'))).toEqual({
      name: 'soa-inform-block',
      source: 'tag-heuristic',
    });
  });

  it('returns null for a plain HTML element', () => {
    document.body.innerHTML = '<div></div>';
    expect(resolveComponent(query('div'))).toEqual({name: null, source: null});
  });

  it('does not treat hyphenated built-in tags as components', () => {
    document.body.innerHTML = '<font-face></font-face>';
    expect(resolveComponent(query('font-face')).name).toBeNull();
  });
});

describe('buildComponentChain', () => {
  it('lists custom-element ancestors from nearest to furthest', () => {
    document.body.innerHTML =
      '<soa-menu-page><soa-inform-block><p class="t">x</p></soa-inform-block></soa-menu-page>';
    expect(buildComponentChain(query('.t'))).toEqual(['soa-inform-block', 'soa-menu-page']);
  });

  it('includes the element itself when it is a component', () => {
    document.body.innerHTML =
      '<soa-menu-page><soa-inform-block></soa-inform-block></soa-menu-page>';
    expect(buildComponentChain(query('soa-inform-block'))).toEqual([
      'soa-inform-block',
      'soa-menu-page',
    ]);
  });
});
