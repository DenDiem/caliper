import {describe, expect, it} from 'vitest';
import type {CaliperAnnotation, CaliperSession} from '../schema/annotation.schema';
import {toToon} from './to-toon';

const annotation = (overrides: Partial<CaliperAnnotation> = {}): CaliperAnnotation => ({
  id: '09216b54-a595-43f6-baa6-63fc998ab770',
  createdAt: '2026-07-22T10:00:00.000Z',
  comment: 'Padding is too small',
  severity: 'minor',
  intent: 'change',
  markType: 'element',
  anchor: null,
  anchorTarget: null,
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
      display: {value: 'block'},
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

  it('emits one indented block per mark, headed by id/severity/intent/markType/selector', () => {
    const output = toToon(session([annotation()]));
    expect(output).toContain('annotations[1]:');
    expect(output).not.toContain('annotations[1]{');
    expect(output).toContain('09216b54 minor change element ram-home div.about');
  });

  it('declares row counts on the styles and help array headers', () => {
    const output = toToon(session([annotation()]));
    expect(output).toContain('styles[2]{selector,property,value,token,match}:');
    expect(output).toMatch(/help\[\d+\]:/);
  });

  it('quotes a selector containing a colon, as the spec requires', () => {
    const selector = 'div:nth-child(2) > span';
    const output = toToon(session([annotation({target: {...annotation().target, selector}})]));
    expect(output).toContain(`"${selector}"`);
  });

  it('quotes a comment containing the delimiter', () => {
    const output = toToon(session([annotation({comment: 'button, but broken'})]));
    expect(output).toContain('"button, but broken"');
  });

  it('escapes embedded quotes with a backslash, not by doubling', () => {
    const output = toToon(session([annotation({comment: 'the "save" button'})]));
    expect(output).toContain('"the \\"save\\" button"');
  });

  it('quotes a bare comment that would otherwise read as a number', () => {
    const output = toToon(session([annotation({comment: '42'})]));
    expect(output).toContain('"42"');
  });

  it('keeps a hardcode on a tokenizable property but drops structural noise', () => {
    const output = toToon(session([annotation()]));
    expect(output).toContain('ram-home div.about,font-size,15px,null,null');
    expect(output).not.toContain(',display,');
  });

  it('keys styles by selector and dedupes across marks', () => {
    const output = toToon(session([annotation(), annotation({comment: 'second'})]));
    expect(output).toContain('styles[2]{selector,property,value,token,match}:');
  });

  it('omits styles entirely for a remove mark', () => {
    const output = toToon(session([annotation({intent: 'remove'})]));
    expect(output).not.toContain('styles[');
  });

  it('flattens newlines inside a comment', () => {
    const output = toToon(session([annotation({comment: 'first\nsecond'})]));
    expect(output).toContain('first second');
  });

  it('pre-computes the severity breakdown', () => {
    const output = toToon(session([annotation(), annotation({severity: 'blocker'})]));
    expect(output).toContain('severity: minor=1 blocker=1');
  });

  it('lifts a url shared by every mark into the session block', () => {
    const output = toToon(session([annotation(), annotation()]));
    expect(output).toContain('url: "https://app.test/menu"');
    expect(output).not.toContain('    url: "https://app.test/menu"');
  });

  it('keeps a per-mark url when marks span several pages', () => {
    const other = annotation({page: {...annotation().page, url: 'https://app.test/cart'}});
    const output = toToon(session([annotation(), other]));
    expect(output).toContain('    url: "https://app.test/cart"');
  });

  it('locates an area mark with bbox and covers', () => {
    const area = annotation({
      markType: 'area',
      region: {
        box: {x: 120, y: 600, width: 1616, height: 160},
        path: [],
        covers: [{selector: 'app-recent-activity', coverage: 0.92}],
      },
    });
    const output = toToon(session([area]));
    expect(output).toContain('bbox: [120,600,1616,160]');
    expect(output).toContain('covers: app-recent-activity 92%');
  });

  it('gives an add mark an anchor and target', () => {
    const add = annotation({
      intent: 'add',
      markType: 'area',
      anchor: 'after',
      anchorTarget: 'app-recent-activity',
      region: {box: {x: 0, y: 0, width: 10, height: 10}, path: [], covers: []},
    });
    const output = toToon(session([add]));
    expect(output).toContain('add area');
    expect(output).toContain('anchor: after → app-recent-activity');
  });

  it('surfaces the marked element text', () => {
    const output = toToon(session([annotation()]));
    expect(output).toContain('text: About us');
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
