import {describe, expect, it} from 'vitest';
import type {CaliperAnnotation, CaliperSession} from '../schema/annotation.schema';
import {toJiraComment} from './to-jira';

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
    styles: {'padding-top': {value: '20px', token: '--offset-20px', tokenMatch: 'exact'}},
    ...overrides.target,
  },
  ...overrides,
});

const session = (annotations: CaliperAnnotation[], extra: Partial<CaliperSession> = {}): CaliperSession => ({
  schemaVersion: 1,
  id: '45125a93-f513-448e-9f9a-8e0d9f87a92f',
  createdAt: '2026-07-22T10:00:00.000Z',
  caliperVersion: '0.1.0',
  annotations,
  assets: {},
  ...extra,
});

describe('toJiraComment', () => {
  it('opens with a heading carrying the defect count', () => {
    expect(toJiraComment(session([annotation()]))).toContain('h3. Caliper — 1 defect');
  });

  it('pluralises the count', () => {
    const output = toJiraComment(session([annotation(), annotation({id: 'b'})]));
    expect(output).toContain('h3. Caliper — 2 defects');
  });

  it('renders a table row per defect', () => {
    const output = toJiraComment(session([annotation()]));
    expect(output).toContain('||#||Severity||Component||Selector||What is wrong||');
    expect(output).toContain('|1|MINOR|ram-home|{{ram-home div.about}}|Padding is too small|');
  });

  it('escapes a pipe inside a comment so the table survives', () => {
    const output = toJiraComment(session([annotation({comment: 'a | b'})]));
    expect(output).toContain('a \\| b');
  });

  it('flags a brittle selector inline', () => {
    const brittle = annotation({
      target: {...annotation().target, selectorConfidence: 'low'},
    });
    expect(toJiraComment(session([brittle]))).toContain('(!) brittle');
  });

  it('lists the pages that were tested', () => {
    expect(toJiraComment(session([annotation()]))).toContain('https://app.test/menu');
  });

  it('mentions screenshots only when the session has them', () => {
    const withShot = annotation({screenshotId: 'abc'});
    const withShots = session([withShot], {assets: {abc: 'data:image/png;base64,x'}});
    expect(toJiraComment(withShots)).toContain('screenshot');
    expect(toJiraComment(session([annotation()]))).not.toContain('screenshot');
  });

  it('states an empty session plainly', () => {
    expect(toJiraComment(session([]))).toBe('h3. Caliper — no defects recorded');
  });
});
