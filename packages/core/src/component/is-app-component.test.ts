import {afterEach, describe, expect, it} from 'vitest';
import {isAppComponentTag, isCustomElementTag} from './is-app-component';

const withRegistry = (value: unknown, run: () => void): void => {
  const original = Object.getOwnPropertyDescriptor(globalThis, 'customElements');
  Object.defineProperty(globalThis, 'customElements', {value, configurable: true});
  try {
    run();
  } finally {
    if (original) Object.defineProperty(globalThis, 'customElements', original);
  }
};

describe('isCustomElementTag', () => {
  it('accepts a hyphenated tag', () => {
    expect(isCustomElementTag('ram-home')).toBe(true);
  });

  it('rejects a plain tag and a hyphenated built-in', () => {
    expect(isCustomElementTag('div')).toBe(false);
    expect(isCustomElementTag('font-face')).toBe(false);
  });
});

describe('isAppComponentTag', () => {
  afterEach(() => {
    document.body.innerHTML = '';
  });

  it('treats a known design-system prefix as vendor', () => {
    expect(isAppComponentTag('ion-content')).toBe(false);
    expect(isAppComponentTag('mat-form-field')).toBe(false);
    expect(isAppComponentTag('cdk-overlay')).toBe(false);
  });

  it('treats an application tag as a component', () => {
    expect(isAppComponentTag('ram-home')).toBe(true);
    expect(isAppComponentTag('soa-inform-block')).toBe(true);
    expect(isAppComponentTag('bnt-translate')).toBe(true);
  });

  it('survives a content-script world where the registry is null', () => {
    withRegistry(null, () => {
      expect(isAppComponentTag('ram-home')).toBe(true);
      expect(isAppComponentTag('ion-content')).toBe(false);
    });
  });

  it('survives a world with no registry at all', () => {
    withRegistry(undefined, () => {
      expect(isAppComponentTag('ram-home')).toBe(true);
    });
  });
});
