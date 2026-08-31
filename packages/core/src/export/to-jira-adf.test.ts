import {describe, expect, it} from 'vitest';
import type {CaliperAnnotation, CaliperSession} from '../schema/annotation.schema';
import type {CaliperTrace} from '../schema/trace.schema';
import type {AdfDoc, AdfNode} from './to-jira-adf';
import {screenshotFilename, sessionToJiraComment} from './to-jira-adf';

const annotation = (overrides: Partial<CaliperAnnotation> = {}): CaliperAnnotation => ({
  id: '09216b54-a595-43f6-baa6-63fc998ab770',
  createdAt: '2026-07-27T10:00:00.000Z',
  comment: 'Padding is too small',
  severity: 'minor',
  intent: 'change',
  markType: 'element',
  anchor: null,
  anchorTarget: null,
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
  traces: [],
  assets: {},
});

const bulletListOf = (doc: AdfDoc): AdfNode => {
  const node = doc.content[1];
  if (!node) throw new Error('expected a bullet list at content[1]');
  return node;
};

const trace = (): CaliperTrace => ({
  id: 'a3f0c1d2-0000-4000-8000-000000000001',
  label: 'Place order fails on the second submit',
  startedAt: '2026-08-31T10:00:00.000Z',
  durationMs: 6000,
  truncated: false,
  page: {url: 'https://app.test/checkout', title: 'Checkout', viewport: {width: 1280, height: 800, dpr: 1}},
  sources: {network: 'cdp', console: 'cdp', state: 'devtools-bridge'},
  summary: {steps: 5, consoleErrors: 1, failedRequests: 1, stateActions: 4},
  files: {trace: 'caliper-a3f0c1d2.trace.json', video: 'caliper-a3f0c1d2.webm'},
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
    const list = bulletListOf(sessionToJiraComment(session([annotation()])));
    expect(list.type).toBe('bulletList');
    expect(list.content).toHaveLength(1);

    const serialized = JSON.stringify(list);
    expect(serialized).toContain('#01 [minor] PriceTag: ');
    expect(serialized).toContain('Padding is too small');
    expect(serialized).toContain('.price-block > b');
    expect(serialized).toContain('{"type":"code"}');
  });

  it('embeds an inline media node in the bullet when a media ref is provided', () => {
    const list = bulletListOf(
      sessionToJiraComment(session([annotation({screenshotId: 'shot-1'})]), {0: {id: 'att-42'}}),
    );
    const item = list.content?.[0];

    expect(item?.content).toHaveLength(2);
    expect(item?.content?.[1]).toMatchObject({
      type: 'mediaSingle',
      content: [{type: 'media', attrs: {type: 'file', id: 'att-42', collection: ''}}],
    });
  });

  it('omits media when no ref is provided for the bullet', () => {
    const list = bulletListOf(sessionToJiraComment(session([annotation({screenshotId: 'shot-1'})])));
    expect(JSON.stringify(list)).not.toContain('mediaSingle');
  });

  it('falls back to the tag name when the component is unknown', () => {
    const list = bulletListOf(
      sessionToJiraComment(session([annotation({target: {...annotation().target, componentName: null}})])),
    );
    expect(JSON.stringify(list)).toContain('#01 [minor] b: ');
  });

  // ADF requires a bulletList to hold at least one listItem, so an empty session is a heading alone.
  it('emits no bullet list at all for a session with nothing in it', () => {
    const doc = sessionToJiraComment(session([]));
    expect(doc.content).toHaveLength(1);
    expect(JSON.stringify(doc.content[0])).toContain('0 defects');
  });

  it('announces a trace-only session instead of claiming it is empty', () => {
    const doc = sessionToJiraComment({...session([]), traces: [trace()]});
    const rendered = JSON.stringify(doc);

    expect(rendered).toContain('0 defects, 1 trace');
    expect(rendered).toContain('Recorded traces');
    expect(rendered).toContain('Place order fails on the second submit');
    expect(rendered).toContain('5 steps, 1 console error, 1 failed request, 4 state actions');
  });

  // The video is the half made for the person reading the ticket, so unlike the agent-facing TOON this
  // is the one output that names it.
  it('names the video file so a reader knows which attachment to open', () => {
    const doc = sessionToJiraComment({...session([]), traces: [trace()]});
    expect(JSON.stringify(doc)).toContain('caliper-a3f0c1d2.webm');
  });

  it('says so when the recording was cut short', () => {
    const doc = sessionToJiraComment({...session([]), traces: [{...trace(), truncated: true}]});
    expect(JSON.stringify(doc)).toContain('hit its length limit');
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
