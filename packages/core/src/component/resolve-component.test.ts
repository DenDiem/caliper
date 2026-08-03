import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {buildComponentChain, resolveComponent, resolveComponentHost} from './resolve-component';

const query = (selector: string): Element => {
  const found = document.querySelector(selector);
  if (!found) throw new Error(`nothing matched ${selector}`);
  return found;
};

const defineVendorTag = (tag: string): void => {
  if (customElements.get(tag)) return;
  customElements.define(tag, class extends HTMLElement {});
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

  it('strips the leading underscore Angular dev builds add to the class name', () => {
    document.body.innerHTML = '<div class="inner"></div>';
    Reflect.set(globalThis, 'ng', {
      getOwningComponent: () => ({constructor: {name: '_StatCardComponent'}}),
    });
    expect(resolveComponent(query('.inner'))).toEqual({
      name: 'StatCardComponent',
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

  it('skips a registered design-system element in favour of the owning app component', () => {
    defineVendorTag('ion-content');
    document.body.innerHTML = '<ram-home><ion-content></ion-content></ram-home>';
    expect(resolveComponent(query('ion-content'))).toEqual({
      name: 'ram-home',
      source: 'tag-heuristic',
    });
  });

  it('keeps the vendor element when nothing else owns it', () => {
    defineVendorTag('ion-app');
    document.body.innerHTML = '<ion-app></ion-app>';
    expect(resolveComponent(query('ion-app')).name).toBe('ion-app');
  });
});

describe('resolveComponentHost', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

  it('returns the nearest app-component ancestor of a picked inner element', () => {
    document.body.innerHTML = '<app-stat-card class="stats__tight"><div class="card"></div></app-stat-card>';
    expect(resolveComponentHost(query('.card'))).toBe(query('app-stat-card'));
  });

  it('returns the element itself when it is the component host', () => {
    document.body.innerHTML = '<app-stat-card></app-stat-card>';
    const host = query('app-stat-card');
    expect(resolveComponentHost(host)).toBe(host);
  });

  it('returns null when nothing in the ancestry is an app component', () => {
    document.body.innerHTML = '<section><div class="card"></div></section>';
    expect(resolveComponentHost(query('.card'))).toBeNull();
  });
});

describe('buildComponentChain', () => {
  beforeEach(() => {
    document.body.innerHTML = '';
  });

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

  it('leaves registered design-system elements out of the chain', () => {
    defineVendorTag('ion-router-outlet');
    document.body.innerHTML =
      '<ram-root><ion-router-outlet><ram-home><p class="t">x</p></ram-home></ion-router-outlet></ram-root>';
    expect(buildComponentChain(query('.t'))).toEqual(['ram-home', 'ram-root']);
  });
});
