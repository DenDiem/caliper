import {describe, expect, it} from 'vitest';
import {caliperAnnotationSchema, caliperSessionSchema} from './annotation.schema';

const validContext = {
  selector: '[data-testid="inform"]',
  selectorStrategy: 'testid',
  selectorConfidence: 'high',
  tagName: 'div',
  componentName: 'soa-inform-block',
  componentSource: 'tag-heuristic',
  componentChain: ['soa-inform-block', 'soa-menu-page'],
  text: 'Delivery is closed',
  attributes: {'data-testid': 'inform'},
  box: {x: 10, y: 20, width: 300, height: 48},
  styles: {color: {value: 'rgb(51, 51, 51)', token: '--color-text-primary', tokenMatch: 'exact'}},
};

const validAnnotation = {
  id: 'a1',
  createdAt: '2026-07-22T10:00:00.000Z',
  comment: 'Padding is too small',
  severity: 'minor',
  page: {url: 'https://app.test/menu', title: 'Menu', viewport: {width: 1440, height: 900, dpr: 2}},
  target: validContext,
};

describe('caliperAnnotationSchema', () => {
  it('accepts a minimal valid annotation', () => {
    expect(caliperAnnotationSchema.parse(validAnnotation).id).toBe('a1');
  });

  it('rejects an unknown severity', () => {
    const result = caliperAnnotationSchema.safeParse({...validAnnotation, severity: 'urgent'});
    expect(result.success).toBe(false);
  });

  it('rejects a non-url figmaUrl', () => {
    const result = caliperAnnotationSchema.safeParse({...validAnnotation, figmaUrl: 'not-a-url'});
    expect(result.success).toBe(false);
  });

  it('reads an annotation stored before author existed as human-authored', () => {
    const parsed = caliperAnnotationSchema.parse(validAnnotation);
    expect(parsed.author).toBe('human');
    expect(parsed.concernType).toBeNull();
    expect(parsed.verdict).toBeNull();
  });

  it('accepts an agent-authored concern carrying a verdict', () => {
    const parsed = caliperAnnotationSchema.parse({
      ...validAnnotation,
      author: 'agent',
      concernType: 'guessed-token',
      verdict: 'needs-work',
    });
    expect(parsed.author).toBe('agent');
    expect(parsed.concernType).toBe('guessed-token');
    expect(parsed.verdict).toBe('needs-work');
  });

  it('rejects an unknown verdict', () => {
    const result = caliperAnnotationSchema.safeParse({...validAnnotation, verdict: 'lgtm'});
    expect(result.success).toBe(false);
  });

  it('defaults an empty session to schemaVersion 1', () => {
    const session = caliperSessionSchema.parse({
      id: 's1',
      createdAt: '2026-07-22T10:00:00.000Z',
      caliperVersion: '0.1.0',
      annotations: [],
      assets: {},
    });
    expect(session.schemaVersion).toBe(1);
  });
});
