import {describe, expect, it} from 'vitest';
import {addZones, createSession, finalizeSession, resolveZone, submitAnswers} from './session';
import {toReviewToon} from './to-review-toon';
import type {ElementContext} from '../schema/annotation.schema';

const base = () => createSession({id: 's1', token: 't', target: 'http://localhost:3000', createdAt: '2026-07-24T00:00:00.000Z'});

const target = (selector: string): ElementContext => ({
  selector, selectorStrategy: 'testid', selectorConfidence: 'high', tagName: 'div',
  componentName: null, componentSource: null, componentChain: [], text: '', attributes: {},
  box: {x: 0, y: 0, width: 10, height: 10}, styles: {},
});

describe('toReviewToon', () => {
  it('renders a header with target and zone count', () => {
    const out = toReviewToon(addZones(base(), [{ref: 'z1', question: 'q'}]));
    expect(out).toContain('target: http://localhost:3000');
    expect(out).toContain('count: 1');
  });

  it('includes an answered zone with its answer and status', () => {
    const s = submitAnswers(
      addZones(base(), [{ref: 'z1', selector: '[data-caliper-ref="z1"]', question: 'Right spacing?'}]),
      [{ref: 'z1', answer: 'use spacing-2', verdict: 'needs-work'}],
    );
    expect(toReviewToon(s)).toContain('z1,use spacing-2,answered');
  });

  it('marks an unanswered zone as pending with a null answer', () => {
    const out = toReviewToon(addZones(base(), [{ref: 'z9', question: 'What goes here?'}]));
    expect(out).toContain('z9,null,pending');
  });

  it('quotes a comma-containing answer', () => {
    const s = submitAnswers(addZones(base(), [{ref: 'z1', question: 'q'}]), [{ref: 'z1', answer: 'a, b, c'}]);
    expect(toReviewToon(s)).toContain('"a, b, c"');
  });

  it('does not echo the zone question back to the agent', () => {
    const s = submitAnswers(addZones(base(), [{ref: 'z1', question: 'Right label copy?'}]), [{ref: 'z1', answer: 'Use Save'}]);
    const out = toReviewToon(s);
    expect(out).toContain('zones[1]{ref,answer,status,route}:');
    expect(out).not.toContain('Right label copy?');
  });

  it('help text does not claim a null selector means the zone was never built', () => {
    const out = toReviewToon(base());
    expect(out).not.toContain('was not built yet');
  });

  it('points the agent at the supplied selector, not a data-caliper-ref attribute', () => {
    const out = toReviewToon(addZones(base(), [{ref: 'z1', question: 'q'}]));
    expect(out).toContain("Apply each answer at the zone's anchor");
    expect(out).not.toContain('data-caliper-ref');
  });

  it('renders a dismissed verdict as its own status', () => {
    const s = submitAnswers(addZones(base(), [{ref: 'z1', question: 'q'}]), [
      {ref: 'z1', answer: 'irrelevant to the redesign', verdict: 'dismissed'},
    ]);
    expect(toReviewToon(s)).toContain('z1,irrelevant to the redesign,dismissed');
  });

  it('marks an unanswered zone as skipped once the session is finalized', () => {
    const s = finalizeSession(addZones(base(), [{ref: 'z1', question: 'q'}]));
    expect(toReviewToon(s)).toContain('z1,null,skipped,null');
    expect(toReviewToon(s)).toContain('status=skipped means');
  });

  it('surfaces the route the zone was resolved on', () => {
    const s = resolveZone(
      addZones(base(), [{ref: 'z1', question: 'q', route: '/orders'}]),
      'z1',
      target('div'),
      '/orders',
    );
    expect(toReviewToon(s)).toContain('z1,null,pending,/orders');
    expect(toReviewToon(s)).not.toContain('redirects[');
  });

  it('flags a zone resolved on a different route than expected', () => {
    const s = resolveZone(
      addZones(base(), [{ref: 'z1', question: 'q', route: '/orders'}]),
      'z1',
      target('div'),
      '/login',
    );
    const out = toReviewToon(s);
    expect(out).toContain('redirects[1]:');
    expect(out).toContain('z1: answered on /login, expected /orders');
  });
});
