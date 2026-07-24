import {describe, expect, it} from 'vitest';
import {addZones, createSession, resolveZone, submitAnswers} from './session';
import {toReviewToon} from './to-review-toon';
import type {ElementContext} from '../schema/annotation.schema';

const base = () => createSession({id: 's1', token: 't', target: 'http://localhost:3000', createdAt: '2026-07-24T00:00:00.000Z'});

const resolvedTarget = (selector: string): ElementContext => ({
  selector,
  selectorStrategy: 'testid',
  selectorConfidence: 'high',
  tagName: 'button',
  componentName: null,
  componentSource: null,
  componentChain: [],
  text: '',
  attributes: {},
  box: {x: 0, y: 0, width: 10, height: 10},
  styles: {},
});

describe('toReviewToon', () => {
  it('renders a header with target and zone count', () => {
    const out = toReviewToon(addZones(base(), [{ref: 'z1', question: 'q'}]));
    expect(out).toContain('target: http://localhost:3000');
    expect(out).toContain('count: 1');
  });

  it('includes an answered anchored zone and its answer', () => {
    const s = submitAnswers(addZones(base(), [{ref: 'z1', selector: '[data-caliper-ref="z1"]', question: 'Right spacing?'}]), [{ref: 'z1', answer: 'use spacing-2', verdict: 'needs-work'}]);
    const out = toReviewToon(s);
    expect(out).toContain('z1');
    expect(out).toContain('use spacing-2');
    expect(out).toContain('needs-work');
  });

  it('marks an unanchored, unanswered zone as pending with null selector', () => {
    const out = toReviewToon(addZones(base(), [{ref: 'z9', question: 'What goes here?'}]));
    expect(out).toMatch(/z9.*null.*pending/s);
  });

  it('quotes a comma-containing answer', () => {
    const s = submitAnswers(addZones(base(), [{ref: 'z1', question: 'q'}]), [{ref: 'z1', answer: 'a, b, c'}]);
    expect(toReviewToon(s)).toContain('"a, b, c"');
  });

  it('reports the resolved selector when the zone has no agent-supplied selector but was anchored on the page', () => {
    const s = resolveZone(addZones(base(), [{ref: 'z1', question: 'Right label?'}]), 'z1', resolvedTarget('.cta-button'));
    const out = toReviewToon(s);
    expect(out).toContain('z1,null,.cta-button,');
  });

  it('help text does not claim a null selector means the zone was never built', () => {
    const out = toReviewToon(base());
    expect(out).not.toContain('was not built yet');
  });
});
