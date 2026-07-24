import {describe, expect, it} from 'vitest';
import {injectScriptTag} from './inject';

const SRC = '/__caliper__/client.js?s=s1&t=tok';

describe('injectScriptTag', () => {
  it('inserts the script before </head>', () => {
    const out = injectScriptTag('<html><head><title>x</title></head><body></body></html>', SRC);
    expect(out).toContain(`<script data-caliper src="${SRC}"></script></head>`);
  });

  it('falls back to </body> when there is no head', () => {
    const out = injectScriptTag('<body><div>x</div></body>', SRC);
    expect(out).toContain(`<script data-caliper src="${SRC}"></script></body>`);
  });

  it('appends when there is neither head nor body', () => {
    const out = injectScriptTag('<div>x</div>', SRC);
    expect(out.endsWith(`<script data-caliper src="${SRC}"></script>`)).toBe(true);
  });

  it('is idempotent — does not inject twice', () => {
    const once = injectScriptTag('<head></head>', SRC);
    const twice = injectScriptTag(once, SRC);
    expect(twice.match(/data-caliper/g)).toHaveLength(1);
  });

  it('is case-insensitive on the head tag', () => {
    const out = injectScriptTag('<HTML><HEAD></HEAD></HTML>', SRC);
    expect(out).toContain('<script data-caliper');
  });
});
