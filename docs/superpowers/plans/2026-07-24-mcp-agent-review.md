# Agent→Human Review MCP — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ship an MCP server that lets a coding agent pin questions to uncertain UI regions on a live dev
preview, opens a browser where the developer answers, and returns the answers to the agent — no copy-paste.

**Architecture:** Reuse `@caliper/core` (schema, selector engine, token match) and `@caliper/overlay`
(highlight/popover primitives). New pure logic (review schemas, session reducers, HTML injector,
`toReviewToon`) goes in `packages/core` under vitest. A new `apps/mcp-server` (Node) runs a stdio MCP server
+ a loopback HTTP reverse-proxy that injects the overlay client into the dev app; the browser client
(`apps/mcp-server/client`) renders a question panel and POSTs answers back. Transport is async-first
(`caliper_ask` returns a resumable ticket; `caliper_wait` polls). Install is one `caliper init` command with
per-agent adapters.

**Tech Stack:** TypeScript (strict), Zod, Preact + @preact/signals, `@modelcontextprotocol/sdk` (stdio),
Node `http`/`https` + `http-proxy` (WS + proxying), `open` (browser launch), Vite (client IIFE bundle),
vitest, pnpm workspaces.

## Global Constraints

- `packages/**` — zero `chrome.*` / `browser.*`, no Node-only APIs, no `fetch`. Node/`fetch`/stdio live only in `apps/mcp-server` (`src` = Node, `client` = browser).
- Reuse `@caliper/core` and `@caliper/overlay`; do not re-derive selectors, token match, or overlay rendering.
- TypeScript strict; **no `as` assertions** (`consistent-type-assertions: never`) — fix types at source.
- LF line endings. All code / comments / docs / UI copy in **English**.
- Tests: **`packages/core` only** (vitest). `apps/*` are hand-verified — no `*.spec` in apps.
- `schemaVersion` stays `1`; new schema fields are additive (`.nullish()` + default).
- Do **not** modify `apps/qa-extension`; its build (`pnpm --filter @caliper/qa-extension build`) must keep passing.
- Do **not** run `wxt submit` / touch the Chrome Web Store (CI deploys on `v*` tags only).
- Commit per task: `feat(scope): summary` (or `test:`/`chore:`), **no `Co-Authored-By`**.
- Reference spec: `docs/superpowers/specs/2026-07-24-mcp-agent-review-design.md`.

---

## Cross-task interfaces (defined by the tasks below; listed here for coherence)

```ts
// @caliper/core — added by Tasks 1–4
export const reviewZoneSchema: z.ZodObject<...>;        // { ref, selector?, route?, question, severity? }
export type ReviewZone = z.infer<typeof reviewZoneSchema>;
export const askPayloadSchema: z.ZodObject<...>;        // { target?, zones: ReviewZone[] (min 1) }
export type AskPayload = z.infer<typeof askPayloadSchema>;

export interface ReviewZoneState {
  ref: string; selector: string | null; route: string | null; question: string;
  severity: Severity | null; resolvedTarget: ElementContext | null;
  answer: string | null; verdict: Verdict | null; answered: boolean;
}
export interface ReviewSessionState {
  id: string; token: string; target: string; createdAt: string; zones: ReviewZoneState[];
}
export const createSession: (init: {id: string; token: string; target: string; createdAt: string}) => ReviewSessionState;
export const addZones: (s: ReviewSessionState, zones: readonly ReviewZone[]) => ReviewSessionState;
export const setDraft: (s: ReviewSessionState, ref: string, patch: {answer?: string | null; verdict?: Verdict | null}) => ReviewSessionState;
export const resolveZone: (s: ReviewSessionState, ref: string, target: ElementContext) => ReviewSessionState;
export const submitAnswers: (s: ReviewSessionState, answers: readonly {ref: string; answer: string; verdict?: Verdict | null}[]) => ReviewSessionState;
export const pendingRefs: (s: ReviewSessionState) => string[];
export const allAnswered: (s: ReviewSessionState) => boolean;
export const toReviewToon: (s: ReviewSessionState) => string;
export const injectScriptTag: (html: string, scriptSrc: string) => string;

// caliperAnnotationSchema gains: answer: z.string().nullish().default(null)
```

---

## Task 1: Review schemas + additive `answer` field

**Files:**
- Modify: `packages/core/src/schema/annotation.schema.ts`
- Create: `packages/core/src/schema/review.schema.ts`
- Create: `packages/core/src/schema/review.schema.test.ts`
- Modify: `packages/core/src/index.ts` (export the new module)

**Interfaces:**
- Consumes: `severitySchema`, `verdictSchema`, `elementContextSchema` (existing, `annotation.schema.ts`).
- Produces: `reviewZoneSchema`, `ReviewZone`, `askPayloadSchema`, `AskPayload`; `caliperAnnotationSchema.answer`.

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/schema/review.schema.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @caliper/core exec vitest run src/schema/review.schema.test.ts`
Expected: FAIL — `review.schema` module not found / `answer` undefined.

- [ ] **Step 3: Write minimal implementation**

Create `packages/core/src/schema/review.schema.ts`:
```ts
import {z} from 'zod';
import {severitySchema} from './annotation.schema';

export const reviewZoneSchema = z.object({
  ref: z.string(),
  selector: z.string().optional(),
  route: z.string().optional(),
  question: z.string(),
  severity: severitySchema.optional(),
});

export const askPayloadSchema = z.object({
  target: z.string().url().optional(),
  zones: z.array(reviewZoneSchema).min(1),
});

export type ReviewZone = z.infer<typeof reviewZoneSchema>;
export type AskPayload = z.infer<typeof askPayloadSchema>;
```

In `packages/core/src/schema/annotation.schema.ts`, add one field to `caliperAnnotationSchema` (after `verdict`):
```ts
  verdict: verdictSchema.nullable().default(null),
  answer: z.string().nullish().default(null),
```

In `packages/core/src/index.ts`, add:
```ts
export * from './schema/review.schema';
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @caliper/core exec vitest run src/schema/review.schema.test.ts`
Expected: PASS (all 6 assertions).

- [ ] **Step 5: Confirm existing schema tests still pass**

Run: `pnpm --filter @caliper/core exec vitest run src/schema/annotation.schema.test.ts`
Expected: PASS (additive `answer` did not break existing parses).

- [ ] **Step 6: Commit**

```bash
git add packages/core/src/schema/review.schema.ts packages/core/src/schema/review.schema.test.ts packages/core/src/schema/annotation.schema.ts packages/core/src/index.ts
git commit -m "feat(core): review zone/ask schemas and additive annotation answer field"
```

---

## Task 2: Review session reducers (pure state machine)

**Files:**
- Create: `packages/core/src/review/session.ts`
- Create: `packages/core/src/review/session.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `ReviewZone` (Task 1), `Severity`, `Verdict`, `ElementContext` (existing).
- Produces: `ReviewZoneState`, `ReviewSessionState`, `createSession`, `addZones`, `setDraft`, `resolveZone`, `submitAnswers`, `pendingRefs`, `allAnswered`.

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/review/session.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @caliper/core exec vitest run src/review/session.test.ts`
Expected: FAIL — `./session` not found.

- [ ] **Step 3: Write minimal implementation**

Create `packages/core/src/review/session.ts`:
```ts
import type {ElementContext, Severity, Verdict} from '../schema/annotation.schema';
import type {ReviewZone} from '../schema/review.schema';

