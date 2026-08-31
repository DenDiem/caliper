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
  traces: [],
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

  it('omits styles entirely for an add mark', () => {
    const output = toToon(session([annotation({intent: 'add'})]));
    expect(output).not.toContain('styles[');
  });

  it('folds four box sides that share a token into a single shorthand row', () => {
    const styled = annotation({
      target: {
        ...annotation().target,
        styles: {
          'padding-top': {value: '8px', token: '--spacing-2', tokenMatch: 'exact'},
          'padding-right': {value: '8px', token: '--spacing-2', tokenMatch: 'exact'},
          'padding-bottom': {value: '8px', token: '--spacing-2', tokenMatch: 'exact'},
          'padding-left': {value: '8px', token: '--spacing-2', tokenMatch: 'exact'},
        },
      },
    });
    const output = toToon(session([styled]));
    expect(output).toContain('ram-home div.about,padding,8px,--spacing-2,exact');
    expect(output).not.toContain('padding-top');
  });

  it('joins the per-component tokens of a mixed box shorthand instead of dropping to null', () => {
    const styled = annotation({
      target: {
        ...annotation().target,
        styles: {
          'padding-top': {value: '32px', token: '--space-5', tokenMatch: 'exact'},
          'padding-right': {value: '24px', token: '--space-4', tokenMatch: 'exact'},
          'padding-bottom': {value: '32px', token: '--space-5', tokenMatch: 'exact'},
          'padding-left': {value: '24px', token: '--space-4', tokenMatch: 'exact'},
        },
      },
    });
    const output = toToon(session([styled]));
    expect(output).toContain('padding,32px 24px,--space-5 --space-4,exact');
  });

  it('marks a box shorthand partial when only some sides carry a token', () => {
    const styled = annotation({
      target: {
        ...annotation().target,
        styles: {
          'padding-top': {value: '32px', token: '--space-5', tokenMatch: 'exact'},
          'padding-right': {value: '13px'},
          'padding-bottom': {value: '32px', token: '--space-5', tokenMatch: 'exact'},
          'padding-left': {value: '13px'},
        },
      },
    });
    const output = toToon(session([styled]));
    expect(output).toContain('padding,32px 13px,--space-5 13px,partial');
  });

  it('folds mixed box sides into a shorthand value with no token', () => {
    const styled = annotation({
      target: {
        ...annotation().target,
        styles: {
          'padding-top': {value: '8px'},
          'padding-right': {value: '16px'},
          'padding-bottom': {value: '8px'},
          'padding-left': {value: '16px'},
        },
      },
    });
    const output = toToon(session([styled]));
    expect(output).toContain('padding,8px 16px,null,null');
  });

  it('folds row-gap and column-gap into a single gap row', () => {
    const styled = annotation({
      target: {
        ...annotation().target,
        styles: {
          'row-gap': {value: '4px', token: '--spacing-1', tokenMatch: 'exact'},
          'column-gap': {value: '4px', token: '--spacing-1', tokenMatch: 'exact'},
        },
      },
    });
    const output = toToon(session([styled]));
    expect(output).toContain('gap,4px,--spacing-1,exact');
    expect(output).not.toContain('row-gap');
  });

  it('folds four border-width sides that share a token into a single border-width row', () => {
    const styled = annotation({
      target: {
        ...annotation().target,
        styles: {
          'border-top-width': {value: '1px', token: '--border-1', tokenMatch: 'exact'},
          'border-right-width': {value: '1px', token: '--border-1', tokenMatch: 'exact'},
          'border-bottom-width': {value: '1px', token: '--border-1', tokenMatch: 'exact'},
          'border-left-width': {value: '1px', token: '--border-1', tokenMatch: 'exact'},
        },
      },
    });
    const output = toToon(session([styled]));
    expect(output).toContain('border-width,1px,--border-1,exact');
    expect(output).not.toContain('border-top-width');
  });

  it('relabels a representative border-top-color to border-color so it does not read as top-only', () => {
    const styled = annotation({
      target: {
        ...annotation().target,
        styles: {
          'border-top-color': {value: 'rgb(228, 231, 236)', token: '--color-border', tokenMatch: 'exact'},
        },
      },
    });
    const output = toToon(session([styled]));
    expect(output).toContain('border-color,"rgb(228, 231, 236)",--color-border,exact');
    expect(output).not.toContain('border-top-color');
  });

  it('surfaces the component host styles under a scope column alongside the picked element', () => {
    const styled = annotation({
      target: {
        ...annotation().target,
        selector: 'app-stat-card.stats__tight div.card',
        hostSelector: 'app-stat-card.stats__tight',
        hostStyles: {
          'margin-top': {value: '14px'},
        },
        styles: {
          'padding-top': {value: '16px', token: '--spacing-4', tokenMatch: 'exact'},
        },
      },
    });
    const output = toToon(session([styled]));
    expect(output).toContain('styles[2]{scope,selector,property,value,token,match}:');
    expect(output).toContain('host,app-stat-card.stats__tight,margin-top,14px,null,null');
    expect(output).toContain('el,app-stat-card.stats__tight div.card,padding-top,16px,--spacing-4,exact');
  });

  it('omits the scope column when no mark contributes host styles', () => {
    const output = toToon(session([annotation()]));
    expect(output).toContain('styles[2]{selector,property,value,token,match}:');
    expect(output).not.toContain('{scope,');
  });

  it('drops empty host styles rather than emitting an empty host group', () => {
    const styled = annotation({
      target: {
        ...annotation().target,
        hostSelector: 'app-stat-card',
        hostStyles: {},
      },
    });
    const output = toToon(session([styled]));
    expect(output).not.toContain('{scope,');
    expect(output).not.toContain('host,');
  });

  it('reminds the agent the screenshot is a fallback', () => {
    const output = toToon(session([annotation()]));
    expect(output).toContain('screenshot is a fallback');
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

  it('always reports covers for an area, marking an empty region as an empty list', () => {
    const area = annotation({
      markType: 'area',
      region: {box: {x: 0, y: 0, width: 10, height: 10}, path: [], covers: []},
    });
    const output = toToon(session([area]));
    expect(output).toContain('covers: []');
    expect(output).not.toContain('(none)');
  });

  it('drops the derived selector from an area mark header, keeping bbox and covers', () => {
    const area = annotation({
      markType: 'area',
      region: {
        box: {x: 120, y: 600, width: 400, height: 160},
        path: [],
        covers: [{selector: 'app-recent-activity', coverage: 0.9}],
      },
    });
    const output = toToon(session([area]));
    expect(output).toContain('09216b54 minor change area\n');
    expect(output).not.toContain('change area ram-home div.about');
    expect(output).toContain('bbox: [120,600,400,160]');
    expect(output).toContain('covers: app-recent-activity 90%');
  });

  it('omits the misleading container text line for an area mark', () => {
    const area = annotation({
      markType: 'area',
      region: {box: {x: 0, y: 0, width: 10, height: 10}, path: [], covers: []},
    });
    const output = toToon(session([area]));
    expect(output).not.toContain('text: About us');
  });

  it('always gives an area an anchor, derived from its container when the mark carries none', () => {
    const area = annotation({
      markType: 'area',
      anchor: null,
      anchorTarget: null,
      target: {...annotation().target, selector: 'app-root div.page'},
      region: {box: {x: 227, y: 937, width: 308, height: 228}, path: [], covers: []},
    });
    const output = toToon(session([area]));
    expect(output).toContain('covers: []');
    expect(output).toContain('anchor: within → app-root div.page');
  });

  it('reports covers for a strike mark that has them', () => {
    const strike = annotation({
      markType: 'strike',
      intent: 'remove',
      region: {
        box: {x: 0, y: 0, width: 200, height: 40},
        path: [],
        covers: [{selector: 'app-recent-activity h2', coverage: 0.75}],
      },
    });
    const output = toToon(session([strike]));
    expect(output).toContain('covers: app-recent-activity h2 75%');
  });

  it('adds a bbox to element marks that share a selector, but not to a lone element mark', () => {
    const collidingLeft = annotation({id: 'a'.repeat(36), target: {...annotation().target, box: {x: 0, y: 0, width: 100, height: 40}}});
    const collidingRight = annotation({id: 'b'.repeat(36), target: {...annotation().target, box: {x: 0, y: 200, width: 100, height: 40}}});
    const collided = toToon(session([collidingLeft, collidingRight]));
    expect(collided).toContain('bbox: [0,0,100,40]');
    expect(collided).toContain('bbox: [0,200,100,40]');

    const lone = toToon(session([annotation()]));
    expect(lone).not.toContain('bbox:');
  });

  it('labels a viewport-filling element as container-level and drops its page-dump text', () => {
    const container = annotation({
      target: {...annotation().target, box: {x: 0, y: 0, width: 1440, height: 850}},
    });
    const output = toToon(session([container]));
    expect(output).toContain('change element (container-level) ram-home div.about');
    expect(output).not.toContain('text: About us');
  });

  it('emits identical element text once, deduped across marks', () => {
    const first = annotation({id: 'a'.repeat(36), target: {...annotation().target, selector: 'ram-home div.a'}});
    const second = annotation({id: 'b'.repeat(36), target: {...annotation().target, selector: 'ram-home div.b'}});
    const output = toToon(session([first, second]));
    expect(output.match(/text: About us/g)?.length).toBe(1);
  });

  it('states the homogeneous el scope once instead of dropping the column silently', () => {
    const output = toToon(session([annotation()]));
    expect(output).toContain('scope: el\nstyles[2]{selector,property,value,token,match}:');
  });

  it('carries the area-bbox and empty-covers guidance in help', () => {
    const output = toToon(session([annotation()]));
    expect(output).toContain('bbox is where the region sits, not a size to apply');
    expect(output).toContain('`covers: []` is conclusive');
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

  it('emits the screenshot path on a mark that has one', () => {
    const output = toToon(session([annotation({screenshot: '.caliper/45125a93/09216b54.png'})]));
    expect(output).toContain('screenshot: .caliper/45125a93/09216b54.png');
  });

  it('omits the screenshot line when a mark has none', () => {
    const output = toToon(session([annotation()]));
    expect(output).not.toContain('screenshot:');
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

describe('toToon with traces', () => {
  it('lists traces and appends the trace help', () => {
    const output = toToon({
      schemaVersion: 2,
      id: 'a3f0c1d2-0000-4000-8000-000000000001',
      createdAt: '2026-08-31T10:00:00.000Z',
      caliperVersion: '0.1.0',
      annotations: [],
      assets: {},
      traces: [
        {
          id: 'a3f0c1d2-0000-4000-8000-000000000001',
          label: 'Save fails on second submit',
          startedAt: '2026-08-31T10:00:00.000Z',
          durationMs: 24_400,
          truncated: false,
          page: {
            url: 'https://app.test/orders',
            title: 'Orders',
            viewport: {width: 1440, height: 900, dpr: 2},
          },
          sources: {network: 'cdp', console: 'cdp', state: 'devtools-bridge'},
          summary: {steps: 7, consoleErrors: 2, failedRequests: 1, stateActions: 12},
          files: {trace: 'caliper-a3f0c1d2.trace.json'},
        },
      ],
    });

    expect(output).toContain('traces: 1');
    expect(output).toContain('traces[1]:');
    expect(output).toContain('caliper trace <file>');
    expect(output).not.toContain('Arm the picker');
  });
});
