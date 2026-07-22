import {describe, expect, it} from 'vitest';
import type {CaliperAnnotation, CaliperSession} from '../schema/annotation.schema';
import {toToon} from './to-toon';

const annotation = (overrides: Partial<CaliperAnnotation> = {}): CaliperAnnotation => ({
  id: '09216b54-a595-43f6-baa6-63fc998ab770',
  createdAt: '2026-07-22T10:00:00.000Z',
  comment: 'Padding is too small',
  severity: 'minor',
  author: 'human',
  concernType: null,
  verdict: null,
  page: {
    url: 'https://app.test/menu',
    title: 'Menu',
    viewport: {width: 1440, height: 900, dpr: 2},
  },
  target: {
    selector: 'ram-home div.about',
    selectorStrategy: 'component-path',
    selectorConfidence: 'medium',
    tagName: 'div',
    componentName: 'ram-home',
    componentSource: 'tag-heuristic',
    componentChain: ['ram-home'],
    text: 'About us',
    attributes: {},
    box: {x: 0, y: 0, width: 100, height: 40},
    styles: {
      'padding-top': {value: '20px', token: '--offset-20px', tokenMatch: 'exact'},
      'font-size': {value: '15px'},
    },
    ...overrides.target,
  },
  ...overrides,
});

const session = (annotations: CaliperAnnotation[]): CaliperSession => ({
  schemaVersion: 1,
  id: '45125a93-f513-448e-9f9a-8e0d9f87a92f',
  createdAt: '2026-07-22T10:00:00.000Z',
  caliperVersion: '0.1.0',
  annotations,
  assets: {},
});

describe('toToon', () => {
  it('writes the session as a key-value block, not a one-row table', () => {
    const output = toToon(session([annotation()]));
    expect(output).toContain('session:\n  id: 45125a93');
    expect(output).not.toContain('session{');
  });

  it('declares row counts on every array header', () => {
    const output = toToon(session([annotation()]));
    expect(output).toContain('annotations[1]{');
    expect(output).toContain('styles[2]{');
    expect(output).toMatch(/help\[\d+\]:/);
  });

  it('quotes a value containing a colon, as the spec requires', () => {
    const selector = 'div:nth-child(2) > span';
    const output = toToon(session([annotation({target: {...annotation().target, selector}})]));
    expect(output).toContain(`"${selector}"`);
  });

  it('quotes a value containing the delimiter', () => {
    const output = toToon(session([annotation({comment: 'button, but broken'})]));
    expect(output).toContain('"button, but broken"');
  });

  it('escapes embedded quotes with a backslash, not by doubling', () => {
    const output = toToon(session([annotation({comment: 'the "save" button'})]));
    expect(output).toContain('"the \\"save\\" button"');
  });

  it('quotes a bare value that would otherwise read as a number', () => {
    const output = toToon(session([annotation({comment: '42'})]));
    expect(output).toContain('"42"');
  });

  it('writes the null literal for an absent token', () => {
    expect(toToon(session([annotation()]))).toContain('09216b54,font-size,15px,null,null');
  });

  it('flattens newlines inside a comment', () => {
    const output = toToon(session([annotation({comment: 'first\nsecond'})]));
    expect(output).toContain('first second');
  });

  it('pre-computes the severity breakdown', () => {
    const output = toToon(session([annotation(), annotation({severity: 'blocker'})]));
    expect(output).toContain('severity: minor=1 blocker=1');
  });

  it('lifts a url shared by every annotation out of the table', () => {
    const output = toToon(session([annotation(), annotation()]));
    expect(output).toContain('url: "https://app.test/menu"');
    expect(output).toContain('annotations[2]{id,severity,component,confidence,selector,comment}:');
  });

  it('keeps a url column when annotations span several pages', () => {
    const other = annotation({page: {...annotation().page, url: 'https://app.test/cart'}});
    const output = toToon(session([annotation(), other]));
    expect(output).toContain(
      'annotations[2]{id,severity,component,confidence,selector,comment,url}:',
    );
  });

  it('states an empty session with context and suggests the next step', () => {
    const output = toToon(session([]));
    expect(output).toContain('annotations: 0 defects recorded in this session');
    expect(output).toContain('Alt+Shift+C');
  });

  it('is markedly smaller than the equivalent json', () => {
    const full = session([annotation(), annotation({id: 'b'.repeat(36)})]);
    expect(toToon(full).length).toBeLessThan(JSON.stringify(full, null, 2).length / 2);
  });
});