export interface ReviewZoneState {
  ref: string;
  selector: string | null;
  route: string | null;
  question: string;
  severity: Severity | null;
  resolvedTarget: ElementContext | null;
  answer: string | null;
  verdict: Verdict | null;
  answered: boolean;
}

export interface ReviewSessionState {
  id: string;
  token: string;
  target: string;
  createdAt: string;
  zones: ReviewZoneState[];
}

const toZoneState = (zone: ReviewZone): ReviewZoneState => ({
  ref: zone.ref,
  selector: zone.selector ?? null,
  route: zone.route ?? null,
  question: zone.question,
  severity: zone.severity ?? null,
  resolvedTarget: null,
  answer: null,
  verdict: null,
  answered: false,
});

const mapZone = (
  state: ReviewSessionState,
  ref: string,
  update: (zone: ReviewZoneState) => ReviewZoneState,
): ReviewSessionState => ({
  ...state,
  zones: state.zones.map((zone) => (zone.ref === ref ? update(zone) : zone)),
});

export const createSession = (init: {
  id: string;
  token: string;
  target: string;
  createdAt: string;
}): ReviewSessionState => ({...init, zones: []});

export const addZones = (state: ReviewSessionState, zones: readonly ReviewZone[]): ReviewSessionState => {
  let next = state.zones;
  for (const zone of zones) {
    const incoming = toZoneState(zone);
    const index = next.findIndex((existing) => existing.ref === zone.ref);
    next =
      index === -1
        ? [...next, incoming]
        : next.map((existing, position) =>
            position === index ? {...incoming, resolvedTarget: existing.resolvedTarget, answer: existing.answer, verdict: existing.verdict, answered: existing.answered} : existing,
          );
  }
  return {...state, zones: next};
};

export const setDraft = (
  state: ReviewSessionState,
  ref: string,
  patch: {answer?: string | null; verdict?: Verdict | null},
): ReviewSessionState =>
  mapZone(state, ref, (zone) => ({
    ...zone,
    answer: patch.answer === undefined ? zone.answer : patch.answer,
    verdict: patch.verdict === undefined ? zone.verdict : patch.verdict,
  }));

export const resolveZone = (state: ReviewSessionState, ref: string, target: ElementContext): ReviewSessionState =>
  mapZone(state, ref, (zone) => ({...zone, resolvedTarget: target}));

export const submitAnswers = (
  state: ReviewSessionState,
  answers: readonly {ref: string; answer: string; verdict?: Verdict | null}[],
): ReviewSessionState => {
  let next = state;
  for (const entry of answers) {
    next = mapZone(next, entry.ref, (zone) => ({
      ...zone,
      answer: entry.answer,
      verdict: entry.verdict === undefined ? zone.verdict : entry.verdict,
      answered: true,
    }));
  }
  return next;
};

export const pendingRefs = (state: ReviewSessionState): string[] =>
  state.zones.filter((zone) => !zone.answered).map((zone) => zone.ref);

export const allAnswered = (state: ReviewSessionState): boolean =>
  state.zones.length > 0 && state.zones.every((zone) => zone.answered);
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @caliper/core exec vitest run src/review/session.test.ts`
Expected: PASS.

- [ ] **Step 5: Export + commit**

Add to `packages/core/src/index.ts`:
```ts
export * from './review/session';
```
```bash
git add packages/core/src/review/session.ts packages/core/src/review/session.test.ts packages/core/src/index.ts
git commit -m "feat(core): pure review session reducers"
```

---

## Task 3: `toReviewToon` — AXI result table

**Files:**
- Create: `packages/core/src/review/to-review-toon.ts`
- Create: `packages/core/src/review/to-review-toon.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `ReviewSessionState`, `ReviewZoneState` (Task 2); the `cell`/table conventions mirror `to-toon.ts`.
- Produces: `toReviewToon(state: ReviewSessionState): string`.

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/review/to-review-toon.test.ts`:
```ts
import {describe, expect, it} from 'vitest';
import {addZones, createSession, submitAnswers} from './session';
import {toReviewToon} from './to-review-toon';

const base = () => createSession({id: 's1', token: 't', target: 'http://localhost:3000', createdAt: '2026-07-24T00:00:00.000Z'});

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
});
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @caliper/core exec vitest run src/review/to-review-toon.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `packages/core/src/review/to-review-toon.ts`:
```ts
import type {ReviewSessionState, ReviewZoneState} from './session';

const NULL = 'null';
const QUOTE_REQUIRED = /[",:|\t]|^\s|\s$/;

const cell = (value: string | null | undefined): string => {
  const flat = (value ?? '').replace(/\s+/g, ' ').trim();
  if (!flat) return NULL;
  if (!QUOTE_REQUIRED.test(flat)) return flat;
  return `"${flat.replace(/\\/g, '\\\\').replace(/"/g, '\\"')}"`;
};

const status = (zone: ReviewZoneState): string => (zone.answered ? 'answered' : 'pending');

