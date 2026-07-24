import {describe, expect, it} from 'vitest';
import {askPayloadSchema, reviewZoneSchema} from './review.schema';
import {caliperAnnotationSchema} from './annotation.schema';

describe('reviewZoneSchema', () => {
  it('accepts a minimal unanchored zone (no selector)', () => {
    const parsed = reviewZoneSchema.parse({ref: 'z1', question: 'What goes here?'});
    expect(parsed).toEqual({ref: 'z1', question: 'What goes here?'});
  });

  it('accepts a fully anchored zone', () => {
    const parsed = reviewZoneSchema.parse({
      ref: 'z2', selector: '[data-caliper-ref="z2"]', route: '/orders', question: 'Right spacing?', severity: 'minor',
    });
    expect(parsed.selector).toBe('[data-caliper-ref="z2"]');
    expect(parsed.severity).toBe('minor');
  });

  it('rejects a zone missing ref or question', () => {
    expect(reviewZoneSchema.safeParse({ref: 'z3'}).success).toBe(false);
    expect(reviewZoneSchema.safeParse({question: 'x'}).success).toBe(false);
  });
});

describe('askPayloadSchema', () => {
  it('requires at least one zone', () => {
    expect(askPayloadSchema.safeParse({zones: []}).success).toBe(false);
  });

  it('accepts an optional target and a zone list', () => {
    const parsed = askPayloadSchema.parse({
      target: 'http://localhost:3000',
      zones: [{ref: 'z1', question: 'q'}],
    });
    expect(parsed.target).toBe('http://localhost:3000');
    expect(parsed.zones).toHaveLength(1);
  });
});

describe('caliperAnnotationSchema.answer', () => {
  it('defaults answer to null when omitted', () => {
    const parsed = caliperAnnotationSchema.parse({
      id: 'a', createdAt: '2026-07-24T00:00:00.000Z', comment: 'q', severity: 'minor',
      page: {url: 'http://x', title: 't', viewport: {width: 1, height: 1, dpr: 1}},
      target: {
        selector: 'div', selectorStrategy: 'nth-path', selectorConfidence: 'low', tagName: 'div',
        componentName: null, componentSource: null, componentChain: [], text: '', attributes: {},
        box: {x: 0, y: 0, width: 0, height: 0}, styles: {},
      },
    });
    expect(parsed.answer).toBeNull();
  });
});
