import {describe, expect, it} from 'vitest';
import {addZones, allAnswered, createSession, pendingRefs, resolveZone, setDraft, submitAnswers} from './session';
import type {ElementContext} from '../schema/annotation.schema';

const target = (selector: string): ElementContext => ({
  selector, selectorStrategy: 'testid', selectorConfidence: 'high', tagName: 'div',
  componentName: null, componentSource: null, componentChain: [], text: '', attributes: {},
  box: {x: 0, y: 0, width: 10, height: 10}, styles: {},
});

const base = () => createSession({id: 's1', token: 't', target: 'http://localhost:3000', createdAt: '2026-07-24T00:00:00.000Z'});

describe('review session reducers', () => {
  it('createSession starts empty', () => {
    expect(base().zones).toEqual([]);
  });

  it('addZones maps requests to states with null resolution/answer', () => {
    const s = addZones(base(), [{ref: 'z1', question: 'q1'}, {ref: 'z2', selector: 'x', question: 'q2', severity: 'minor'}]);
    expect(s.zones.map((z) => z.ref)).toEqual(['z1', 'z2']);
    expect(s.zones[0]).toMatchObject({selector: null, route: null, severity: null, resolvedTarget: null, answer: null, verdict: null, answered: false});
    expect(s.zones[1]).toMatchObject({selector: 'x', severity: 'minor'});
  });

  it('addZones merges by ref (same ref updates, new ref appends)', () => {
    const s1 = addZones(base(), [{ref: 'z1', question: 'q1'}]);
    const s2 = addZones(s1, [{ref: 'z1', question: 'q1-updated'}, {ref: 'z2', question: 'q2'}]);
    expect(s2.zones).toHaveLength(2);
    expect(s2.zones[0].question).toBe('q1-updated');
  });

  it('setDraft updates answer/verdict without marking answered', () => {
    const s = setDraft(addZones(base(), [{ref: 'z1', question: 'q'}]), 'z1', {answer: 'draft', verdict: 'needs-work'});
    expect(s.zones[0]).toMatchObject({answer: 'draft', verdict: 'needs-work', answered: false});
  });

  it('resolveZone attaches the extracted target', () => {
    const s = resolveZone(addZones(base(), [{ref: 'z1', question: 'q'}]), 'z1', target('div'));
    expect(s.zones[0].resolvedTarget?.selector).toBe('div');
  });

  it('submitAnswers finalizes answers and marks answered', () => {
    const s = submitAnswers(addZones(base(), [{ref: 'z1', question: 'q'}, {ref: 'z2', question: 'q2'}]), [{ref: 'z1', answer: 'do X', verdict: 'accepted'}]);
    expect(s.zones[0]).toMatchObject({answer: 'do X', verdict: 'accepted', answered: true});
    expect(s.zones[1].answered).toBe(false);
  });

  it('pendingRefs and allAnswered track unanswered zones', () => {
    const s0 = addZones(base(), [{ref: 'z1', question: 'q'}, {ref: 'z2', question: 'q2'}]);
    expect(pendingRefs(s0)).toEqual(['z1', 'z2']);
    expect(allAnswered(s0)).toBe(false);
    const s1 = submitAnswers(s0, [{ref: 'z1', answer: 'a'}, {ref: 'z2', answer: 'b'}]);
    expect(pendingRefs(s1)).toEqual([]);
    expect(allAnswered(s1)).toBe(true);
  });

  it('reducers do not mutate the input state', () => {
    const s0 = addZones(base(), [{ref: 'z1', question: 'q'}]);
    const snapshot = JSON.stringify(s0);
    setDraft(s0, 'z1', {answer: 'x'});
    expect(JSON.stringify(s0)).toBe(snapshot);
  });
});