export const toReviewToon = (state: ReviewSessionState): string => {
  const header = [
    'review:',
    `  id: ${cell(state.id)}`,
    `  target: ${cell(state.target)}`,
    `  count: ${state.zones.length}`,
  ].join('\n');

  const columns = ['ref', 'route', 'selector', 'question', 'answer', 'verdict', 'status'];
  const rows = state.zones.map((zone) =>
    [
      cell(zone.ref),
      cell(zone.route),
      cell(zone.selector),
      cell(zone.question),
      cell(zone.answer),
      cell(zone.verdict),
      status(zone),
    ].join(','),
  );

  const table = [`zones[${rows.length}]{${columns.join(',')}}:`, ...rows.map((row) => `  ${row}`)].join('\n');

  const help = [
    'help[2]:',
    '  Apply each answer at its selector; a null selector means the zone was not built yet — build it per the answer',
    '  status=pending means the developer has not answered that zone; call caliper_wait again',
  ].join('\n');

  return [header, table, help].join('\n\n');
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @caliper/core exec vitest run src/review/to-review-toon.test.ts`
Expected: PASS.

- [ ] **Step 5: Export + commit**

Add to `packages/core/src/index.ts`:
```ts
export * from './review/to-review-toon';
```
```bash
git add packages/core/src/review/to-review-toon.ts packages/core/src/review/to-review-toon.test.ts packages/core/src/index.ts
git commit -m "feat(core): toReviewToon AXI result table"
```

---

## Task 4: `injectScriptTag` — pure HTML injector

**Files:**
- Create: `packages/core/src/review/inject.ts`
- Create: `packages/core/src/review/inject.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Produces: `injectScriptTag(html: string, scriptSrc: string): string` — inserts a `data-caliper` external
  script before `</head>` (falls back to before `</body>`, then append); idempotent.

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/review/inject.test.ts`:
```ts
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
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm --filter @caliper/core exec vitest run src/review/inject.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Write minimal implementation**

Create `packages/core/src/review/inject.ts`:
```ts
const MARKER = 'data-caliper';

export const injectScriptTag = (html: string, scriptSrc: string): string => {
  if (html.includes(MARKER)) return html;

  const tag = `<script ${MARKER} src="${scriptSrc}"></script>`;
  const headClose = /<\/head>/i;
  const bodyClose = /<\/body>/i;

  if (headClose.test(html)) return html.replace(headClose, `${tag}</head>`);
  if (bodyClose.test(html)) return html.replace(bodyClose, `${tag}</body>`);
  return html + tag;
};
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm --filter @caliper/core exec vitest run src/review/inject.test.ts`
Expected: PASS.

- [ ] **Step 5: Full core suite + export + commit**

Run: `pnpm --filter @caliper/core test`
Expected: PASS (all suites green).
Add to `packages/core/src/index.ts`:
```ts
export * from './review/inject';
```
```bash
git add packages/core/src/review/inject.ts packages/core/src/review/inject.test.ts packages/core/src/index.ts
git commit -m "feat(core): pure HTML script injector"
```

---

## Task 5: Overlay review primitives (`@caliper/overlay/review`)

**Files:**
- Create: `packages/overlay/src/review/highlight-layer.tsx` (draw N rectangles)
- Create: `packages/overlay/src/review/answer-popover.tsx` (question + answer field)
- Create: `packages/overlay/src/review/index.tsx` (subpath entry — exports the two primitives + `createOverlayHost` re-export)
- Modify: `packages/overlay/package.json` (add the `./review` subpath export)

**Interfaces:**
- Consumes: `createOverlayHost` (existing), `Box`, `ElementContext` (`@caliper/core`), preact `render`.
- Produces (from `@caliper/overlay/review`):
  - `HighlightLayer(props: {boxes: {ref: string; box: Box; active: boolean}[]})` — Preact component.
  - `AnswerPopover(props: {ref: string; question: string; box: Box; answer: string; onInput: (v: string) => void; onClose: () => void})` — Preact component.
  - `createOverlayHost` (re-exported).
- **Do not** touch `packages/overlay/src/index.tsx` (the picker entry the extension imports).

- [ ] **Step 1: Add the subpath export**

In `packages/overlay/package.json`, extend `exports`:
```json
  "exports": {
    ".": "./src/index.tsx",
    "./review": "./src/review/index.tsx"
  },
```

- [ ] **Step 2: Implement `HighlightLayer`**

Create `packages/overlay/src/review/highlight-layer.tsx`:
```tsx
import type {Box} from '@caliper/core';

export interface HighlightLayerProps {
  boxes: {ref: string; box: Box; active: boolean}[];
}

export const HighlightLayer = ({boxes}: HighlightLayerProps) => (
  <>
    {boxes.map(({ref, box, active}) => (
      <div
        key={ref}
        class={active ? 'caliper-zone caliper-zone--active' : 'caliper-zone'}
        style={{
          position: 'fixed',
          left: `${box.x}px`,
          top: `${box.y}px`,
          width: `${box.width}px`,
          height: `${box.height}px`,
          pointerEvents: 'none',
        }}
      />
    ))}
  </>
);
```

- [ ] **Step 3: Implement `AnswerPopover`**

Create `packages/overlay/src/review/answer-popover.tsx`:
```tsx
import type {Box} from '@caliper/core';

export interface AnswerPopoverProps {
  ref: string;
  question: string;
  box: Box;
  answer: string;
  onInput: (value: string) => void;
  onClose: () => void;
}

export const AnswerPopover = ({question, box, answer, onInput, onClose}: AnswerPopoverProps) => (
  <div
    class="caliper-answer-popover"
    style={{position: 'fixed', left: `${box.x}px`, top: `${box.y + box.height}px`, pointerEvents: 'auto'}}
  >
    <p class="caliper-answer-popover__q">{question}</p>
    <textarea
      class="caliper-answer-popover__input"
      value={answer}
      onInput={(event) => onInput((event.target as HTMLTextAreaElement).value)}
      placeholder="Answer…"
    />
    <button type="button" class="caliper-answer-popover__close" onClick={onClose}>
      Done
    </button>
  </div>
);
```
> Note: `(event.target as HTMLTextAreaElement)` — the repo bans `as`. Use the typed handler instead:
```tsx
      onInput={(event: preact.JSX.TargetedEvent<HTMLTextAreaElement>) => onInput(event.currentTarget.value)}
```
Use the `currentTarget` form; delete the `as` line.

- [ ] **Step 4: Barrel the subpath entry**

Create `packages/overlay/src/review/index.tsx`:
```tsx
export {createOverlayHost} from '../overlay-host';
export type {OverlayHost} from '../overlay-host';
export {HighlightLayer} from './highlight-layer';
export type {HighlightLayerProps} from './highlight-layer';
export {AnswerPopover} from './answer-popover';
export type {AnswerPopoverProps} from './answer-popover';
```

- [ ] **Step 5: Verify the extension build is unaffected**

Run: `pnpm --filter @caliper/qa-extension build`
Expected: PASS (the picker entry `./` is untouched; the new `./review` subpath is not imported by the extension).

- [ ] **Step 6: Commit**

```bash
git add packages/overlay/package.json packages/overlay/src/review/
git commit -m "feat(overlay): review-mode highlight-layer and answer-popover primitives"
```

---

## Task 6: `apps/mcp-server` scaffold

**Files:**
- Create: `apps/mcp-server/package.json`, `apps/mcp-server/tsconfig.json`
- Create: `apps/mcp-server/src/config.ts` (constants: `CLIENT_PATH_PREFIX = '/__caliper__'`, cap ms, etc.)
- Modify: `.github/workflows/ci.yml` (add a `Type-check mcp-server` step)

**Interfaces:**
- Produces: an installable package `@caliper/mcp-server` with a `caliper` bin (wired in Task 12) and a
  `build:client` script (wired in Task 10).

- [ ] **Step 1: Package manifest**

Create `apps/mcp-server/package.json`:
```json
{
  "name": "@caliper/mcp-server",
  "version": "0.1.0",
  "type": "module",
  "bin": {"caliper": "./dist/cli.js"},
  "files": ["dist"],
  "scripts": {
    "build": "tsc -p tsconfig.json && pnpm run build:client",
    "build:client": "vite build -c client/vite.config.ts",
    "typecheck": "tsc --noEmit -p tsconfig.json"
  },
  "dependencies": {
    "@caliper/core": "workspace:*",
    "@caliper/overlay": "workspace:*",
    "@modelcontextprotocol/sdk": "^1.0.0",
    "@preact/signals": "^1.3.0",
    "http-proxy": "^1.18.1",
    "open": "^10.1.0",
    "preact": "^10.24.0",
    "zod": "^3.23.0"
  },
  "devDependencies": {
    "@types/http-proxy": "^1.17.15",
    "@types/node": "^22.7.0",
    "vite": "^5.4.0"
  }
}
```
> Pin exact available versions at install time; the majors above are the intended floors. Run `pnpm install` from the repo root after creating this file.

- [ ] **Step 2: TS config**

Create `apps/mcp-server/tsconfig.json` (mirror the strictness of `packages/core/tsconfig.json`; target NodeNext):
```json
{
  "compilerOptions": {
    "strict": true,
    "module": "NodeNext",
    "moduleResolution": "NodeNext",
    "target": "ES2022",
    "outDir": "dist",
    "rootDir": "src",
    "types": ["node"],
    "verbatimModuleSyntax": true,
    "skipLibCheck": true
  },
  "include": ["src"]
}
```

- [ ] **Step 3: Shared config constants**

Create `apps/mcp-server/src/config.ts`:
```ts
export const CLIENT_PATH_PREFIX = '/__caliper__';
export const CLIENT_BUNDLE_PATH = `${CLIENT_PATH_PREFIX}/client.js`;
export const ASK_WINDOW_MS = 50_000;
export const CALIPER_VERSION = '0.1.0';
```

- [ ] **Step 4: Add the CI type-check step**

In `.github/workflows/ci.yml`, after the extension type-check step, add:
```yaml
      - name: Type-check mcp-server
        run: pnpm exec tsc --noEmit -p apps/mcp-server/tsconfig.json
```

- [ ] **Step 5: Install + verify typecheck runs (empty is fine)**

Run: `pnpm install`
Run: `pnpm --filter @caliper/mcp-server typecheck`
Expected: PASS (no source yet beyond `config.ts`).

- [ ] **Step 6: Commit**

```bash
git add apps/mcp-server/package.json apps/mcp-server/tsconfig.json apps/mcp-server/src/config.ts .github/workflows/ci.yml pnpm-lock.yaml
git commit -m "chore(mcp-server): scaffold package, tsconfig, CI type-check"
```

---

## Task 7: Session registry, tickets, ephemeral server + persistence + security

**Files:**
- Create: `apps/mcp-server/src/session/registry.ts` (in-memory sessions + resolver map + token/Origin checks)
- Create: `apps/mcp-server/src/session/persistence.ts` (temp-file save/load)

**Interfaces:**
- Consumes: `ReviewSessionState`, `createSession`, `addZones`, `submitAnswers`, `allAnswered` (`@caliper/core`); Node `crypto`, `os`, `fs`.
- Produces:
  - `class SessionRegistry` with:
    - `open(target: string): ReviewSessionState` — create (random id + token), origin unknown yet, persist.
    - `setOrigin(id, origin): void` — set the loopback origin once the proxy has bound its port (used by auth).
    - `get(id): ReviewSessionState | undefined`.
    - `merge(id, zones): ReviewSessionState` — `addZones` + persist + emit SSE.
    - `draft(id, ref, patch): ReviewSessionState` — `setDraft` + persist + emit SSE.
    - `submit(id, answers): ReviewSessionState` — `submitAnswers` + persist + resolve waiters.
    - `wait(id, ms): Promise<ReviewSessionState>` — resolves when `allAnswered` or after `ms` (whichever first).
    - `subscribe(id, listener)` / `emit(id)` — for SSE.
  - `authorize(session, req): boolean` — token (query/header) + `Origin`/`Host` equal the loopback origin.

- [ ] **Step 1: Persistence helpers**

Create `apps/mcp-server/src/session/persistence.ts`:
```ts
import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {caliperSessionDir} from '../config';
import type {ReviewSessionState} from '@caliper/core';

const dir = () => {
  const path = join(tmpdir(), 'caliper-review');
  mkdirSync(path, {recursive: true});
  return path;
};

export const persist = (session: ReviewSessionState): void => {
  writeFileSync(join(dir(), `${session.id}.json`), JSON.stringify(session), 'utf8');
};

export const load = (id: string): ReviewSessionState | null => {
  try {
    return JSON.parse(readFileSync(join(dir(), `${id}.json`), 'utf8'));
  } catch {
    return null;
  }
};
```
> Add `export const caliperSessionDir = 'caliper-review';` to `config.ts` if you prefer the name centralized; otherwise inline as above.

- [ ] **Step 2: Registry with waiters + security**

Create `apps/mcp-server/src/session/registry.ts`:
```ts
import {randomUUID} from 'node:crypto';
import type {IncomingMessage} from 'node:http';
import {addZones, allAnswered, createSession, setDraft, submitAnswers} from '@caliper/core';
import type {ReviewSessionState, ReviewZone, Verdict} from '@caliper/core';
import {load, persist} from './persistence';

interface Entry {
  state: ReviewSessionState;
  origin: string; // e.g. http://127.0.0.1:49871 — set by setOrigin after the proxy binds
  waiters: (() => void)[];
  sseListeners: (() => void)[];
}

export class SessionRegistry {
  private readonly byId = new Map<string, Entry>();

  public open(target: string): ReviewSessionState {
    const state = createSession({id: randomUUID(), token: randomUUID(), target, createdAt: new Date().toISOString()});
    this.byId.set(state.id, {state, origin: '', waiters: [], sseListeners: []});
    persist(state);
    return state;
  }

  public setOrigin(id: string, origin: string): void {
    this.require(id).origin = origin;
  }

  public draft(id: string, ref: string, patch: {answer?: string | null; verdict?: Verdict | null}): ReviewSessionState {
    const entry = this.require(id);
    entry.state = setDraft(entry.state, ref, patch);
    persist(entry.state);
    this.flushSse(entry);
    return entry.state;
  }

  public get(id: string): ReviewSessionState | undefined {
    const entry = this.byId.get(id);
    if (entry) return entry.state;
    const restored = load(id);
    if (restored) this.byId.set(id, {state: restored, origin: '', waiters: [], sseListeners: []});
    return restored ?? undefined;
  }

  public merge(id: string, zones: readonly ReviewZone[]): ReviewSessionState {
    const entry = this.require(id);
    entry.state = addZones(entry.state, zones);
    persist(entry.state);
    this.flushSse(entry);
    return entry.state;
  }

  public submit(id: string, answers: readonly {ref: string; answer: string; verdict?: Verdict | null}[]): ReviewSessionState {
    const entry = this.require(id);
    entry.state = submitAnswers(entry.state, answers);
    persist(entry.state);
    entry.waiters.splice(0).forEach((resolve) => resolve());
    this.flushSse(entry);
    return entry.state;
  }

  public wait(id: string, ms: number): Promise<ReviewSessionState> {
    const entry = this.require(id);
    if (allAnswered(entry.state)) return Promise.resolve(entry.state);
    return new Promise((resolve) => {
      const timer = setTimeout(finish, ms);
      const waiter = () => finish();
      entry.waiters.push(waiter);
      function finish() {
        clearTimeout(timer);
        resolve(entry.state);
      }
    });
  }

  public authorize(id: string, req: IncomingMessage, token: string | null): boolean {
    const entry = this.byId.get(id);
    if (!entry) return false;
    if (token !== entry.state.token) return false;
    const origin = req.headers.origin;
    if (origin && origin !== entry.origin) return false;
    const host = req.headers.host;
    return !host || `http://${host}` === entry.origin || `https://${host}` === entry.origin;
  }

  public subscribe(id: string, listener: () => void): () => void {
    const entry = this.require(id);
    entry.sseListeners.push(listener);
    return () => {
      entry.sseListeners = entry.sseListeners.filter((item) => item !== listener);
    };
  }

  private flushSse(entry: Entry): void {
    entry.sseListeners.forEach((listener) => listener());
  }

  private require(id: string): Entry {
    const entry = this.byId.get(id);
    if (!entry) throw new Error(`Unknown review session: ${id}`);
    return entry;
  }
}
```

- [ ] **Step 3: Manual verification**

Write a throwaway `apps/mcp-server/src/session/_smoke.ts` that opens a session, merges two zones, starts a
`wait(id, 500)`, and after 100 ms calls `submit`; log that `wait` resolved early with `allAnswered === true`.
Run with `pnpm --filter @caliper/mcp-server exec tsx src/session/_smoke.ts` (add `tsx` as a dev dep if not
present), confirm the log, then **delete** `_smoke.ts`.

- [ ] **Step 4: Commit**

```bash
git add apps/mcp-server/src/session/
git commit -m "feat(mcp-server): session registry with waiters, persistence, auth"
```

---

## Task 8: Reverse-proxy HTTP server with injection

**Files:**
- Create: `apps/mcp-server/src/http/proxy-server.ts`

**Interfaces:**
- Consumes: `injectScriptTag`, `CLIENT_BUNDLE_PATH`, `CLIENT_PATH_PREFIX`, `SessionRegistry`; `http-proxy`, Node `http`, `fs`.
- Produces: `startProxyServer(opts: {target: string; sessionId: string; token: string; onListen: (origin: string) => void}): {origin: string; close: () => void}` — binds `127.0.0.1:0`, proxies `target`, injects the client into HTML, serves the client bundle, exposes the API routes (Task 9 wires handlers via a passed router).

- [ ] **Step 1: Implement the proxy + inject**

Create `apps/mcp-server/src/http/proxy-server.ts`:
```ts
import {createServer} from 'node:http';
import type {IncomingMessage, ServerResponse} from 'node:http';
import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {dirname, join} from 'node:path';
import httpProxy from 'http-proxy';
import {injectScriptTag} from '@caliper/core';
import {CLIENT_BUNDLE_PATH, CLIENT_PATH_PREFIX} from '../config';

