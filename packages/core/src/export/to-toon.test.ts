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
  it('declares row counts on every table header', () => {
    const output = toToon(session([annotation()]));
    expect(output).toContain('annotations[1]{');
    expect(output).toContain('styles[2]{');
  });

  it('shortens ids to eight characters', () => {
    expect(toToon(session([annotation()]))).toContain('09216b54,minor');
  });

  it('links each style row back to its annotation', () => {
    const output = toToon(session([annotation()]));
    expect(output).toContain('09216b54,padding-top,20px,--offset-20px,exact');
  });

  it('writes a dash for an absent token', () => {
    expect(toToon(session([annotation()]))).toContain('09216b54,font-size,15px,-,-');
  });

  it('quotes a value containing a comma', () => {
    const output = toToon(session([annotation({comment: 'button, but broken'})]));
    expect(output).toContain('"button, but broken"');
  });

  it('doubles embedded quotes', () => {
    const output = toToon(session([annotation({comment: 'the "save" button'})]));
    expect(output).toContain('"the ""save"" button"');
  });

  it('flattens newlines inside a comment', () => {
    const output = toToon(session([annotation({comment: 'first\nsecond'})]));
    expect(output).toContain('first second');
  });

  it('states an empty session explicitly instead of returning a bare header', () => {
    expect(toToon(session([]))).toContain('annotations[0]: none');
  });

  it('is markedly smaller than the equivalent json', () => {
    const full = session([annotation(), annotation({id: 'b'.repeat(36)})]);
    expect(toToon(full).length).toBeLessThan(JSON.stringify(full, null, 2).length / 2);
  });
});
