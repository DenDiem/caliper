import {describe, expect, it} from 'vitest';
import type {CaliperAnnotation, CaliperSession} from '../schema/annotation.schema';
import {screenshotFilename, sessionToJiraComment} from './to-jira-adf';

const annotation = (overrides: Partial<CaliperAnnotation> = {}): CaliperAnnotation => ({
  id: '09216b54-a595-43f6-baa6-63fc998ab770',
  createdAt: '2026-07-27T10:00:00.000Z',
  comment: 'Padding is too small',
  severity: 'minor',
  author: 'human',
  concernType: null,
  verdict: null,
  page: {url: 'https://app.test/menu', title: 'Menu', viewport: {width: 1440, height: 900, dpr: 2}},
  target: {
    selector: '.price-block > b',
    selectorStrategy: 'component-path',
    selectorConfidence: 'high',
    tagName: 'b',
    componentName: 'PriceTag',
    componentSource: 'tag-heuristic',
    componentChain: ['PriceTag'],
    text: '12 287 $',
    attributes: {},
    box: {x: 0, y: 0, width: 100, height: 40},
    styles: {},
    ...overrides.target,
  },
  ...overrides,
});

const session = (annotations: CaliperAnnotation[]): CaliperSession => ({
  schemaVersion: 1,
  id: '45125a93-f513-448e-9f9a-8e0d9f87a92f',
  createdAt: '2026-07-27T10:00:00.000Z',
  caliperVersion: '0.1.0',
  annotations,
  assets: {},
});

describe('sessionToJiraComment', () => {
  it('builds a level-3 heading with the defect count', () => {
    const doc = sessionToJiraComment(session([annotation()]));
    expect(doc.type).toBe('doc');
    expect(doc.content[0]).toMatchObject({
      type: 'heading',
      attrs: {level: 3},
      content: [{type: 'text', text: 'Caliper QA — 1 defect'}],
    });
  });

  it('pluralizes the heading for multiple defects', () => {
    const doc = sessionToJiraComment(session([annotation(), annotation({id: 'a2'})]));
    expect(JSON.stringify(doc.content[0])).toContain('2 defects');
  });

  it('numbers each bullet and keeps severity, component, comment and a selector code mark', () => {
    const list = sessionToJiraComment(session([annotation()])).content[1];
    expect(list.type).toBe('bulletList');
    expect(list.content).toHaveLength(1);

    const serialized = JSON.stringify(list);
    expect(serialized).toContain('#01 [minor] PriceTag: ');
    expect(serialized).toContain('Padding is too small');
    expect(serialized).toContain('.price-block > b');
    expect(serialized).toContain('{"type":"code"}');
  });

  it('embeds an inline media node in the bullet when a media ref is provided', () => {
    const list = sessionToJiraComment(session([annotation({screenshotId: 'shot-1'})]), {
      0: {id: 'att-42'},
    }).content[1];
    const item = list.content?.[0];

    expect(item?.content).toHaveLength(2);
    expect(item?.content?.[1]).toMatchObject({
      type: 'mediaSingle',
      content: [{type: 'media', attrs: {type: 'file', id: 'att-42', collection: ''}}],
    });
  });

  it('omits media when no ref is provided for the bullet', () => {
    const list = sessionToJiraComment(session([annotation({screenshotId: 'shot-1'})])).content[1];
    expect(JSON.stringify(list)).not.toContain('mediaSingle');
  });

  it('falls back to the tag name when the component is unknown', () => {
    const list = sessionToJiraComment(
      session([annotation({target: {...annotation().target, componentName: null}})]),
    ).content[1];
    expect(JSON.stringify(list)).toContain('#01 [minor] b: ');
  });

  it('produces an empty bullet list for a session with no annotations', () => {
    const doc = sessionToJiraComment(session([]));
    expect(doc.content[1]).toMatchObject({type: 'bulletList', content: []});
    expect(JSON.stringify(doc.content[0])).toContain('0 defects');
  });
});

describe('screenshotFilename', () => {
  it('pairs a 1-based ordinal with a component slug so it maps to the bullet number', () => {
    expect(screenshotFilename(0, annotation())).toBe('caliper-01-pricetag.png');
    expect(screenshotFilename(11, annotation())).toBe('caliper-12-pricetag.png');
  });

  it('slugifies the tag name when the component is unknown', () => {
    expect(screenshotFilename(0, annotation({target: {...annotation().target, componentName: null}}))).toBe(
      'caliper-01-b.png',
    );
  });
});