const clientBundle = (): string =>
  readFileSync(join(dirname(fileURLToPath(import.meta.url)), 'client.js'), 'utf8');

export interface ProxyHandlers {
  api: (req: IncomingMessage, res: ServerResponse, url: URL) => boolean; // returns true if handled
}

export const startProxyServer = (opts: {
  target: string;
  sessionId: string;
  token: string;
  handlers: ProxyHandlers;
  onListen: (origin: string) => void;
}): {close: () => void} => {
  const proxy = httpProxy.createProxyServer({target: opts.target, selfHandleResponse: true, ws: true, changeOrigin: false});

  proxy.on('proxyRes', (proxyRes, req, res) => {
    const type = proxyRes.headers['content-type'] ?? '';
    const isHtml = type.includes('text/html');
    const chunks: Buffer[] = [];
    proxyRes.on('data', (chunk) => chunks.push(chunk));
    proxyRes.on('end', () => {
      const headers = {...proxyRes.headers};
      if (isHtml) {
        delete headers['content-length'];
        delete headers['content-encoding'];
        const src = `${CLIENT_BUNDLE_PATH}?s=${opts.sessionId}&t=${opts.token}`;
        const body = injectScriptTag(Buffer.concat(chunks).toString('utf8'), src);
        res.writeHead(proxyRes.statusCode ?? 200, headers);
        res.end(body);
        return;
      }
      res.writeHead(proxyRes.statusCode ?? 200, headers);
      res.end(Buffer.concat(chunks));
    });
  });

  proxy.on('error', (_err, _req, res) => {
    if ('writeHead' in res) {
      res.writeHead(502, {'content-type': 'text/html'});
      res.end('<h1>Caliper: dev server unreachable</h1><p>Is the target dev server running?</p>');
    }
  });

  const server = createServer((req, res) => {
    const origin = `http://127.0.0.1:${port()}`;
    const url = new URL(req.url ?? '/', origin);
    if (url.pathname === CLIENT_BUNDLE_PATH) {
      res.writeHead(200, {'content-type': 'text/javascript'});
      res.end(clientBundle());
      return;
    }
    if (url.pathname.startsWith(CLIENT_PATH_PREFIX)) {
      if (opts.handlers.api(req, res, url)) return;
    }
    proxy.web(req, res);
  });

  server.on('upgrade', (req, socket, head) => proxy.ws(req, socket, head));

  const port = () => {
    const address = server.address();
    return typeof address === 'object' && address ? address.port : 0;
  };

  server.listen(0, '127.0.0.1', () => opts.onListen(`http://127.0.0.1:${port()}`));
  return {close: () => {proxy.close(); server.close();}};
};
```
> The compression-strip is deliberately blunt (delete `content-encoding` + buffer). HTML docs are small; buffering is robust for a dev tool. Streaming-first-chunk injection is a future optimization (spec §6).

- [ ] **Step 2: Manual verification**

With a dev app running on `http://localhost:3000` (any — e.g. `pnpm --filter @caliper/qa-extension dev` is
not a web page; use any local site), start a throwaway script that calls `startProxyServer` with a no-op
`handlers.api` returning `false` and logs the origin, then `open` it. Confirm: the page loads through the
proxy and `view-source` shows the injected `<script data-caliper …>`. Confirm HMR still works on a Vite app.
Delete the throwaway script.

- [ ] **Step 3: Commit**

```bash
git add apps/mcp-server/src/http/proxy-server.ts
git commit -m "feat(mcp-server): reverse-proxy with HTML client injection and WS passthrough"
```

---

## Task 9: HTTP API routes (state / answers / drafts / SSE)

**Files:**
- Create: `apps/mcp-server/src/http/api.ts`

**Interfaces:**
- Consumes: `SessionRegistry`, `toReviewToon` (not here — server side returns JSON state), Node http.
- Produces: `makeApiHandlers(registry, sessionId): ProxyHandlers` implementing:
  - `GET  /__caliper__/state` → JSON `ReviewSessionState` (client rehydrate). Auth required.
  - `POST /__caliper__/drafts` `{ref, answer?, verdict?}` → 204. Auth. Calls `setDraft` via registry (add a `draft(id, ref, patch)` method mirroring `merge`).
  - `POST /__caliper__/answers` `{answers: [{ref, answer, verdict?}]}` → 204. Auth. Calls `registry.submit`.
  - `GET  /__caliper__/events` → SSE stream; pushes `state` events on merge/submit. Auth (token via query — EventSource cannot set headers).

- [ ] **Step 1: Implement the router**

Create `apps/mcp-server/src/http/api.ts`:
```ts
import type {IncomingMessage, ServerResponse} from 'node:http';
import type {SessionRegistry} from '../session/registry';
import type {ProxyHandlers} from './proxy-server';

const readJson = (req: IncomingMessage): Promise<unknown> =>
  new Promise((resolve, reject) => {
    const chunks: Buffer[] = [];
    req.on('data', (chunk) => chunks.push(chunk));
    req.on('end', () => {
      try {
        resolve(JSON.parse(Buffer.concat(chunks).toString('utf8') || 'null'));
      } catch (error) {
        reject(error);
      }
    });
  });

export const makeApiHandlers = (registry: SessionRegistry, sessionId: string): ProxyHandlers => ({
  api(req, res, url) {
    const token = url.searchParams.get('t') ?? req.headers['x-caliper-token'];
    const tokenValue = Array.isArray(token) ? token[0] : token ?? null;
    if (!registry.authorize(sessionId, req, tokenValue)) {
      res.writeHead(403).end();
      return true;
    }

    if (url.pathname.endsWith('/state') && req.method === 'GET') {
      res.writeHead(200, {'content-type': 'application/json'});
      res.end(JSON.stringify(registry.get(sessionId)));
      return true;
    }

    if (url.pathname.endsWith('/drafts') && req.method === 'POST') {
      void readJson(req).then((body) => {
        if (isDraft(body)) registry.draft(sessionId, body.ref, {answer: body.answer ?? null, verdict: body.verdict ?? null});
        res.writeHead(204).end();
      });
      return true;
    }

    if (url.pathname.endsWith('/answers') && req.method === 'POST') {
      void readJson(req).then((body) => {
        if (isAnswers(body)) registry.submit(sessionId, body.answers);
        res.writeHead(204).end();
      });
      return true;
    }

    if (url.pathname.endsWith('/events') && req.method === 'GET') {
      res.writeHead(200, {'content-type': 'text/event-stream', 'cache-control': 'no-cache', connection: 'keep-alive'});
      const push = () => res.write(`event: state\ndata: ${JSON.stringify(registry.get(sessionId))}\n\n`);
      push();
      const unsubscribe = registry.subscribe(sessionId, push);
      req.on('close', unsubscribe);
      return true;
    }

    return false;
  },
});

const isDraft = (value: unknown): value is {ref: string; answer?: string; verdict?: never} =>
  typeof value === 'object' && value !== null && 'ref' in value;

const isAnswers = (value: unknown): value is {answers: {ref: string; answer: string}[]} =>
  typeof value === 'object' && value !== null && Array.isArray((value as {answers?: unknown}).answers);
```
> The two `as` casts in the type guards violate the repo rule. Replace with property checks that narrow
> without assertion (e.g. `'answers' in value && Array.isArray(value.answers)` inside a `typeof value === 'object'`
> block after a `value !== null` guard). Fix before committing; the guards must be `as`-free.
> Add `draft(id, ref, patch)` to `SessionRegistry` (mirror `merge`, using `setDraft` from core + `flushSse`).

- [ ] **Step 2: Manual verification**

Extend the throwaway proxy script from Task 8 to pass `makeApiHandlers(registry, sessionId)`. `curl` each
route with and without the `?t=<token>`: confirm 403 without the token, 200/204 with it, and that a second
terminal `curl -N .../events` receives a `state` event when you POST `/answers`. Delete the throwaway.

- [ ] **Step 3: Commit**

```bash
git add apps/mcp-server/src/http/api.ts apps/mcp-server/src/session/registry.ts
git commit -m "feat(mcp-server): state/drafts/answers/SSE API with token+origin auth"
```

---

## Task 10: Browser client bundle

**Files:**
- Create: `apps/mcp-server/client/vite.config.ts` (IIFE build → `apps/mcp-server/dist/client.js`)
- Create: `apps/mcp-server/client/main.tsx` (bootstrap: read token from own script src, rehydrate, mount)
- Create: `apps/mcp-server/client/panel.tsx` (right-hand question list + Submit)
- Create: `apps/mcp-server/client/review-controller.ts` (resolve zones, MutationObserver, re-anchor via picker)
- Create: `apps/mcp-server/client/sink.ts` (fetch-based POST helpers — `fetch` allowed here, this is app/browser)

**Interfaces:**
- Consumes: `@caliper/overlay/review` (`HighlightLayer`, `AnswerPopover`, `createOverlayHost`), `mountOverlay` (`@caliper/overlay`, for re-anchor), `extractContext`, `collectTokens` (`@caliper/core`), `ReviewSessionState`.
- Produces: a built `dist/client.js` served by Task 8.

- [ ] **Step 1: Vite lib build config**

Create `apps/mcp-server/client/vite.config.ts`:
```ts
import {defineConfig} from 'vite';
import preact from '@preact/preset-vite';

export default defineConfig({
  plugins: [preact()],
  build: {
    lib: {entry: 'client/main.tsx', formats: ['iife'], name: 'CaliperReview', fileName: () => 'client.js'},
    outDir: 'dist',
    emptyOutDir: false,
  },
});
```
> Add `@preact/preset-vite` to devDependencies.

- [ ] **Step 2: fetch sink**

Create `apps/mcp-server/client/sink.ts`:
```ts
const params = new URLSearchParams(new URL(document.currentScript instanceof HTMLScriptElement ? document.currentScript.src : location.href).search);
export const TOKEN = params.get('t') ?? '';
export const SESSION = params.get('s') ?? '';

const prefix = '/__caliper__';
const auth = {'x-caliper-token': TOKEN, 'content-type': 'application/json'};

export const fetchState = () => fetch(`${prefix}/state?t=${TOKEN}`, {headers: {'x-caliper-token': TOKEN}}).then((r) => r.json());
export const postDraft = (ref: string, answer: string, verdict?: string) =>
  fetch(`${prefix}/drafts?t=${TOKEN}`, {method: 'POST', headers: auth, body: JSON.stringify({ref, answer, verdict})});
export const postAnswers = (answers: {ref: string; answer: string; verdict?: string}[]) =>
  fetch(`${prefix}/answers?t=${TOKEN}`, {method: 'POST', headers: auth, body: JSON.stringify({answers})});
export const events = () => new EventSource(`${prefix}/events?t=${TOKEN}`);
```
> `document.currentScript` is read at top-level module eval (valid during script execution). Keep this file free of `as`.

- [ ] **Step 3: Review controller (resolve + observe + re-anchor)**

Create `apps/mcp-server/client/review-controller.ts` implementing:
- `resolveZone(zone)`: `document.querySelector('[data-caliper-ref="'+ref+'"]') ?? (zone.selector ? document.querySelector(zone.selector) : null)`; on hit, `extractContext(el, tokens)` and store its `box`.
- a `MutationObserver` on `document.documentElement` (subtree) that re-runs resolution for still-unresolved zones and repaints.
- `reanchor(ref)`: call `mountOverlay({onSubmit})` (picker) once; on pick, treat the picked `context` as the zone's `resolvedTarget`, then `destroy()` the picker.
Expose a `signal`-based store (`@preact/signals`) of `{zones, boxes, activeRef}` the panel and overlay read.

- [ ] **Step 4: Panel + bootstrap**

Create `apps/mcp-server/client/panel.tsx` (right-hand list: each zone shows `question`, an answer field bound to `postDraft` on blur, a "locate/navigate" action that sets `activeRef` and, if `route` differs from `location.pathname`, `location.assign(route)`) and a bottom-right **Submit** that calls `postAnswers(collectedDrafts)`.

Create `apps/mcp-server/client/main.tsx`:
```tsx
import {render} from 'preact';
import {createOverlayHost, HighlightLayer, AnswerPopover} from '@caliper/overlay/review';
import {collectTokens} from '@caliper/core';
import {fetchState, events} from './sink';
import {startController} from './review-controller';
import {Panel} from './panel';

const boot = async () => {
  const host = createOverlayHost(''); // styles injected by the bundle
  const store = startController({tokens: collectTokens(document)});
  store.hydrate(await fetchState());
  const stream = events();
  stream.addEventListener('state', (event: MessageEvent) => store.hydrate(JSON.parse(event.data)));

  const paint = () =>
    render(
      <>
        <HighlightLayer boxes={store.boxes()} />
        <Panel store={store} />
        {store.activePopover() ? <AnswerPopover {...store.activePopover()} /> : null}
      </>,
      hostContainer(host),
    );
  store.onChange(paint);
  paint();
};

const hostContainer = (host: {root: ShadowRoot}) => {
  const container = document.createElement('div');
  container.style.pointerEvents = 'none';
  host.root.append(container);
  return container;
};

void boot();
```
> Keep panel/popover `pointerEvents:auto` on interactive elements only (host is `pointerEvents:none`). No `as` anywhere; type the `MessageEvent` param explicitly.

- [ ] **Step 5: Build the client**

Run: `pnpm --filter @caliper/mcp-server build:client`
Expected: `apps/mcp-server/dist/client.js` produced (IIFE).

- [ ] **Step 6: Manual end-to-end (with Tasks 7–9)**

Wire a throwaway script: `registry.open('http://localhost:3000', origin)` → `startProxyServer` with
`makeApiHandlers` → `open(origin)`. In the dev app, add `data-caliper-ref="z1"` to some element, merge a
zone `{ref:'z1', question:'Right spacing?'}`, and confirm in the browser: the rectangle draws over the
element, the panel lists the question, typing autosaves (Network shows `/drafts`), Submit posts `/answers`,
and the SSE pushes state. Delete the throwaway.

- [ ] **Step 7: Commit**

```bash
git add apps/mcp-server/client/
git commit -m "feat(mcp-server): browser review client (panel, controller, overlay, sink)"
```

---

## Task 11: MCP server + `caliper_ask` / `caliper_wait`

**Files:**
- Create: `apps/mcp-server/src/server.ts` (MCP server, tools)
- Create: `apps/mcp-server/src/review-runner.ts` (ties registry + proxy + browser open per ask)

**Interfaces:**
- Consumes: `@modelcontextprotocol/sdk` (`Server`, `StdioServerTransport`), `askPayloadSchema`, `toReviewToon`, `SessionRegistry`, `startProxyServer`, `makeApiHandlers`, `open`, `ASK_WINDOW_MS`.
- Produces: an executable MCP server exposing `caliper_ask` and `caliper_wait`.

- [ ] **Step 1: Review runner**

Create `apps/mcp-server/src/review-runner.ts`:
```ts
import open from 'open';
import {toReviewToon} from '@caliper/core';
import type {AskPayload, ReviewSessionState} from '@caliper/core';
import {SessionRegistry} from './session/registry';
import {startProxyServer} from './http/proxy-server';
import {makeApiHandlers} from './http/api';
import {ASK_WINDOW_MS} from './config';

export class ReviewRunner {
  private readonly registry = new SessionRegistry();
  private current: {id: string; close: () => void} | null = null;

  public async ask(payload: AskPayload): Promise<{completed: boolean; text: string; ticket: string}> {
    const target = payload.target ?? this.defaultTarget();
    if (!this.current) {
      const origin = await this.startServer(target);
      const session = this.registry.get(this.currentId());
      if (session) this.registry.merge(session.id, payload.zones);
      await open(origin);
    } else {
      this.registry.merge(this.current.id, payload.zones);
    }
    return this.settle(this.current!.id);
  }

  public async wait(ticket: string): Promise<{completed: boolean; text: string; ticket: string}> {
    return this.settle(ticket);
  }

  private async settle(id: string): Promise<{completed: boolean; text: string; ticket: string}> {
    const state = await this.registry.wait(id, ASK_WINDOW_MS);
    const completed = state.zones.every((zone) => zone.answered);
    const toon = toReviewToon(state);
    const text = completed ? toon : `${toon}\n\nstatus: PENDING — not all zones answered. Call caliper_wait({ticket: "${id}"}) to continue.`;
    return {completed, text, ticket: id};
  }

  // startServer(target): session = registry.open(target); { close } = startProxyServer({
  //   target, sessionId: session.id, token: session.token, handlers: makeApiHandlers(registry, session.id),
  //   onListen: (origin) => registry.setOrigin(session.id, origin) });
  //   this.current = { id: session.id, close }; return origin (await the onListen via a Promise).
  // currentId(): this.current!.id.  defaultTarget(): process.env.CALIPER_TARGET (pinned by caliper init).
}
```
> Fill `startServer`, `currentId`, `defaultTarget` (read the pinned target from an env var written by `caliper init`, e.g. `process.env.CALIPER_TARGET`). Keep the fast path: if the developer answers within the window, `ask` returns completed directly; otherwise it returns the pending text with the ticket.

- [ ] **Step 2: MCP wiring**

Create `apps/mcp-server/src/server.ts`:
```ts
import {Server} from '@modelcontextprotocol/sdk/server/index.js';
import {StdioServerTransport} from '@modelcontextprotocol/sdk/server/stdio.js';
import {CallToolRequestSchema, ListToolsRequestSchema} from '@modelcontextprotocol/sdk/types.js';
import {askPayloadSchema} from '@caliper/core';
import {ReviewRunner} from './review-runner';

const runner = new ReviewRunner();
const server = new Server({name: 'caliper', version: '0.1.0'}, {capabilities: {tools: {}}});

const ASK_DESCRIPTION =
  'Ask the developer about UI regions you are UNSURE how to build while implementing a design. ' +
  'MUST: before calling, stamp data-caliper-ref="<ref>" on each element in the code you just wrote. ' +
  'Opens a browser where the developer answers; returns their answers keyed by ref. ' +
  'If it returns status PENDING, call caliper_wait with the ticket.';

server.setRequestHandler(ListToolsRequestSchema, () => ({
  tools: [
    {name: 'caliper_ask', description: ASK_DESCRIPTION, inputSchema: {type: 'object', properties: {
      target: {type: 'string', description: 'Dev preview URL (optional; defaults to the configured target)'},
      zones: {type: 'array', items: {type: 'object', properties: {
        ref: {type: 'string'}, selector: {type: 'string'}, route: {type: 'string'},
        question: {type: 'string'}, severity: {type: 'string'},
      }, required: ['ref', 'question']}},
    }, required: ['zones']}},
    {name: 'caliper_wait', description: 'Resume waiting for developer answers. Call with the ticket from a PENDING caliper_ask.',
      inputSchema: {type: 'object', properties: {ticket: {type: 'string'}}, required: ['ticket']}},
  ],
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  if (request.params.name === 'caliper_ask') {
    const payload = askPayloadSchema.parse(request.params.arguments);
    const result = await runner.ask(payload);
    return {content: [{type: 'text', text: result.text}]};
  }
  if (request.params.name === 'caliper_wait') {
    const ticket = String((request.params.arguments ?? {}).ticket ?? '');
    const result = await runner.wait(ticket);
    return {content: [{type: 'text', text: result.text}]};
  }
  throw new Error(`Unknown tool: ${request.params.name}`);
});

await server.connect(new StdioServerTransport());
```
> Verify exact SDK import paths/type names against the installed `@modelcontextprotocol/sdk` version — the
> `server/index.js` + `types.js` layout is stable across 1.x but confirm. Avoid `as`; `String(...)` narrows safely.

- [ ] **Step 3: Manual verification (real MCP client)**

Build (`pnpm --filter @caliper/mcp-server build`). Register the built server with Claude Code
(`claude mcp add caliper -- node <abs>/apps/mcp-server/dist/server.js`, with `CALIPER_TARGET` set). In a
Claude Code session over a running dev app, have it call `caliper_ask` with one zone; confirm the browser
opens, you answer + Submit, and the tool result comes back as the `toReviewToon` table. Test the PENDING
path by not answering for >50 s and confirming `caliper_wait` resumes.

- [ ] **Step 4: Commit**

```bash
git add apps/mcp-server/src/server.ts apps/mcp-server/src/review-runner.ts
git commit -m "feat(mcp-server): stdio MCP server with async caliper_ask/caliper_wait"
```

---

## Task 12: Installer + agent adapters + `caliper init`

**Files:**
- Create: `apps/mcp-server/src/adapters/types.ts` (`AgentAdapter`)
- Create: `apps/mcp-server/src/adapters/claude-code.ts`
- Create: `apps/mcp-server/src/adapters/codex.ts`
- Create: `apps/mcp-server/src/cli.ts` (the `caliper` bin — `init`)
- Create: `apps/mcp-server/skills/caliper-review/SKILL.md` (Claude Code guidance, shipped in the package)

**Interfaces:**
- Produces: `interface AgentAdapter {id; detect(); registerServer(cfg); installGuidance(); uninstall()}`; a `caliper init [--global] [--agent <id>] [--target <url>]` command that runs the matching adapters.

- [ ] **Step 1: Adapter contract**

Create `apps/mcp-server/src/adapters/types.ts`:
```ts
export interface InstallConfig {
  serverCommand: string;   // node <abs>/dist/server.js
  target: string;          // pinned dev URL
  global: boolean;
}

export interface AgentAdapter {
  id: string;
  detect(): boolean;
  registerServer(config: InstallConfig): void;
  installGuidance(config: InstallConfig): void;
  uninstall(): void;
}
```

- [ ] **Step 2: Claude Code adapter**

Create `apps/mcp-server/src/adapters/claude-code.ts` — `detect()` checks for `~/.claude.json` or a project
`.mcp.json`; `registerServer()` runs `claude mcp add caliper -- node <serverCommand>` with
`env CALIPER_TARGET=<target>` (or edits `.mcp.json` directly); `installGuidance()` copies
`skills/caliper-review/SKILL.md` into the Claude Code skills dir (global: `~/.claude/skills/`; project:
`.claude/skills/`). Show the exact `.mcp.json` shape in the file.

- [ ] **Step 3: Codex adapter**

Create `apps/mcp-server/src/adapters/codex.ts` — `registerServer()` writes the MCP server entry into Codex's
`config.toml` (`[mcp_servers.caliper]` with `command`, `args`, `env`, and a generous `tool_timeout_sec`);
`installGuidance()` appends a Caliper section to the project `AGENTS.md` (or `~/.codex/AGENTS.md` when
`--global`). Include the exact TOML block in the file.

- [ ] **Step 4: CLI**

Create `apps/mcp-server/src/cli.ts` — parse `init` flags, resolve `serverCommand` to the installed
`dist/server.js` absolute path, pick adapters (`--agent`, else every `detect()`-true adapter, else prompt),
run `registerServer` + `installGuidance`, print a summary. `#!/usr/bin/env node` shebang; ensure `bin` maps
to `dist/cli.js`.

- [ ] **Step 5: Skill file**

Create `apps/mcp-server/skills/caliper-review/SKILL.md` — frontmatter `name: caliper-review`,
`description: Use when implementing a design and you are genuinely unsure what a specific UI region should
do or look like — stamp data-caliper-ref on the element, then call caliper_ask.` Body: the data-caliper-ref
MUST, one worked example, and when NOT to use it (when you are confident — just build it).

- [ ] **Step 6: Manual verification**

`pnpm --filter @caliper/mcp-server build`; from a scratch dir run `node <abs>/dist/cli.js init --agent codex
--target http://localhost:3000` and confirm the `config.toml` block + `AGENTS.md` section appear; repeat
`--agent claude-code` and confirm the `.mcp.json` entry + copied skill. Roll back the scratch edits.

- [ ] **Step 7: Commit**

```bash
git add apps/mcp-server/src/adapters/ apps/mcp-server/src/cli.ts apps/mcp-server/skills/
git commit -m "feat(mcp-server): caliper init installer with claude-code and codex adapters"
```

---

## Task 13: Lint boundary hardening

**Files:**
- Modify: `eslint.config.js` (add `no-restricted-globals` for `fetch`/`process` scoped to `packages/**`)

**Interfaces:** none.

- [ ] **Step 1: Add the scoped rule**

In `eslint.config.js`, add a block scoped to `packages/**/*.{ts,tsx}` extending the existing
`no-restricted-globals` (keep `chrome`/`browser`) with `fetch` and `process`. Do **not** apply it to
`apps/**` (the client legitimately uses `fetch`, the server uses `process`).

- [ ] **Step 2: Verify packages stay clean and apps are unaffected**

Run: `pnpm exec eslint packages apps/mcp-server`
Expected: PASS — no `fetch`/`process` usage in `packages/**`; `apps/mcp-server` unaffected.

- [ ] **Step 3: Commit**

```bash
git add eslint.config.js
git commit -m "chore: enforce no fetch/process in packages via eslint"
```

---

## Final verification

- [ ] `pnpm -r test` → all `packages/core` suites PASS.
- [ ] `pnpm exec eslint .` → clean.
- [ ] `pnpm exec tsc --noEmit -p packages/core/tsconfig.json` / `overlay` / `apps/mcp-server` → clean.
- [ ] `pnpm --filter @caliper/qa-extension build` → PASS (extension untouched).
- [ ] Real MCP client round-trip (Task 11 Step 3) and installer (Task 12 Step 6) verified by hand.

## Self-review notes (author)

- **Spec coverage:** D1/D2/D3/D4/D5 → Tasks 8 (proxy default), 12 (snippet fallback lives in the adapter
  guidance; the proxy is the built default), 7+11 (async ticket), 12 (adapters), 6 (monorepo app). Schema
  §4 → Task 1. Reducers/toon/injector §3 → Tasks 2–4. Overlay seam §7 → Task 5 (primitives) + Task 10
  (panel in client). Security §8 → Tasks 7+9. Persistence §9 → Task 7. Remote/WSL §10 → Task 11 (the runner
  always returns the URL in `text`; document port-forwarding in the SKILL.md/README). Testing §11 → Tasks
  1–4. Lint §12 → Task 13.
- **Deferred to execution (empirical, spec §14):** exact `@modelcontextprotocol/sdk` import paths and the
  `ASK_WINDOW_MS` value vs real client defaults; the snippet-fallback UX (documented in the adapter guidance
  and README, wired only if the proxy HMR check fails — implement the auto-detect in Task 8's `proxy.on('error')`
  path as a follow-up if hand-testing shows HMR breakage).
- **`as`-free reminder:** Tasks 5, 9, 10 contain draft snippets using `as` for brevity — each is flagged
  inline with the `as`-free replacement to apply before committing.
