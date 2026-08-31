# Caliper Trace Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** QA presses Start trace, reproduces a bug, presses Stop — and the session carries a machine-readable account of the sequence (steps, DOM replay, console, network, store actions) plus a ~1 MB video, readable end-to-end by an agent through `caliper pull` / `caliper read`.

**Architecture:** A `document_start` main-world content script hosts rrweb, a Redux DevTools shim and console/fetch/XHR patches; `chrome.debugger` attaches for the trace's duration as the preferred network/console source and silently falls back to those patches when it cannot; an offscreen document encodes the tab capture to VP9 under a bitrate budget. Pure collection logic lives in a new `packages/recorder` with no `chrome.*`, so it is unit-testable. The reading side gains summary-first TOON output plus `caliper read` and `caliper trace` for zooming in.

**Tech Stack:** TypeScript, zod, vitest, WXT (MV3), Preact + `@preact/signals`, rrweb, fflate, Chrome `offscreen` / `tabCapture` / `debugger` APIs, pnpm workspaces.

**Spec:** `docs/superpowers/specs/2026-08-31-caliper-trace-design.md`

## Global Constraints

- **Store name (exact, D10):** `Caliper QA — UI Marks & Bug Traces for AI Coding Agents`
- **Feature vocabulary (§4):** `Trace` everywhere — `Start trace` in UI, `CaliperTrace` in schema, `*.trace.json` on disk, `caliper trace` on the CLI. Never reuse the word "session" for a trace.
- **Schema version:** `CaliperSession.schemaVersion` becomes `1 | 2`. v1 sessions must keep parsing (§9.1). Never drop v1 support.
- **Two audiences (§1):** `trace.json` + replay are the agent's; `.webm` is the human's. No code path ever hands the video to an agent.
- **Video budget (D6):** ≤1280 px wide, ≤12 fps, `videoBitsPerSecond: 250_000`, default `maxDurationMs: 120_000`.
- **Redaction (D8):** `redactSecrets` defaults to **off**. Never flip the default.
- **Devtools hook (D4):** if `window.__REDUX_DEVTOOLS_EXTENSION__` exists, wrap it — never overwrite.
- **CDP (D2):** preferred, never required. A failed attach is a normal path, not an error.
- **Context economy (D9):** `pull`/`read` print summaries only. Bodies and rrweb events reach the agent solely through `caliper trace`.
- **Repo conventions:** LF endings; conventional commits (`feat(scope): …`); no `as T` assertions; explicit access modifiers are a consumer-project rule and do **not** apply here — match the surrounding functional style of `packages/core`.
- **Comments:** this repo comments the *why* of non-obvious decisions, in full sentences above the code. Match that density — do not narrate what the code does.

---

## File Structure

**Created**

| Path | Responsibility |
| --- | --- |
| `packages/core/src/schema/trace.schema.ts` | zod contract for `CaliperTrace` (manifest) and `TraceDetail` (`trace.json`) |
| `packages/core/src/export/trace-toon.ts` | Renders a trace summary block for TOON output |
| `packages/recorder/package.json`, `tsconfig.json`, `vitest.config.ts` | New workspace package, no `chrome.*` |
| `packages/recorder/src/index.ts` | Barrel |
| `packages/recorder/src/ring-buffer.ts` | Bounded buffer; capacity 0 until a trace starts (D3) |
| `packages/recorder/src/console-collector.ts` | `console.*` patch → console entries |
| `packages/recorder/src/network-collector.ts` | `fetch` / `XHR` patches → network entries |
| `packages/recorder/src/state-bridge.ts` | Redux DevTools shim that wraps rather than replaces (D4) |
| `packages/recorder/src/steps.ts` | DOM events → `TraceStep` |
| `packages/recorder/src/redact.ts` | `redactSecrets` masking (D8) |
| `packages/recorder/src/assemble.ts` | Buffers → `{trace, detail}` with summary and size caps |
| `apps/qa-extension/src/entrypoints/collector.content.ts` | main-world, `document_start` collector |
| `apps/qa-extension/src/entrypoints/offscreen/index.html`, `main.ts` | tabCapture → `MediaRecorder` under budget |
| `apps/qa-extension/src/trace/blob-store.ts` | IndexedDB store for `.webm` / `.replay` blobs (D5) |
| `apps/qa-extension/src/trace/cdp.ts` | `chrome.debugger` collector with fallback signalling |
| `apps/qa-extension/src/trace/lifecycle.ts` | Background trace lifecycle keyed by `tabId` |
| `apps/qa-extension/src/entrypoints/sidepanel/RecordBar.tsx` | Start/Stop + live counters |
| `apps/qa-extension/src/entrypoints/sidepanel/TraceCard.tsx` | Recorded-trace card |
| `apps/ask/src/trace/read-archive.ts` | `caliper read <zip\|dir>` |
| `apps/ask/src/trace/slice.ts` | `caliper trace <file> --network\|--console\|--state\|--around` |
| `apps/ask/vitest.config.ts` | `apps/ask` currently has **no** test runner; this adds one |

**Modified**

| Path | Change |
| --- | --- |
| `apps/qa-extension/wxt.config.ts` | Name, description, `default_title`, `offscreen`/`tabCapture`/`debugger`/`webNavigation` permissions, collector registration |
| `packages/core/src/schema/annotation.schema.ts` | Export `pageSchema`; `schemaVersion: 1\|2`; add `traces` |
| `packages/core/src/export/to-toon.ts` | Emit the traces section and its help lines |
| `packages/core/src/index.ts` | Export the new modules |
| `apps/qa-extension/src/messaging/messages.ts` | Trace messages |
| `apps/qa-extension/src/entrypoints/background.ts` | Wire the lifecycle |
| `apps/qa-extension/src/sinks/store.ts` | `traces` in `emptySession`, trace store ops |
| `apps/qa-extension/src/export/export-session.ts` | Trace files in the zip and the Jira manifest |
| `apps/qa-extension/src/jira/send-to-jira.ts` | Upload trace attachments |
| `apps/qa-extension/src/entrypoints/sidepanel/App.tsx` | Mount `RecordBar` / `TraceCard` |
| `apps/qa-extension/src/entrypoints/options/App.tsx` | `redactSecrets`, `maxDurationMs`, `videoBitrate`, `enableCdp` |
| `apps/ask/src/jira/pull.ts` | v2 + trace materialisation |
| `apps/ask/src/cli.ts` | `read` and `trace` commands |
| `apps/ask/skills/caliper-fix/SKILL.md` | Artifact taxonomy and the zoom-in workflow |
| `docs/store-listing.md`, `docs/seo.md`, `README.md`, `apps/qa-extension/README.md`, `PRIVACY.md` | Rename + trace documentation |

---

## Task 1: Rename the extension to Caliper QA

Independent of every other task; land it first so the rename is not entangled with feature review.

**Files:**
- Modify: `apps/qa-extension/wxt.config.ts:7-9,26`
- Modify: `docs/store-listing.md:9-11`
- Modify: `docs/seo.md:20-22`
- Modify: `README.md`, `apps/qa-extension/README.md`

**Interfaces:**
- Consumes: nothing.
- Produces: nothing consumed by code. Later tasks add permissions to the same `wxt.config.ts` manifest block.

- [ ] **Step 1: Update the manifest**

In `apps/qa-extension/wxt.config.ts`, replace the `name`, `description` and `action.default_title` values:

```ts
    name: 'Caliper QA — UI Marks & Bug Traces for AI Coding Agents',
    description:
      'Mark up any web UI or record a full bug trace — DOM, console, network and store — and hand a precise, replayable defect to Claude Code, Cursor or any AI agent.',
```

```ts
    action: {
      default_title: 'Toggle Caliper QA',
```

- [ ] **Step 2: Resync the two stale docs**

`docs/store-listing.md` and `docs/seo.md` both still carry `Caliper — Design Mode & UI Annotation for AI Coding Agents`, which `49cb747` already removed from the manifest. In **both** files replace that string with:

```
Caliper QA — UI Marks & Bug Traces for AI Coding Agents
```

and replace the summary block in both with:

```
Mark up any web UI or record a bug trace — DOM, console, network and store — and hand it to Claude Code, Cursor or any AI agent.
```

(128 characters — the store's summary limit is 132.)

In `docs/seo.md`, add `bug trace`, `session replay` and `repro` to the "Keywords to weave into the description" list.

- [ ] **Step 3: Update the READMEs**

In root `README.md` and `apps/qa-extension/README.md`, change the extension's product name to **Caliper QA** wherever it names the extension. Leave the umbrella brand `Caliper`, the npm package `@dendiem/caliper` and the package name `@caliper/qa-extension` untouched.

- [ ] **Step 4: Verify no stale name survives**

Run: `grep -rn "Design Mode & UI Annotation" --include=*.md --include=*.ts . | grep -v node_modules`
Expected: no output.

Run: `grep -rn "Caliper QA — UI Marks & Bug Traces for AI Coding Agents" apps/qa-extension/wxt.config.ts docs/store-listing.md docs/seo.md`
Expected: three matches, one per file.

- [ ] **Step 5: Commit**

```bash
git add apps/qa-extension/wxt.config.ts docs/store-listing.md docs/seo.md README.md apps/qa-extension/README.md
git commit -m "feat(extension): rename to Caliper QA and resync the store listing"
```

---

## Task 2: Trace schema in `@caliper/core`

**Files:**
- Create: `packages/core/src/schema/trace.schema.ts`
- Create: `packages/core/src/schema/trace.schema.test.ts`
- Modify: `packages/core/src/schema/annotation.schema.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `zod`.
- Produces: `caliperTraceSchema`, `traceDetailSchema`, `pageSchema`, and the types `CaliperTrace`, `TraceDetail`, `TraceStep`, `TraceConsoleEntry`, `TraceNetworkEntry`, `TraceStateEntry`, `TraceSummary`, `TraceSources`. `CaliperSession` gains `traces: CaliperTrace[]` and `schemaVersion: 1 | 2`.

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/schema/trace.schema.test.ts`:

```ts
import {describe, expect, it} from 'vitest';
import {caliperSessionSchema} from './annotation.schema';
import {caliperTraceSchema, traceDetailSchema} from './trace.schema';

const trace = {
  id: 'a3f0c1d2-0000-4000-8000-000000000001',
  label: 'Save fails on second submit',
  startedAt: '2026-08-31T10:00:00.000Z',
  durationMs: 24_000,
  page: {url: 'https://app.test/orders', title: 'Orders', viewport: {width: 1440, height: 900, dpr: 2}},
  sources: {network: 'cdp', console: 'cdp', state: 'devtools-bridge'},
  summary: {steps: 7, consoleErrors: 2, failedRequests: 1, stateActions: 12},
  files: {trace: 'caliper-a3f0c1d2-t1.trace.json'},
};

describe('caliperTraceSchema', () => {
  it('parses a trace and defaults truncated to false', () => {
    const parsed = caliperTraceSchema.parse(trace);
    expect(parsed.truncated).toBe(false);
    expect(parsed.files.video).toBeUndefined();
  });

  it('rejects an unknown network source', () => {
    expect(() => caliperTraceSchema.parse({...trace, sources: {...trace.sources, network: 'guess'}})).toThrow();
  });
});

describe('traceDetailSchema', () => {
  it('defaults every channel to an empty list', () => {
    const parsed = traceDetailSchema.parse({traceId: trace.id});
    expect(parsed).toMatchObject({steps: [], console: [], network: [], state: [], stateSnapshots: {}});
    expect(parsed.schemaVersion).toBe(2);
  });

  it('keeps a failed request flagged', () => {
    const parsed = traceDetailSchema.parse({
      traceId: trace.id,
      network: [{t: 1200, method: 'POST', url: 'https://api.test/orders', status: 500, durationMs: 340, failed: true}],
    });
    expect(parsed.network[0].failed).toBe(true);
  });
});

describe('caliperSessionSchema', () => {
  const session = {
    id: 'b1',
    createdAt: '2026-08-31T10:00:00.000Z',
    caliperVersion: '0.1.0',
    annotations: [],
    assets: {},
  };

  it('still parses a v1 session and gives it an empty traces list', () => {
    const parsed = caliperSessionSchema.parse(session);
    expect(parsed.schemaVersion).toBe(1);
    expect(parsed.traces).toEqual([]);
  });

  it('parses a v2 session carrying a trace', () => {
    const parsed = caliperSessionSchema.parse({...session, schemaVersion: 2, traces: [trace]});
    expect(parsed.traces).toHaveLength(1);
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @caliper/core test`
Expected: FAIL — `Cannot find module './trace.schema'`.

- [ ] **Step 3: Write the schema**

Create `packages/core/src/schema/trace.schema.ts`:

```ts
import {z} from 'zod';
import {pageSchema} from './annotation.schema';

// Which collector produced a channel. `fallback` means the in-page monkey-patches ran because
// chrome.debugger could not attach — bodies may be missing, and the agent is told so rather than
// silently reading a partial log as complete.
export const traceSourceSchema = z.enum(['cdp', 'fallback']);
export const traceStateSourceSchema = z.enum(['devtools-bridge', 'none']);
export const traceStepKindSchema = z.enum(['click', 'input', 'key', 'navigation', 'scroll']);
export const traceConsoleLevelSchema = z.enum(['log', 'info', 'warn', 'error', 'debug']);

// All `t` values are milliseconds from the trace's start, never wall-clock — a trace is read as a
// relative timeline and its absolute start lives once, on the trace itself.
export const traceStepSchema = z.object({
  t: z.number(),
  kind: traceStepKindSchema,
  selector: z.string().nullish(),
  text: z.string().nullish(),
  url: z.string().nullish(),
});

export const traceConsoleEntrySchema = z.object({
  t: z.number(),
  level: traceConsoleLevelSchema,
  text: z.string(),
  stack: z.string().nullish(),
});

export const traceNetworkEntrySchema = z.object({
  t: z.number(),
  method: z.string(),
  url: z.string(),
  status: z.number(),
  durationMs: z.number(),
  failed: z.boolean().default(false),
  requestBody: z.string().nullish(),
  responseBody: z.string().nullish(),
  headers: z.record(z.string()).nullish(),
});

export const traceStateEntrySchema = z.object({
  t: z.number(),
  action: z.string(),
  diff: z.unknown().nullish(),
});

export const traceSummarySchema = z.object({
  steps: z.number(),
  consoleErrors: z.number(),
  failedRequests: z.number(),
  stateActions: z.number(),
});

export const traceSourcesSchema = z.object({
  network: traceSourceSchema,
  console: traceSourceSchema,
  state: traceStateSourceSchema,
});

export const traceFilesSchema = z.object({
  trace: z.string(),
  replay: z.string().optional(),
  video: z.string().optional(),
});

// What the session manifest carries: metadata and counts only. The channels themselves live in the
// sibling trace.json, so a manifest stays small enough to read whole.
export const caliperTraceSchema = z.object({
  id: z.string(),
  label: z.string(),
  startedAt: z.string().datetime(),
  durationMs: z.number(),
  truncated: z.boolean().default(false),
  page: pageSchema,
  sources: traceSourcesSchema,
  summary: traceSummarySchema,
  files: traceFilesSchema,
});

export const traceDetailSchema = z.object({
  traceId: z.string(),
  schemaVersion: z.literal(2).default(2),
  steps: z.array(traceStepSchema).default([]),
  console: z.array(traceConsoleEntrySchema).default([]),
  network: z.array(traceNetworkEntrySchema).default([]),
  state: z.array(traceStateEntrySchema).default([]),
  // The full store state is snapshotted at the ends only; per-action payloads would dwarf every other
  // channel, so `state[].diff` carries them and only while they fit under the assembler's cap.
  stateSnapshots: z.object({start: z.unknown().optional(), end: z.unknown().optional()}).default({}),
});

export type TraceSource = z.infer<typeof traceSourceSchema>;
export type TraceStateSource = z.infer<typeof traceStateSourceSchema>;
export type TraceStepKind = z.infer<typeof traceStepKindSchema>;
export type TraceConsoleLevel = z.infer<typeof traceConsoleLevelSchema>;
export type TraceStep = z.infer<typeof traceStepSchema>;
export type TraceConsoleEntry = z.infer<typeof traceConsoleEntrySchema>;
export type TraceNetworkEntry = z.infer<typeof traceNetworkEntrySchema>;
export type TraceStateEntry = z.infer<typeof traceStateEntrySchema>;
export type TraceSummary = z.infer<typeof traceSummarySchema>;
export type TraceSources = z.infer<typeof traceSourcesSchema>;
export type TraceFiles = z.infer<typeof traceFilesSchema>;
export type CaliperTrace = z.infer<typeof caliperTraceSchema>;
export type TraceDetail = z.infer<typeof traceDetailSchema>;
```

- [ ] **Step 4: Extract `pageSchema` and extend the session**

In `packages/core/src/schema/annotation.schema.ts`, add above `caliperAnnotationSchema`:

```ts
export const pageSchema = z.object({
  url: z.string(),
  title: z.string(),
  viewport: z.object({width: z.number(), height: z.number(), dpr: z.number()}),
});
```

Replace the inline `page:` object inside `caliperAnnotationSchema` with `page: pageSchema,`.

Then change `caliperSessionSchema`. Import the trace schema at the top of the file
(`import {caliperTraceSchema} from './trace.schema';`) and replace the `schemaVersion` line and add
`traces`:

```ts
export const caliperSessionSchema = z.object({
  // v1 predates traces. It still parses — a ticket filed before this release must keep working — and
  // simply reads back with an empty `traces` list.
  schemaVersion: z.union([z.literal(1), z.literal(2)]).default(1),
  id: z.string(),
  createdAt: z.string().datetime(),
  label: z.string().optional(),
  caliperVersion: z.string(),
  annotations: z.array(caliperAnnotationSchema),
  traces: z.array(caliperTraceSchema).default([]),
  assets: z.record(z.string()),
});
```

Add `export type Page = z.infer<typeof pageSchema>;` beside the other type exports.

> `trace.schema.ts` imports `pageSchema` from `annotation.schema.ts` and `annotation.schema.ts`
> imports `caliperTraceSchema` back. This cycle is fine for types and zod objects evaluated at module
> scope in ESM, but if vitest reports `Cannot access before initialization`, break it by moving
> `pageSchema` into a third file `packages/core/src/schema/page.schema.ts` and importing it from both.

- [ ] **Step 5: Export from the barrel**

In `packages/core/src/index.ts`, add after the `annotation.schema` line:

```ts
export * from './schema/trace.schema';
```

- [ ] **Step 6: Run the tests**

Run: `pnpm --filter @caliper/core test`
Expected: PASS, all files including the pre-existing suites.

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/schema packages/core/src/index.ts
git commit -m "feat(core): add the CaliperTrace schema and session schemaVersion 2"
```

---

## Task 3: Trace rendering in TOON

**Files:**
- Create: `packages/core/src/export/trace-toon.ts`
- Create: `packages/core/src/export/trace-toon.test.ts`
- Modify: `packages/core/src/export/to-toon.ts`
- Modify: `packages/core/src/export/to-toon.test.ts`
- Modify: `packages/core/src/index.ts`

**Interfaces:**
- Consumes: `CaliperTrace`, `TraceDetail` from Task 2.
- Produces: `traceBlock(trace: CaliperTrace): string` and `traceHelpLines(): readonly string[]`, both consumed by `toToon` here and by `apps/ask` in Tasks 16–18.

- [ ] **Step 1: Write the failing test**

Create `packages/core/src/export/trace-toon.test.ts`:

```ts
import {describe, expect, it} from 'vitest';
import type {CaliperTrace} from '../schema/trace.schema';
import {traceBlock} from './trace-toon';

const trace: CaliperTrace = {
  id: 'a3f0c1d2-0000-4000-8000-000000000001',
  label: 'Save fails on second submit',
  startedAt: '2026-08-31T10:00:00.000Z',
  durationMs: 24_400,
  truncated: false,
  page: {url: 'https://app.test/orders', title: 'Orders', viewport: {width: 1440, height: 900, dpr: 2}},
  sources: {network: 'cdp', console: 'cdp', state: 'devtools-bridge'},
  summary: {steps: 7, consoleErrors: 2, failedRequests: 1, stateActions: 12},
  files: {trace: 'caliper-a3f0c1d2-t1.trace.json', replay: 'caliper-a3f0c1d2-t1.replay.ndjson.gz', video: 'caliper-a3f0c1d2-t1.webm'},
};

describe('traceBlock', () => {
  it('leads with the id, duration and label', () => {
    expect(traceBlock(trace)).toContain('a3f0c1d2 24.4s "Save fails on second submit"');
  });

  it('reports the counts and the detail file', () => {
    const block = traceBlock(trace);
    expect(block).toContain('summary: 7 steps, 2 console errors, 1 failed request, 12 state actions');
    expect(block).toContain('trace: caliper-a3f0c1d2-t1.trace.json');
  });

  it('never names the video file', () => {
    expect(traceBlock(trace)).not.toContain('.webm');
  });

  it('flags a fallback network source', () => {
    const block = traceBlock({...trace, sources: {...trace.sources, network: 'fallback'}});
    expect(block).toContain('network captured in fallback mode — request/response bodies may be missing');
  });

  it('flags truncation', () => {
    expect(traceBlock({...trace, truncated: true})).toContain('truncated: true');
  });
});
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `pnpm --filter @caliper/core test trace-toon`
Expected: FAIL — `Cannot find module './trace-toon'`.

- [ ] **Step 3: Write the renderer**

Create `packages/core/src/export/trace-toon.ts`:

```ts
import type {CaliperTrace} from '../schema/trace.schema';

const ID_LENGTH = 8;
const MS_PER_SECOND = 1000;

const seconds = (ms: number): string => `${(ms / MS_PER_SECOND).toFixed(1)}s`;

const plural = (count: number, noun: string): string => `${count} ${noun}${count === 1 ? '' : 's'}`;

const summaryLine = (trace: CaliperTrace): string => {
  const {steps, consoleErrors, failedRequests, stateActions} = trace.summary;
  return [
    plural(steps, 'step'),
    plural(consoleErrors, 'console error'),
    plural(failedRequests, 'failed request'),
    plural(stateActions, 'state action'),
  ].join(', ');
};

// One block per trace: enough for the agent to decide whether this trace explains the bug, and the
// filename to open when it does. Channels stay on disk — a 30-second trace with response bodies would
// consume the context before the ticket has been read.
export const traceBlock = (trace: CaliperTrace): string => {
  const lines = [
    `  ${trace.id.slice(0, ID_LENGTH)} ${seconds(trace.durationMs)} "${trace.label}"`,
    `    url: ${trace.page.url}`,
    `    summary: ${summaryLine(trace)}`,
    `    trace: ${trace.files.trace}`,
  ];

  if (trace.files.replay) lines.push(`    replay: ${trace.files.replay}`);
  if (trace.truncated) {
    lines.push('    truncated: true — the recording exceeded its limit and the earliest seconds were dropped');
  }
  if (trace.sources.network === 'fallback') {
    lines.push('    note: network captured in fallback mode — request/response bodies may be missing');
  }
  if (trace.sources.state === 'none') {
    lines.push('    note: no store state captured — the app exposes no Redux/NgRx devtools hook');
  }

  return lines.join('\n');
};

export const traceHelpLines = (): readonly string[] => [
  'A trace is a recorded reproduction: read its steps in order, then correlate console/network by their `t` (ms from trace start)',
  'Open a trace with `caliper trace <file>`; narrow it with --network / --console / --state / --around <t> instead of reading it whole',
  'The .webm beside a trace is for humans — never open it, it carries nothing the trace does not',
];
```

- [ ] **Step 4: Wire it into `toToon`**

In `packages/core/src/export/to-toon.ts`, add the import:

```ts
import {traceBlock, traceHelpLines} from './trace-toon';
```

In `helpLines`, change the early return so an empty session with traces is not told to arm the picker, and append the trace help when traces exist. Replace the function's opening guard:

```ts
const helpLines = (session: CaliperSession, hasScreenshots: boolean): string[] => {
  if (session.annotations.length === 0 && session.traces.length === 0) {
    return ['Arm the picker with Alt+Shift+C, then click an element to record a defect'];
  }
```

and immediately before `return lines;` at the end of `helpLines`, add:

```ts
  if (session.traces.length > 0) {
    lines.push(...traceHelpLines());
  }
```

In `toToon`, add `traces` to the session block and a traces section. After the `['count', String(session.annotations.length)]` entry, add:

```ts
  if (session.traces.length > 0) {
    sessionEntries.push(['traces', String(session.traces.length)]);
  }
```

and after `const sections = [block('session', sessionEntries), annotations];` add:

```ts
  if (session.traces.length > 0) {
    sections.push(
      [`traces[${session.traces.length}]:`, ...session.traces.map(traceBlock)].join('\n'),
    );
  }
```

- [ ] **Step 5: Fix the existing `to-toon` fixtures**

`packages/core/src/export/to-toon.test.ts` builds sessions literally. `traces` now has a zod default but the fixtures are plain objects typed as `CaliperSession`, so TypeScript requires the field. Add `traces: [],` to every session literal in that file.

- [ ] **Step 6: Add a `toToon` regression test**

Append to `packages/core/src/export/to-toon.test.ts`:

```ts
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
          page: {url: 'https://app.test/orders', title: 'Orders', viewport: {width: 1440, height: 900, dpr: 2}},
          sources: {network: 'cdp', console: 'cdp', state: 'devtools-bridge'},
          summary: {steps: 7, consoleErrors: 2, failedRequests: 1, stateActions: 12},
          files: {trace: 'caliper-a3f0c1d2-t1.trace.json'},
        },
      ],
    });

    expect(output).toContain('traces: 1');
    expect(output).toContain('traces[1]:');
    expect(output).toContain('caliper trace <file>');
    expect(output).not.toContain('Arm the picker');
  });
});
```

- [ ] **Step 7: Export and run**

Add to `packages/core/src/index.ts`:

```ts
export * from './export/trace-toon';
```

Run: `pnpm --filter @caliper/core test`
Expected: PASS.

- [ ] **Step 8: Commit**

```bash
git add packages/core/src/export packages/core/src/index.ts
git commit -m "feat(core): render trace summaries in the TOON work list"
```

---

## Task 4: Scaffold `packages/recorder` with the ring buffer

**Files:**
- Create: `packages/recorder/package.json`, `packages/recorder/tsconfig.json`, `packages/recorder/vitest.config.ts`
- Create: `packages/recorder/src/index.ts`
- Create: `packages/recorder/src/ring-buffer.ts`
- Create: `packages/recorder/src/ring-buffer.test.ts`

**Interfaces:**
- Consumes: `@caliper/core` types.
- Produces: `createRingBuffer<T>(capacity: number): RingBuffer<T>` with `{push(item: T): void; setCapacity(next: number): void; drain(): T[]; readonly size: number}`. Every collector in Tasks 5–7 pushes into one of these.

- [ ] **Step 1: Create the package files**

`packages/recorder/package.json`:

```json
{
  "name": "@caliper/recorder",
  "version": "0.1.0",
  "type": "module",
  "main": "./src/index.ts",
  "types": "./src/index.ts",
  "exports": {
    ".": "./src/index.ts"
  },
  "scripts": {
    "test": "vitest run",
    "test:watch": "vitest"
  },
  "dependencies": {
    "@caliper/core": "workspace:*"
  }
}
```

`packages/recorder/tsconfig.json` — copy `packages/core/tsconfig.json` verbatim.

`packages/recorder/vitest.config.ts` — copy `packages/core/vitest.config.ts` verbatim.

`packages/recorder/src/index.ts`:

```ts
export * from './ring-buffer';
```

Run: `pnpm install`

- [ ] **Step 2: Write the failing test**

Create `packages/recorder/src/ring-buffer.test.ts`:

```ts
import {describe, expect, it} from 'vitest';
import {createRingBuffer} from './ring-buffer';

describe('createRingBuffer', () => {
  it('discards everything while capacity is zero', () => {
    const buffer = createRingBuffer<number>(0);
    buffer.push(1);
    buffer.push(2);
    expect(buffer.size).toBe(0);
    expect(buffer.drain()).toEqual([]);
  });

  it('keeps the newest items once capacity opens', () => {
    const buffer = createRingBuffer<number>(0);
    buffer.setCapacity(3);
    for (const value of [1, 2, 3, 4, 5]) buffer.push(value);
    expect(buffer.drain()).toEqual([3, 4, 5]);
  });

  it('empties on drain', () => {
    const buffer = createRingBuffer<number>(2);
    buffer.push(1);
    buffer.drain();
    expect(buffer.drain()).toEqual([]);
    expect(buffer.size).toBe(0);
  });

  it('trims immediately when capacity shrinks', () => {
    const buffer = createRingBuffer<number>(5);
    for (const value of [1, 2, 3, 4, 5]) buffer.push(value);
    buffer.setCapacity(2);
    expect(buffer.drain()).toEqual([4, 5]);
  });
});
```

- [ ] **Step 3: Run the test to verify it fails**

Run: `pnpm --filter @caliper/recorder test`
Expected: FAIL — `Cannot find module './ring-buffer'`.

- [ ] **Step 4: Implement**

Create `packages/recorder/src/ring-buffer.ts`:

```ts
export interface RingBuffer<T> {
  push(item: T): void;
  setCapacity(next: number): void;
  drain(): T[];
  readonly size: number;
}

// Capacity 0 is the resting state: the collectors are installed on every page from document_start
// (the devtools hook must exist before the app bootstraps), so until a trace actually starts every
// intercepted call must cost one push into nothing.
export const createRingBuffer = <T>(capacity: number): RingBuffer<T> => {
  let items: T[] = [];
  let limit = Math.max(0, capacity);

  const trim = (): void => {
    if (items.length > limit) items = items.slice(items.length - limit);
  };

  return {
    push(item: T): void {
      if (limit === 0) return;
      items.push(item);
      trim();
    },
    setCapacity(next: number): void {
      limit = Math.max(0, next);
      trim();
    },
    drain(): T[] {
      const drained = items;
      items = [];
      return drained;
    },
    get size(): number {
      return items.length;
    },
  };
};
```

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @caliper/recorder test`
Expected: PASS, 4 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/recorder pnpm-lock.yaml
git commit -m "feat(recorder): scaffold the package with a capacity-gated ring buffer"
```

---

## Task 5: Console and network collectors

**Files:**
- Create: `packages/recorder/src/console-collector.ts`, `packages/recorder/src/console-collector.test.ts`
- Create: `packages/recorder/src/network-collector.ts`, `packages/recorder/src/network-collector.test.ts`
- Modify: `packages/recorder/src/index.ts`

**Interfaces:**
- Consumes: `createRingBuffer` (Task 4), `TraceConsoleEntry` / `TraceNetworkEntry` (Task 2).
- Produces:
  - `patchConsole(target: ConsoleLike, sink: (entry: TraceConsoleEntry) => void, now: () => number): () => void`
  - `patchFetch(target: FetchHost, sink: (entry: TraceNetworkEntry) => void, now: () => number): () => void`
  Both return an uninstall function. `ConsoleLike` and `FetchHost` are structural so the tests inject fakes and the content script passes `window`.

- [ ] **Step 1: Write the failing console test**

Create `packages/recorder/src/console-collector.test.ts`:

```ts
import {describe, expect, it, vi} from 'vitest';
import type {TraceConsoleEntry} from '@caliper/core';
import {patchConsole} from './console-collector';

const host = () => ({
  log: vi.fn(),
  info: vi.fn(),
  warn: vi.fn(),
  error: vi.fn(),
  debug: vi.fn(),
});

describe('patchConsole', () => {
  it('records each level with a relative timestamp', () => {
    const entries: TraceConsoleEntry[] = [];
    const target = host();
    let clock = 0;
    patchConsole(target, (entry) => entries.push(entry), () => (clock += 100));

    target.warn('careful');
    target.error('boom');

    expect(entries).toEqual([
      {t: 100, level: 'warn', text: 'careful'},
      {t: 200, level: 'error', text: 'boom'},
    ]);
  });

  it('still calls through to the original console', () => {
    const target = host();
    const original = target.log;
    patchConsole(target, () => undefined, () => 0);
    target.log('hello');
    expect(original).toHaveBeenCalledWith('hello');
  });

  it('serialises non-string arguments and joins them', () => {
    const entries: TraceConsoleEntry[] = [];
    const target = host();
    patchConsole(target, (entry) => entries.push(entry), () => 0);
    target.log('count', {n: 2});
    expect(entries[0].text).toBe('count {"n":2}');
  });

  it('restores the originals on uninstall', () => {
    const target = host();
    const original = target.log;
    patchConsole(target, () => undefined, () => 0)();
    expect(target.log).toBe(original);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @caliper/recorder test console`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement the console collector**

Create `packages/recorder/src/console-collector.ts`:

```ts
import type {TraceConsoleEntry, TraceConsoleLevel} from '@caliper/core';

const LEVELS: readonly TraceConsoleLevel[] = ['log', 'info', 'warn', 'error', 'debug'];

export type ConsoleLike = Record<TraceConsoleLevel, (...args: unknown[]) => void>;

const serialise = (value: unknown): string => {
  if (typeof value === 'string') return value;
  if (value instanceof Error) return `${value.name}: ${value.message}`;
  try {
    return JSON.stringify(value) ?? String(value);
  } catch {
    // A circular or getter-throwing object must not take the page's console down with it.
    return String(value);
  }
};

export const patchConsole = (
  target: ConsoleLike,
  sink: (entry: TraceConsoleEntry) => void,
  now: () => number,
): (() => void) => {
  const originals = new Map<TraceConsoleLevel, (...args: unknown[]) => void>();

  for (const level of LEVELS) {
    const original = target[level];
    originals.set(level, original);
    target[level] = (...args: unknown[]): void => {
      sink({t: now(), level, text: args.map(serialise).join(' ')});
      original.apply(target, args);
    };
  }

  return () => {
    for (const [level, original] of originals) target[level] = original;
  };
};
```

- [ ] **Step 4: Write the failing network test**

Create `packages/recorder/src/network-collector.test.ts`:

```ts
import {describe, expect, it} from 'vitest';
import type {TraceNetworkEntry} from '@caliper/core';
import {patchFetch} from './network-collector';

describe('patchFetch', () => {
  it('records a successful request', async () => {
    const entries: TraceNetworkEntry[] = [];
    let clock = 0;
    const host = {
      fetch: async () => new Response('{"ok":true}', {status: 200}),
    };
    patchFetch(host, (entry) => entries.push(entry), () => (clock += 50));

    await host.fetch('https://api.test/orders', {method: 'POST'});

    expect(entries).toHaveLength(1);
    expect(entries[0]).toMatchObject({
      method: 'POST',
      url: 'https://api.test/orders',
      status: 200,
      failed: false,
    });
  });

  it('flags a non-2xx response as failed', async () => {
    const entries: TraceNetworkEntry[] = [];
    const host = {fetch: async () => new Response('nope', {status: 500})};
    patchFetch(host, (entry) => entries.push(entry), () => 0);

    await host.fetch('https://api.test/orders');

    expect(entries[0].failed).toBe(true);
    expect(entries[0].status).toBe(500);
  });

  it('records a thrown network error as status 0 and rethrows', async () => {
    const entries: TraceNetworkEntry[] = [];
    const host = {
      fetch: async () => {
        throw new TypeError('Failed to fetch');
      },
    };
    patchFetch(host, (entry) => entries.push(entry), () => 0);

    await expect(host.fetch('https://api.test/orders')).rejects.toThrow('Failed to fetch');
    expect(entries[0]).toMatchObject({status: 0, failed: true});
  });

  it('defaults the method to GET', async () => {
    const entries: TraceNetworkEntry[] = [];
    const host = {fetch: async () => new Response('', {status: 204})};
    patchFetch(host, (entry) => entries.push(entry), () => 0);

    await host.fetch('https://api.test/ping');

    expect(entries[0].method).toBe('GET');
  });

  it('restores the original fetch on uninstall', () => {
    const original = async () => new Response('');
    const host = {fetch: original};
    patchFetch(host, () => undefined, () => 0)();
    expect(host.fetch).toBe(original);
  });
});
```

- [ ] **Step 5: Run to verify it fails**

Run: `pnpm --filter @caliper/recorder test network`
Expected: FAIL — module not found.

- [ ] **Step 6: Implement the network collector**

Create `packages/recorder/src/network-collector.ts`:

```ts
import type {TraceNetworkEntry} from '@caliper/core';

export interface FetchHost {
  fetch: (input: string | URL | Request, init?: RequestInit) => Promise<Response>;
}

const OK_FLOOR = 200;
const OK_CEILING = 300;
const NETWORK_ERROR_STATUS = 0;

const urlOf = (input: string | URL | Request): string => {
  if (typeof input === 'string') return input;
  if (input instanceof URL) return input.href;
  return input.url;
};

const methodOf = (input: string | URL | Request, init?: RequestInit): string => {
  if (init?.method) return init.method.toUpperCase();
  if (typeof input !== 'string' && !(input instanceof URL)) return input.method.toUpperCase();
  return 'GET';
};

// The fallback collector (D2): it runs on every page but only reaches the trace when chrome.debugger
// could not attach. It deliberately does not read response bodies — cloning every response to buffer
// it would change the page's memory profile for a channel CDP usually supplies in full.
export const patchFetch = (
  target: FetchHost,
  sink: (entry: TraceNetworkEntry) => void,
  now: () => number,
): (() => void) => {
  const original = target.fetch;

  target.fetch = async (input: string | URL | Request, init?: RequestInit): Promise<Response> => {
    const t = now();
    const started = t;
    try {
      const response = await original.call(target, input, init);
      sink({
        t,
        method: methodOf(input, init),
        url: urlOf(input),
        status: response.status,
        durationMs: now() - started,
        failed: response.status < OK_FLOOR || response.status >= OK_CEILING,
      });
      return response;
    } catch (error) {
      sink({
        t,
        method: methodOf(input, init),
        url: urlOf(input),
        status: NETWORK_ERROR_STATUS,
        durationMs: now() - started,
        failed: true,
      });
      throw error;
    }
  };

  return () => {
    target.fetch = original;
  };
};
```

- [ ] **Step 7: Export and run**

Add to `packages/recorder/src/index.ts`:

```ts
export * from './console-collector';
export * from './network-collector';
```

Run: `pnpm --filter @caliper/recorder test`
Expected: PASS, 9 tests.

- [ ] **Step 8: Commit**

```bash
git add packages/recorder/src
git commit -m "feat(recorder): console and fetch fallback collectors"
```

---

## Task 6: Redux DevTools state bridge

**Files:**
- Create: `packages/recorder/src/state-bridge.ts`, `packages/recorder/src/state-bridge.test.ts`
- Modify: `packages/recorder/src/index.ts`

**Interfaces:**
- Consumes: `TraceStateEntry` (Task 2).
- Produces: `installStateBridge(host: DevtoolsHost, sink: (entry: TraceStateEntry) => void, now: () => number): StateBridge` where `StateBridge` is `{readonly source: TraceStateSource; snapshot(): unknown; uninstall(): void}`. `DevtoolsHost` is `{__REDUX_DEVTOOLS_EXTENSION__?: DevtoolsExtension}` — the content script passes `window`.

- [ ] **Step 1: Write the failing test**

Create `packages/recorder/src/state-bridge.test.ts`:

```ts
import {describe, expect, it, vi} from 'vitest';
import type {TraceStateEntry} from '@caliper/core';
import {installStateBridge, type DevtoolsHost} from './state-bridge';

describe('installStateBridge', () => {
  it('installs a shim when the page has no devtools hook', () => {
    const host: DevtoolsHost = {};
    const entries: TraceStateEntry[] = [];
    const bridge = installStateBridge(host, (entry) => entries.push(entry), () => 0);

    expect(bridge.source).toBe('devtools-bridge');
    expect(host.__REDUX_DEVTOOLS_EXTENSION__).toBeDefined();
  });

  it('records the action type and the latest state from a connected store', () => {
    const host: DevtoolsHost = {};
    const entries: TraceStateEntry[] = [];
    let clock = 0;
    const bridge = installStateBridge(host, (entry) => entries.push(entry), () => (clock += 10));

    const connection = host.__REDUX_DEVTOOLS_EXTENSION__!.connect({name: 'app'});
    connection.init({count: 0});
    connection.send({type: '[Orders] Load'}, {count: 1});

    expect(entries).toEqual([{t: 20, action: '[Orders] Load'}]);
    expect(bridge.snapshot()).toEqual({count: 1});
  });

  it('accepts a bare string action type', () => {
    const host: DevtoolsHost = {};
    const entries: TraceStateEntry[] = [];
    installStateBridge(host, (entry) => entries.push(entry), () => 0);

    host.__REDUX_DEVTOOLS_EXTENSION__!.connect().send('INCREMENT', {count: 1});

    expect(entries[0].action).toBe('INCREMENT');
  });

  it('wraps an existing hook instead of replacing it', () => {
    const realConnection = {init: vi.fn(), send: vi.fn(), subscribe: vi.fn(), unsubscribe: vi.fn()};
    const realConnect = vi.fn(() => realConnection);
    const host: DevtoolsHost = {__REDUX_DEVTOOLS_EXTENSION__: {connect: realConnect}};
    const entries: TraceStateEntry[] = [];
    installStateBridge(host, (entry) => entries.push(entry), () => 0);

    host.__REDUX_DEVTOOLS_EXTENSION__!.connect({name: 'app'}).send({type: 'PING'}, {});

    expect(realConnect).toHaveBeenCalledWith({name: 'app'});
    expect(realConnection.send).toHaveBeenCalled();
    expect(entries[0].action).toBe('PING');
  });

  it('restores the original hook on uninstall', () => {
    const real = {connect: vi.fn()};
    const host: DevtoolsHost = {__REDUX_DEVTOOLS_EXTENSION__: real};
    installStateBridge(host, () => undefined, () => 0).uninstall();
    expect(host.__REDUX_DEVTOOLS_EXTENSION__).toBe(real);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @caliper/recorder test state-bridge`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `packages/recorder/src/state-bridge.ts`:

```ts
import type {TraceStateEntry, TraceStateSource} from '@caliper/core';

interface DevtoolsConnection {
  init?: (state: unknown) => void;
  send: (action: unknown, state: unknown) => void;
  subscribe?: (listener: (message: unknown) => void) => () => void;
  unsubscribe?: () => void;
}

export interface DevtoolsExtension {
  connect: (options?: unknown) => DevtoolsConnection;
}

export interface DevtoolsHost {
  __REDUX_DEVTOOLS_EXTENSION__?: DevtoolsExtension;
}

export interface StateBridge {
  readonly source: TraceStateSource;
  snapshot: () => unknown;
  uninstall: () => void;
}

const actionType = (action: unknown): string => {
  if (typeof action === 'string') return action;
  if (typeof action === 'object' && action !== null) {
    const type: unknown = Reflect.get(action, 'type');
    if (typeof type === 'string') return type;
  }
  return 'unknown';
};

// NgRx, Redux and Zustand all probe this hook exactly once, during bootstrap — which is why the host
// script runs at document_start. When the real Redux DevTools extension is already present we wrap its
// connect() rather than replacing it: breaking a developer's devtools to record a trace is the worse
// outcome, so both receive every message.
export const installStateBridge = (
  host: DevtoolsHost,
  sink: (entry: TraceStateEntry) => void,
  now: () => number,
): StateBridge => {
  const original = host.__REDUX_DEVTOOLS_EXTENSION__;
  let latest: unknown = undefined;

  const wrap = (connection: DevtoolsConnection | undefined): DevtoolsConnection => ({
    init: (state: unknown): void => {
      latest = state;
      connection?.init?.(state);
    },
    send: (action: unknown, state: unknown): void => {
      latest = state;
      sink({t: now(), action: actionType(action)});
      connection?.send(action, state);
    },
    subscribe: (listener: (message: unknown) => void) => connection?.subscribe?.(listener) ?? (() => undefined),
    unsubscribe: () => connection?.unsubscribe?.(),
  });

  host.__REDUX_DEVTOOLS_EXTENSION__ = {
    connect: (options?: unknown): DevtoolsConnection => wrap(original?.connect(options)),
  };

  return {
    source: 'devtools-bridge',
    snapshot: () => latest,
    uninstall: () => {
      if (original) host.__REDUX_DEVTOOLS_EXTENSION__ = original;
      else delete host.__REDUX_DEVTOOLS_EXTENSION__;
    },
  };
};
```

- [ ] **Step 4: Export and run**

Add `export * from './state-bridge';` to `packages/recorder/src/index.ts`.

Run: `pnpm --filter @caliper/recorder test`
Expected: PASS, 14 tests.

- [ ] **Step 5: Commit**

```bash
git add packages/recorder/src
git commit -m "feat(recorder): Redux DevTools state bridge that wraps an existing hook"
```

---

## Task 7: Step derivation from DOM events

**Files:**
- Create: `packages/recorder/src/steps.ts`, `packages/recorder/src/steps.test.ts`
- Modify: `packages/recorder/src/index.ts`

**Interfaces:**
- Consumes: `TraceStep` (Task 2), `buildSelector` from `@caliper/core`.
- Produces: `describeStep(event: Event, t: number, selectorOf: (element: Element) => string): TraceStep | null`.

`selectorOf` is injected rather than importing `buildSelector` directly so the unit test stays free of the picker's DOM assumptions; the content script passes `buildSelector`.

- [ ] **Step 1: Write the failing test**

Create `packages/recorder/src/steps.test.ts`:

```ts
// @vitest-environment jsdom
import {describe, expect, it} from 'vitest';
import {describeStep} from './steps';

const selectorOf = (element: Element): string => element.tagName.toLowerCase();

describe('describeStep', () => {
  it('describes a click with its selector and trimmed label', () => {
    document.body.innerHTML = '<button>  Save order  </button>';
    const button = document.querySelector('button')!;
    const event = new MouseEvent('click', {bubbles: true});
    Object.defineProperty(event, 'target', {value: button});

    expect(describeStep(event, 1200, selectorOf)).toEqual({
      t: 1200,
      kind: 'click',
      selector: 'button',
      text: 'Save order',
    });
  });

  it('records that an input changed without recording what was typed', () => {
    document.body.innerHTML = '<input value="hunter2" />';
    const input = document.querySelector('input')!;
    const event = new Event('input', {bubbles: true});
    Object.defineProperty(event, 'target', {value: input});

    const step = describeStep(event, 900, selectorOf);
    expect(step).toEqual({t: 900, kind: 'input', selector: 'input', text: '7 chars'});
  });

  it('keeps only the navigational and submitting keys', () => {
    document.body.innerHTML = '<input />';
    const input = document.querySelector('input')!;
    const enter = new KeyboardEvent('keydown', {key: 'Enter', bubbles: true});
    Object.defineProperty(enter, 'target', {value: input});
    const letter = new KeyboardEvent('keydown', {key: 'a', bubbles: true});
    Object.defineProperty(letter, 'target', {value: input});

    expect(describeStep(enter, 10, selectorOf)).toMatchObject({kind: 'key', text: 'Enter'});
    expect(describeStep(letter, 20, selectorOf)).toBeNull();
  });

  it('ignores an event whose target is not an element', () => {
    const event = new Event('click');
    Object.defineProperty(event, 'target', {value: null});
    expect(describeStep(event, 0, selectorOf)).toBeNull();
  });

  it('ignores an unhandled event type', () => {
    document.body.innerHTML = '<div></div>';
    const event = new Event('mouseover', {bubbles: true});
    Object.defineProperty(event, 'target', {value: document.querySelector('div')});
    expect(describeStep(event, 0, selectorOf)).toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @caliper/recorder test steps`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement**

Create `packages/recorder/src/steps.ts`:

```ts
import type {TraceStep} from '@caliper/core';

const TEXT_LIMIT = 60;
// Only keys that move or submit are steps. Recording every keystroke would both bury the timeline and
// transcribe whatever the tester typed, which no debugging question needs.
const MEANINGFUL_KEYS = new Set(['Enter', 'Escape', 'Tab', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight']);

const label = (element: Element): string => {
  const text = (element.textContent ?? '').replace(/\s+/g, ' ').trim();
  return text.length > TEXT_LIMIT ? `${text.slice(0, TEXT_LIMIT)}…` : text;
};

// An input's step says that it changed and by how much, never what it now holds — a trace is attached to
// tickets, and field contents are the one channel where that is gratuitous.
const inputLabel = (element: Element): string => {
  const value: unknown = Reflect.get(element, 'value');
  return `${typeof value === 'string' ? value.length : 0} chars`;
};

export const describeStep = (
  event: Event,
  t: number,
  selectorOf: (element: Element) => string,
): TraceStep | null => {
  const {target} = event;
  if (!(target instanceof Element)) return null;

  if (event.type === 'click') {
    return {t, kind: 'click', selector: selectorOf(target), text: label(target)};
  }
  if (event.type === 'input' || event.type === 'change') {
    return {t, kind: 'input', selector: selectorOf(target), text: inputLabel(target)};
  }
  if (event.type === 'keydown' && event instanceof KeyboardEvent && MEANINGFUL_KEYS.has(event.key)) {
    return {t, kind: 'key', selector: selectorOf(target), text: event.key};
  }
  return null;
};

export const navigationStep = (t: number, url: string): TraceStep => ({t, kind: 'navigation', url});
```

- [ ] **Step 4: Enable jsdom for this package**

`packages/core/vitest.config.ts` already configures the workspace's vitest; confirm it sets `environment` per-file via the `@vitest-environment` pragma (the pragma at the top of the test file is enough with the default config). If the run fails with `document is not defined`, add to `packages/recorder/vitest.config.ts`:

```ts
import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {environmentMatchGlobs: [['**/steps.test.ts', 'jsdom']]},
});
```

`jsdom` is already a root devDependency.

- [ ] **Step 5: Export and run**

Add `export * from './steps';` to `packages/recorder/src/index.ts`.

Run: `pnpm --filter @caliper/recorder test`
Expected: PASS, 19 tests.

- [ ] **Step 6: Commit**

```bash
git add packages/recorder
git commit -m "feat(recorder): derive trace steps from DOM events"
```

---

## Task 8: Redaction and trace assembly

**Files:**
- Create: `packages/recorder/src/redact.ts`, `packages/recorder/src/redact.test.ts`
- Create: `packages/recorder/src/assemble.ts`, `packages/recorder/src/assemble.test.ts`
- Modify: `packages/recorder/src/index.ts`

**Interfaces:**
- Consumes: everything from Tasks 2 and 4–7.
- Produces:
  - `redactNetworkEntry(entry: TraceNetworkEntry, enabled: boolean): TraceNetworkEntry`
  - `assembleTrace(input: AssembleInput): {trace: CaliperTrace; detail: TraceDetail}`
  with `AssembleInput = {id, label, startedAt, durationMs, truncated, page, sources, steps, console, network, state, stateSnapshots, files, redactSecrets, maxStateDiffBytes}`.
  Task 12 (background lifecycle) is the only caller.

- [ ] **Step 1: Write the failing redaction test**

Create `packages/recorder/src/redact.test.ts`:

```ts
import {describe, expect, it} from 'vitest';
import type {TraceNetworkEntry} from '@caliper/core';
import {redactNetworkEntry} from './redact';

const entry: TraceNetworkEntry = {
  t: 10,
  method: 'POST',
  url: 'https://api.test/login',
  status: 200,
  durationMs: 40,
  failed: false,
  requestBody: '{"email":"a@b.c","password":"hunter2"}',
  headers: {Authorization: 'Bearer abc.def', 'Content-Type': 'application/json'},
};

describe('redactNetworkEntry', () => {
  it('returns the entry untouched when redaction is off', () => {
    expect(redactNetworkEntry(entry, false)).toBe(entry);
  });

  it('masks credential headers when redaction is on', () => {
    const redacted = redactNetworkEntry(entry, true);
    expect(redacted.headers).toEqual({Authorization: '[redacted]', 'Content-Type': 'application/json'});
  });

  it('masks secret-looking body fields when redaction is on', () => {
    const redacted = redactNetworkEntry(entry, true);
    expect(redacted.requestBody).toBe('{"email":"a@b.c","password":"[redacted]"}');
  });

  it('leaves a body it cannot parse alone', () => {
    const redacted = redactNetworkEntry({...entry, requestBody: 'not json'}, true);
    expect(redacted.requestBody).toBe('not json');
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `pnpm --filter @caliper/recorder test redact`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement redaction**

Create `packages/recorder/src/redact.ts`:

```ts
import type {TraceNetworkEntry} from '@caliper/core';

const SECRET_HEADER = /^(authorization|cookie|set-cookie|x-api-key)$/i;
const SECRET_FIELD = /(password|token|secret|authorization|api[-_]?key)/i;
const MASK = '[redacted]';

const maskHeaders = (headers: Record<string, string>): Record<string, string> =>
  Object.fromEntries(
    Object.entries(headers).map(([name, value]) => [name, SECRET_HEADER.test(name) ? MASK : value]),
  );

const maskValue = (value: unknown): unknown => {
  if (Array.isArray(value)) return value.map(maskValue);
  if (typeof value !== 'object' || value === null) return value;
  return Object.fromEntries(
    Object.entries(value).map(([key, nested]) => [key, SECRET_FIELD.test(key) ? MASK : maskValue(nested)]),
  );
};

const maskBody = (body: string): string => {
  try {
    return JSON.stringify(maskValue(JSON.parse(body)));
  } catch {
    // A form-encoded or binary body has no field structure to walk; masking it blindly would destroy
    // the very payload the developer needs, so it is left as recorded.
    return body;
  }
};

// Off by default (D8). The product decision is that an internal staging trace is more useful complete
// than sanitised; this exists so a team filing to a shared tracker can opt in.
export const redactNetworkEntry = (entry: TraceNetworkEntry, enabled: boolean): TraceNetworkEntry => {
  if (!enabled) return entry;
  return {
    ...entry,
    headers: entry.headers ? maskHeaders(entry.headers) : entry.headers,
    requestBody: entry.requestBody ? maskBody(entry.requestBody) : entry.requestBody,
    responseBody: entry.responseBody ? maskBody(entry.responseBody) : entry.responseBody,
  };
};
```

- [ ] **Step 4: Write the failing assembly test**

Create `packages/recorder/src/assemble.test.ts`:

```ts
import {describe, expect, it} from 'vitest';
import {assembleTrace, type AssembleInput} from './assemble';

const input = (overrides: Partial<AssembleInput> = {}): AssembleInput => ({
  id: 'a3f0c1d2-0000-4000-8000-000000000001',
  label: 'Save fails on second submit',
  startedAt: '2026-08-31T10:00:00.000Z',
  durationMs: 24_400,
  truncated: false,
  page: {url: 'https://app.test/orders', title: 'Orders', viewport: {width: 1440, height: 900, dpr: 2}},
  sources: {network: 'cdp', console: 'cdp', state: 'devtools-bridge'},
  steps: [{t: 100, kind: 'click', selector: 'button'}],
  console: [
    {t: 200, level: 'log', text: 'ok'},
    {t: 300, level: 'error', text: 'boom'},
  ],
  network: [
    {t: 400, method: 'GET', url: 'https://api.test/a', status: 200, durationMs: 20, failed: false},
    {t: 500, method: 'POST', url: 'https://api.test/b', status: 500, durationMs: 30, failed: true},
  ],
  state: [{t: 600, action: '[Orders] Load'}],
  stateSnapshots: {start: {count: 0}, end: {count: 1}},
  files: {trace: 'caliper-a3f0c1d2-t1.trace.json'},
  redactSecrets: false,
  maxStateDiffBytes: 2048,
  ...overrides,
});

describe('assembleTrace', () => {
  it('counts errors and failures into the summary', () => {
    const {trace} = assembleTrace(input());
    expect(trace.summary).toEqual({steps: 1, consoleErrors: 1, failedRequests: 1, stateActions: 1});
  });

  it('produces a detail carrying every channel', () => {
    const {detail} = assembleTrace(input());
    expect(detail.traceId).toBe('a3f0c1d2-0000-4000-8000-000000000001');
    expect(detail.network).toHaveLength(2);
    expect(detail.stateSnapshots.end).toEqual({count: 1});
  });

  it('applies redaction when asked', () => {
    const {detail} = assembleTrace(
      input({
        redactSecrets: true,
        network: [
          {
            t: 1,
            method: 'POST',
            url: 'https://api.test/login',
            status: 200,
            durationMs: 5,
            failed: false,
            headers: {Authorization: 'Bearer x'},
          },
        ],
      }),
    );
    expect(detail.network[0].headers).toEqual({Authorization: '[redacted]'});
  });

  it('drops a state diff that exceeds the cap but keeps the action', () => {
    const {detail} = assembleTrace(
      input({maxStateDiffBytes: 10, state: [{t: 1, action: '[Big] Load', diff: {payload: 'x'.repeat(500)}}]}),
    );
    expect(detail.state[0]).toEqual({t: 1, action: '[Big] Load'});
  });

  it('sorts every channel by time', () => {
    const {detail} = assembleTrace(
      input({steps: [{t: 900, kind: 'click'}, {t: 100, kind: 'click'}]}),
    );
    expect(detail.steps.map((step) => step.t)).toEqual([100, 900]);
  });

  it('emits a trace that satisfies the schema', async () => {
    const {caliperTraceSchema, traceDetailSchema} = await import('@caliper/core');
    const {trace, detail} = assembleTrace(input());
    expect(() => caliperTraceSchema.parse(trace)).not.toThrow();
    expect(() => traceDetailSchema.parse(detail)).not.toThrow();
  });
});
```

- [ ] **Step 5: Run to verify it fails**

Run: `pnpm --filter @caliper/recorder test assemble`
Expected: FAIL — module not found.

- [ ] **Step 6: Implement assembly**

Create `packages/recorder/src/assemble.ts`:

```ts
import type {
  CaliperTrace,
  Page,
  TraceConsoleEntry,
  TraceDetail,
  TraceFiles,
  TraceNetworkEntry,
  TraceSources,
  TraceStateEntry,
  TraceStep,
} from '@caliper/core';
import {redactNetworkEntry} from './redact';

export interface AssembleInput {
  id: string;
  label: string;
  startedAt: string;
  durationMs: number;
  truncated: boolean;
  page: Page;
  sources: TraceSources;
  steps: readonly TraceStep[];
  console: readonly TraceConsoleEntry[];
  network: readonly TraceNetworkEntry[];
  state: readonly TraceStateEntry[];
  stateSnapshots: {start?: unknown; end?: unknown};
  files: TraceFiles;
  redactSecrets: boolean;
  maxStateDiffBytes: number;
}

const byTime = <T extends {t: number}>(entries: readonly T[]): T[] =>
  [...entries].sort((left, right) => left.t - right.t);

const sizeOf = (value: unknown): number => {
  try {
    return JSON.stringify(value)?.length ?? 0;
  } catch {
    return Number.POSITIVE_INFINITY;
  }
};

// An action type is always worth keeping; its payload is worth keeping only while it stays small. A
// full NgRx payload per action would outweigh every other channel combined.
const capDiff = (entry: TraceStateEntry, maxBytes: number): TraceStateEntry => {
  if (entry.diff === undefined || entry.diff === null) return entry;
  if (sizeOf(entry.diff) <= maxBytes) return entry;
  const {diff: _dropped, ...rest} = entry;
  return rest;
};

export const assembleTrace = (input: AssembleInput): {trace: CaliperTrace; detail: TraceDetail} => {
  const steps = byTime(input.steps);
  const consoleEntries = byTime(input.console);
  const network = byTime(input.network).map((entry) => redactNetworkEntry(entry, input.redactSecrets));
  const state = byTime(input.state).map((entry) => capDiff(entry, input.maxStateDiffBytes));

  const trace: CaliperTrace = {
    id: input.id,
    label: input.label,
    startedAt: input.startedAt,
    durationMs: input.durationMs,
    truncated: input.truncated,
    page: input.page,
    sources: input.sources,
    summary: {
      steps: steps.length,
      consoleErrors: consoleEntries.filter((entry) => entry.level === 'error').length,
      failedRequests: network.filter((entry) => entry.failed).length,
      stateActions: state.length,
    },
    files: input.files,
  };

  const detail: TraceDetail = {
    traceId: input.id,
    schemaVersion: 2,
    steps,
    console: consoleEntries,
    network,
    state,
    stateSnapshots: input.stateSnapshots,
  };

  return {trace, detail};
};
```

- [ ] **Step 7: Export and run**

Add to `packages/recorder/src/index.ts`:

```ts
export * from './redact';
export * from './assemble';
```

Run: `pnpm --filter @caliper/recorder test`
Expected: PASS, 29 tests.

- [ ] **Step 8: Commit**

```bash
git add packages/recorder/src
git commit -m "feat(recorder): opt-in redaction and trace assembly with size caps"
```

---

## Task 9: Manifest permissions and the main-world collector

First extension task. From here, verification is manual in Chrome — note the exact steps and their expected observations.

**Files:**
- Modify: `apps/qa-extension/wxt.config.ts`
- Modify: `apps/qa-extension/package.json`
- Create: `apps/qa-extension/src/entrypoints/collector.content.ts`
- Modify: `apps/qa-extension/src/messaging/messages.ts`

**Interfaces:**
- Consumes: `@caliper/recorder` (Tasks 4–8), `buildSelector` from `@caliper/core`.
- Produces: the `window.postMessage` protocol between page and extension —
  `{source: 'caliper-collector', kind: 'ready' | 'batch'}` upward and
  `{source: 'caliper-host', kind: 'start' | 'stop'}` downward — plus the `TraceControlMessage`
  / `TraceBatchMessage` runtime messages consumed by Task 12.

- [ ] **Step 1: Add the dependencies and permissions**

In `apps/qa-extension/package.json`, add to `dependencies`:

```json
    "@caliper/recorder": "workspace:*",
    "rrweb": "^2.0.0-alpha.4"
```

Run: `pnpm install`

In `apps/qa-extension/wxt.config.ts`, extend `permissions` to:

```ts
    permissions: [
      'storage',
      'unlimitedStorage',
      'activeTab',
      'sidePanel',
      'scripting',
      'downloads',
      'offscreen',
      'tabCapture',
      'debugger',
      'webNavigation',
    ],
```

- [ ] **Step 2: Define the message contract**

In `apps/qa-extension/src/messaging/messages.ts`, add after `StoreOpMessage`:

```ts
import type {TraceConsoleEntry, TraceNetworkEntry, TraceStateEntry, TraceStep} from '@caliper/core';

export interface TraceBatch {
  steps: TraceStep[];
  console: TraceConsoleEntry[];
  network: TraceNetworkEntry[];
  state: TraceStateEntry[];
  replay: string[];
  stateSnapshot?: unknown;
}

// The collector ships accumulated events on an interval rather than per event: a chatty page would
// otherwise cross the page↔extension boundary thousands of times per trace.
export interface TraceBatchMessage {
  type: 'caliper/trace-batch';
  batch: TraceBatch;
}

export interface TraceStartMessage {
  type: 'caliper/trace-start';
  tabId: number;
  label: string;
}

export interface TraceStopMessage {
  type: 'caliper/trace-stop';
  tabId: number;
}

export interface TraceStatusMessage {
  type: 'caliper/trace-status';
  recording: boolean;
  startedAt: string | null;
  consoleErrors: number;
  failedRequests: number;
}
```

Add all four to the `CaliperMessage` union and to the `isCaliperMessage` type list.

- [ ] **Step 3: Write the collector**

Create `apps/qa-extension/src/entrypoints/collector.content.ts`:

```ts
import {buildSelector} from '@caliper/core';
import type {TraceConsoleEntry, TraceNetworkEntry, TraceStateEntry, TraceStep} from '@caliper/core';
import {
  createRingBuffer,
  describeStep,
  installStateBridge,
  navigationStep,
  patchConsole,
  patchFetch,
} from '@caliper/recorder';

const HOST_SOURCE = 'caliper-host';
const COLLECTOR_SOURCE = 'caliper-collector';
const FLUSH_INTERVAL_MS = 1000;
const CHANNEL_CAPACITY = 5000;
const REPLAY_CAPACITY = 20_000;

export default defineContentScript({
  matches: ['<all_urls>'],
  world: 'MAIN',
  runAt: 'document_start',
  main() {
    const steps = createRingBuffer<TraceStep>(0);
    const consoleEntries = createRingBuffer<TraceConsoleEntry>(0);
    const network = createRingBuffer<TraceNetworkEntry>(0);
    const state = createRingBuffer<TraceStateEntry>(0);
    const replay = createRingBuffer<string>(0);

    let startedAt: number | null = null;
    let flushTimer: number | null = null;
    let stopReplay: (() => void) | null = null;

    const now = (): number => (startedAt === null ? 0 : Math.round(performance.now() - startedAt));

    // The devtools shim must exist before the app bootstraps, so it is installed on load and never on
    // Start — by Start it is already far too late for NgRx to have found it.
    const bridge = installStateBridge(window, (entry) => state.push(entry), now);
    patchConsole(console, (entry) => consoleEntries.push(entry), now);
    patchFetch(window, (entry) => network.push(entry), now);

    const onEvent = (event: Event): void => {
      const step = describeStep(event, now(), buildSelector);
      if (step) steps.push(step);
    };

    for (const type of ['click', 'input', 'change', 'keydown']) {
      window.addEventListener(type, onEvent, {capture: true, passive: true});
    }

    const flush = (): void => {
      const batch = {
        steps: steps.drain(),
        console: consoleEntries.drain(),
        network: network.drain(),
        state: state.drain(),
        replay: replay.drain(),
        stateSnapshot: bridge.snapshot(),
      };
      window.postMessage({source: COLLECTOR_SOURCE, kind: 'batch', batch}, '*');
    };

    const start = async (): Promise<void> => {
      startedAt = performance.now();
      steps.setCapacity(CHANNEL_CAPACITY);
      consoleEntries.setCapacity(CHANNEL_CAPACITY);
      network.setCapacity(CHANNEL_CAPACITY);
      state.setCapacity(CHANNEL_CAPACITY);
      replay.setCapacity(REPLAY_CAPACITY);
      steps.push(navigationStep(0, location.href));

      const {record} = await import('rrweb');
      stopReplay =
        record({emit: (event) => replay.push(JSON.stringify(event))}) ?? null;

      flushTimer = window.setInterval(flush, FLUSH_INTERVAL_MS);
    };

    const stop = (): void => {
      stopReplay?.();
      stopReplay = null;
      if (flushTimer !== null) window.clearInterval(flushTimer);
      flushTimer = null;
      flush();
      for (const buffer of [steps, consoleEntries, network, state, replay]) buffer.setCapacity(0);
      startedAt = null;
    };

    window.addEventListener('message', (event: MessageEvent) => {
      if (event.source !== window) return;
      const data: unknown = event.data;
      if (typeof data !== 'object' || data === null) return;
      if (Reflect.get(data, 'source') !== HOST_SOURCE) return;

      const kind = Reflect.get(data, 'kind');
      if (kind === 'start') void start();
      if (kind === 'stop') stop();
    });

    window.postMessage({source: COLLECTOR_SOURCE, kind: 'ready'}, '*');
  },
});
```

- [ ] **Step 4: Relay the protocol from the isolated content script**

In `apps/qa-extension/src/entrypoints/content.ts`, inside its `main()`, add the bridge in both directions:

```ts
    window.addEventListener('message', (event: MessageEvent) => {
      if (event.source !== window) return;
      const data: unknown = event.data;
      if (typeof data !== 'object' || data === null) return;
      if (Reflect.get(data, 'source') !== 'caliper-collector') return;
      if (Reflect.get(data, 'kind') !== 'batch') return;
      void chrome.runtime.sendMessage({type: 'caliper/trace-batch', batch: Reflect.get(data, 'batch')});
    });

    chrome.runtime.onMessage.addListener((message: unknown) => {
      if (typeof message !== 'object' || message === null) return;
      const type = Reflect.get(message, 'type');
      if (type === 'caliper/collector-start') {
        window.postMessage({source: 'caliper-host', kind: 'start'}, '*');
      }
      if (type === 'caliper/collector-stop') {
        window.postMessage({source: 'caliper-host', kind: 'stop'}, '*');
      }
    });
```

- [ ] **Step 5: Build and verify the collector loads**

Run: `pnpm --filter @caliper/qa-extension build`
Expected: build succeeds; `.output/chrome-mv3/manifest.json` lists `offscreen`, `tabCapture`, `debugger`, `webNavigation`, and a content script with `"world": "MAIN"` and `"run_at": "document_start"`.

Load `.output/chrome-mv3` via `chrome://extensions` → Load unpacked. Open any page, open DevTools → Console, and run:

```js
window.__REDUX_DEVTOOLS_EXTENSION__
```

Expected: an object with a `connect` function — the shim is installed. On a page where the real Redux DevTools extension is also active, confirm that extension still shows the store (D4).

- [ ] **Step 6: Commit**

```bash
git add apps/qa-extension pnpm-lock.yaml
git commit -m "feat(extension): main-world trace collector and its message protocol"
```

---

## Task 10: Offscreen video recorder

**Files:**
- Create: `apps/qa-extension/src/entrypoints/offscreen/index.html`
- Create: `apps/qa-extension/src/entrypoints/offscreen/main.ts`
- Create: `apps/qa-extension/src/trace/video.ts`

**Interfaces:**
- Consumes: `chrome.tabCapture`, `chrome.offscreen`.
- Produces: `startVideo(tabId: number, options: VideoOptions): Promise<void>` and `stopVideo(): Promise<Blob | null>` exported from `src/trace/video.ts`, called by Task 12. `VideoOptions = {maxDurationMs: number; videoBitrate: number}`.

- [ ] **Step 1: Create the offscreen document**

`apps/qa-extension/src/entrypoints/offscreen/index.html`:

```html
<!doctype html>
<html>
  <head>
    <meta charset="utf-8" />
    <title>Caliper QA recorder</title>
  </head>
  <body>
    <script type="module" src="./main.ts"></script>
  </body>
</html>
```

- [ ] **Step 2: Implement the recorder**

`apps/qa-extension/src/entrypoints/offscreen/main.ts`:

```ts
const MAX_WIDTH = 1280;
const MAX_FPS = 12;
const CHUNK_MS = 1000;
const PREFERRED = 'video/webm;codecs=vp9';
const FALLBACK = 'video/webm;codecs=vp8';

interface StartPayload {
  streamId: string;
  maxDurationMs: number;
  videoBitrate: number;
}

let recorder: MediaRecorder | null = null;
let chunks: Blob[] = [];
let maxChunks = 0;
let truncated = false;

const mimeType = (): string => (MediaRecorder.isTypeSupported(PREFERRED) ? PREFERRED : FALLBACK);

const start = async ({streamId, maxDurationMs, videoBitrate}: StartPayload): Promise<void> => {
  const stream = await navigator.mediaDevices.getUserMedia({
    video: {
      mandatory: {chromeMediaSource: 'tab', chromeMediaSourceId: streamId},
    },
  } as unknown as MediaStreamConstraints);

  // The budget is met at the encoder, not afterwards: MV3 has no cheap transcoder, so the stream is
  // constrained before MediaRecorder ever sees it.
  const [track] = stream.getVideoTracks();
  await track
    .applyConstraints({width: {max: MAX_WIDTH}, frameRate: {max: MAX_FPS}})
    .catch(() => undefined);

  chunks = [];
  truncated = false;
  maxChunks = Math.ceil(maxDurationMs / CHUNK_MS);

  recorder = new MediaRecorder(stream, {mimeType: mimeType(), videoBitsPerSecond: videoBitrate});
  recorder.ondataavailable = (event: BlobEvent) => {
    if (event.data.size === 0) return;
    chunks.push(event.data);
    // A forgotten recording drops its oldest seconds rather than growing without limit. Dropping the
    // head of a WebM makes the remainder unplayable in some players, which is why the trace says so.
    if (chunks.length > maxChunks) {
      chunks = chunks.slice(chunks.length - maxChunks);
      truncated = true;
    }
  };
  recorder.start(CHUNK_MS);
};

const stop = (): Promise<{dataUrl: string | null; truncated: boolean}> =>
  new Promise((resolve) => {
    const active = recorder;
    if (!active) {
      resolve({dataUrl: null, truncated: false});
      return;
    }
    active.onstop = () => {
      for (const track of active.stream.getTracks()) track.stop();
      const blob = new Blob(chunks, {type: mimeType()});
      const reader = new FileReader();
      reader.onload = () => resolve({dataUrl: String(reader.result), truncated});
      reader.onerror = () => resolve({dataUrl: null, truncated});
      reader.readAsDataURL(blob);
      recorder = null;
      chunks = [];
    };
    active.stop();
  });

chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
  if (typeof message !== 'object' || message === null) return false;
  const type = Reflect.get(message, 'type');

  if (type === 'caliper/offscreen-start') {
    const payload = Reflect.get(message, 'payload');
    void start(payload as StartPayload)
      .then(() => sendResponse(true))
      .catch(() => sendResponse(false));
    return true;
  }
  if (type === 'caliper/offscreen-stop') {
    void stop().then(sendResponse);
    return true;
  }
  return false;
});
```

- [ ] **Step 3: Implement the background-side facade**

`apps/qa-extension/src/trace/video.ts`:

```ts
const OFFSCREEN_PATH = 'offscreen.html';

export interface VideoOptions {
  maxDurationMs: number;
  videoBitrate: number;
}

export interface VideoResult {
  dataUrl: string | null;
  truncated: boolean;
}

const ensureDocument = async (): Promise<void> => {
  const existing = await chrome.offscreen.hasDocument();
  if (existing) return;
  await chrome.offscreen.createDocument({
    url: OFFSCREEN_PATH,
    reasons: [chrome.offscreen.Reason.USER_MEDIA],
    justification: 'Encode the tab capture for a QA bug trace.',
  });
};

export const startVideo = async (tabId: number, options: VideoOptions): Promise<boolean> => {
  await ensureDocument();
  const streamId = await chrome.tabCapture.getMediaStreamId({targetTabId: tabId});
  const started: unknown = await chrome.runtime.sendMessage({
    type: 'caliper/offscreen-start',
    payload: {streamId, ...options},
  });
  return started === true;
};

export const stopVideo = async (): Promise<VideoResult> => {
  const hasDocument = await chrome.offscreen.hasDocument();
  if (!hasDocument) return {dataUrl: null, truncated: false};
  const result: unknown = await chrome.runtime.sendMessage({type: 'caliper/offscreen-stop'});
  await chrome.offscreen.closeDocument().catch(() => undefined);
  if (typeof result === 'object' && result !== null && 'dataUrl' in result) {
    return result as VideoResult;
  }
  return {dataUrl: null, truncated: false};
};
```

- [ ] **Step 4: Manual verification of the budget**

Build and reload the extension. In the background service worker console (`chrome://extensions` → service worker), run:

```js
const {startVideo, stopVideo} = await import('./chunks/video.js');
```

If the chunk path differs, instead verify after Task 12 wires the UI. Either way the acceptance check is: record ~30 seconds of a normal app page, then confirm the resulting blob is **under 1.2 MB**. Log it with:

```js
const {dataUrl} = await stopVideo();
console.log('bytes', Math.round(dataUrl.length * 0.75));
```

Expected: roughly 700 KB – 1.1 MB for 30 s. If it lands far above, lower `videoBitrate` in the options default (Task 15) rather than post-processing.

- [ ] **Step 5: Commit**

```bash
git add apps/qa-extension/src/entrypoints/offscreen apps/qa-extension/src/trace
git commit -m "feat(extension): offscreen tab-capture recorder under a fixed bitrate budget"
```

---

## Task 11: CDP collector with graceful fallback

**Files:**
- Create: `apps/qa-extension/src/trace/cdp.ts`

**Interfaces:**
- Consumes: `TraceConsoleEntry`, `TraceNetworkEntry` from `@caliper/core`.
- Produces: `attachCdp(tabId: number, now: () => number): Promise<CdpCollector | null>` where
  `CdpCollector = {console: TraceConsoleEntry[]; network: TraceNetworkEntry[]; detach(): Promise<void>}`.
  Returning `null` is the normal "DevTools is open" path, not an error (D2).

- [ ] **Step 1: Implement**

Create `apps/qa-extension/src/trace/cdp.ts`:

```ts
import type {TraceConsoleEntry, TraceConsoleLevel, TraceNetworkEntry} from '@caliper/core';

const PROTOCOL_VERSION = '1.3';
const OK_FLOOR = 200;
const OK_CEILING = 300;
const BODY_LIMIT = 20_000;
const MAX_BODIES = 40;

export interface CdpCollector {
  readonly console: TraceConsoleEntry[];
  readonly network: TraceNetworkEntry[];
  detach: () => Promise<void>;
}

interface PendingRequest {
  t: number;
  method: string;
  url: string;
  requestBody?: string;
  headers?: Record<string, string>;
}

const LEVEL_BY_CDP_TYPE: Record<string, TraceConsoleLevel> = {
  log: 'log',
  info: 'info',
  warning: 'warn',
  error: 'error',
  debug: 'debug',
};

const asRecord = (value: unknown): Record<string, unknown> =>
  typeof value === 'object' && value !== null ? (value as Record<string, unknown>) : {};

const text = (value: unknown): string => (typeof value === 'string' ? value : '');

const numberOf = (value: unknown): number => (typeof value === 'number' ? value : 0);

// Attaching fails when DevTools already owns the tab — the common case for a QA engineer, which is why
// a null return is a routine outcome the caller degrades from rather than an error it reports.
export const attachCdp = async (tabId: number, now: () => number): Promise<CdpCollector | null> => {
  const target: chrome.debugger.Debuggee = {tabId};
  try {
    await chrome.debugger.attach(target, PROTOCOL_VERSION);
  } catch {
    return null;
  }

  const consoleEntries: TraceConsoleEntry[] = [];
  const network: TraceNetworkEntry[] = [];
  const pending = new Map<string, PendingRequest>();
  const finishedIds: string[] = [];

  const onEvent = (source: chrome.debugger.Debuggee, method: string, params?: object): void => {
    if (source.tabId !== tabId) return;
    const data = asRecord(params);

    if (method === 'Runtime.consoleAPICalled') {
      const args = Array.isArray(data.args) ? data.args : [];
      consoleEntries.push({
        t: now(),
        level: LEVEL_BY_CDP_TYPE[text(data.type)] ?? 'log',
        text: args.map((arg) => text(asRecord(arg).value) || text(asRecord(arg).description)).join(' '),
      });
      return;
    }

    if (method === 'Runtime.exceptionThrown') {
      const details = asRecord(asRecord(data.exceptionDetails).exception);
      consoleEntries.push({
        t: now(),
        level: 'error',
        text: text(details.description) || text(asRecord(data.exceptionDetails).text),
        stack: JSON.stringify(asRecord(data.exceptionDetails).stackTrace ?? null),
      });
      return;
    }

    if (method === 'Network.requestWillBeSent') {
      const request = asRecord(data.request);
      pending.set(text(data.requestId), {
        t: now(),
        method: text(request.method) || 'GET',
        url: text(request.url),
        requestBody: typeof request.postData === 'string' ? request.postData : undefined,
        headers: asRecord(request.headers) as Record<string, string>,
      });
      return;
    }

    if (method === 'Network.responseReceived') {
      const requestId = text(data.requestId);
      const start = pending.get(requestId);
      if (!start) return;
      const response = asRecord(data.response);
      const status = numberOf(response.status);
      network.push({
        t: start.t,
        method: start.method,
        url: start.url,
        status,
        durationMs: now() - start.t,
        failed: status < OK_FLOOR || status >= OK_CEILING,
        requestBody: start.requestBody,
        headers: start.headers,
      });
      finishedIds.push(requestId);
      return;
    }

    if (method === 'Network.loadingFailed') {
      const start = pending.get(text(data.requestId));
      if (!start) return;
      network.push({
        t: start.t,
        method: start.method,
        url: start.url,
        status: 0,
        durationMs: now() - start.t,
        failed: true,
        requestBody: start.requestBody,
        headers: start.headers,
      });
    }
  };

  chrome.debugger.onEvent.addListener(onEvent);
  await chrome.debugger.sendCommand(target, 'Runtime.enable');
  await chrome.debugger.sendCommand(target, 'Network.enable');

  // Bodies are collected once, at Stop, and only for the entries most likely to explain a defect —
  // streaming every body during the trace would compete with the app being tested.
  const collectBodies = async (): Promise<void> => {
    const wanted = network
      .map((entry, index) => ({entry, index, requestId: finishedIds[index]}))
      .filter((item) => item.requestId !== undefined)
      .sort((left, right) => Number(right.entry.failed) - Number(left.entry.failed))
      .slice(0, MAX_BODIES);

    for (const item of wanted) {
      try {
        const result: unknown = await chrome.debugger.sendCommand(target, 'Network.getResponseBody', {
          requestId: item.requestId,
        });
        const body = text(asRecord(result).body);
        if (body) item.entry.responseBody = body.slice(0, BODY_LIMIT);
      } catch {
        // A body evicted from the CDP buffer is simply absent; the entry keeps its status and timing.
      }
    }
  };

  return {
    console: consoleEntries,
    network,
    detach: async () => {
      await collectBodies();
      chrome.debugger.onEvent.removeListener(onEvent);
      await chrome.debugger.detach(target).catch(() => undefined);
    },
  };
};
```

- [ ] **Step 2: Manual verification of both paths**

Build and reload. After Task 12 wires Start/Stop, run a trace twice on the same page:

1. **DevTools closed** → expect the finished trace's `sources.network` to be `cdp`, and the yellow "Caliper QA started debugging this browser" infobar visible while recording.
2. **DevTools open on that tab** → expect no infobar, recording still completes, `sources.network` is `fallback`.

Record the observed values; they are the acceptance criterion for D2.

- [ ] **Step 3: Commit**

```bash
git add apps/qa-extension/src/trace/cdp.ts
git commit -m "feat(extension): CDP network and console collector with fallback signalling"
```

---

## Task 12: Background trace lifecycle

**Files:**
- Create: `apps/qa-extension/src/trace/blob-store.ts`
- Create: `apps/qa-extension/src/trace/lifecycle.ts`
- Modify: `apps/qa-extension/src/entrypoints/background.ts`
- Modify: `apps/qa-extension/src/sinks/store.ts`

**Interfaces:**
- Consumes: `assembleTrace` (Task 8), `startVideo`/`stopVideo` (Task 10), `attachCdp` (Task 11), the message contract (Task 9).
- Produces: `startTrace(tabId: number, label: string): Promise<void>`, `stopTrace(tabId: number): Promise<void>`, `traceStatus(): TraceStatusMessage`, `ingestBatch(batch: TraceBatch): void` from `lifecycle.ts`; `putBlob(key, dataUrl)` / `getBlob(key)` / `deleteBlob(key)` from `blob-store.ts`. The sidepanel (Task 13) drives them via messages; the export (Task 14) reads blobs.

- [ ] **Step 1: Implement the blob store**

Create `apps/qa-extension/src/trace/blob-store.ts`:

```ts
const DB_NAME = 'caliper-trace';
const STORE = 'blobs';
const VERSION = 1;

// Traces carry megabytes of video and replay. chrome.storage.local holds the manifest and the small
// screenshot data-URLs, but stuffing a WebM in beside them makes every manifest read pay for it.
const open = (): Promise<IDBDatabase> =>
  new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, VERSION);
    request.onupgradeneeded = () => {
      if (!request.result.objectStoreNames.contains(STORE)) request.result.createObjectStore(STORE);
    };
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });

const withStore = async <T>(
  mode: IDBTransactionMode,
  run: (store: IDBObjectStore) => IDBRequest<T>,
): Promise<T> => {
  const db = await open();
  return new Promise<T>((resolve, reject) => {
    const request = run(db.transaction(STORE, mode).objectStore(STORE));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
};

export const putBlob = (key: string, dataUrl: string): Promise<IDBValidKey> =>
  withStore('readwrite', (store) => store.put(dataUrl, key));

export const getBlob = (key: string): Promise<string | undefined> =>
  withStore('readonly', (store) => store.get(key) as IDBRequest<string | undefined>);

export const deleteBlob = (key: string): Promise<undefined> =>
  withStore('readwrite', (store) => store.delete(key) as IDBRequest<undefined>);
```

- [ ] **Step 2: Implement the lifecycle**

Create `apps/qa-extension/src/trace/lifecycle.ts`:

```ts
import type {CaliperTrace, Page, TraceSources} from '@caliper/core';
import {assembleTrace} from '@caliper/recorder';
import type {TraceBatch, TraceStatusMessage} from '../messaging/messages';
import {runOp} from '../sinks/store';
import {attachCdp, type CdpCollector} from './cdp';
import {putBlob} from './blob-store';
import {startVideo, stopVideo} from './video';
import {readTraceOptions} from './options';

const ID_LENGTH = 8;
const MAX_STATE_DIFF_BYTES = 2048;

interface ActiveTrace {
  id: string;
  tabId: number;
  label: string;
  startedAt: string;
  startedAtMs: number;
  page: Page;
  cdp: CdpCollector | null;
  batches: TraceBatch[];
  stateStart: unknown;
}

let active: ActiveTrace | null = null;

const pageOf = async (tabId: number): Promise<Page> => {
  const tab = await chrome.tabs.get(tabId);
  return {
    url: tab.url ?? '',
    title: tab.title ?? '',
    viewport: {width: tab.width ?? 0, height: tab.height ?? 0, dpr: 1},
  };
};

const merge = (batches: readonly TraceBatch[]) => ({
  steps: batches.flatMap((batch) => batch.steps),
  console: batches.flatMap((batch) => batch.console),
  network: batches.flatMap((batch) => batch.network),
  state: batches.flatMap((batch) => batch.state),
  replay: batches.flatMap((batch) => batch.replay),
});

export const traceStatus = (): TraceStatusMessage => {
  if (!active) {
    return {type: 'caliper/trace-status', recording: false, startedAt: null, consoleErrors: 0, failedRequests: 0};
  }
  const merged = merge(active.batches);
  const consoleEntries = active.cdp ? active.cdp.console : merged.console;
  const network = active.cdp ? active.cdp.network : merged.network;
  return {
    type: 'caliper/trace-status',
    recording: true,
    startedAt: active.startedAt,
    consoleErrors: consoleEntries.filter((entry) => entry.level === 'error').length,
    failedRequests: network.filter((entry) => entry.failed).length,
  };
};

export const ingestBatch = (batch: TraceBatch): void => {
  if (!active) return;
  if (active.stateStart === undefined) active.stateStart = batch.stateSnapshot;
  active.batches.push(batch);
};

export const startTrace = async (tabId: number, label: string): Promise<void> => {
  if (active) return;
  const options = await readTraceOptions();
  const startedAtMs = Date.now();
  const id = crypto.randomUUID();

  active = {
    id,
    tabId,
    label,
    startedAt: new Date(startedAtMs).toISOString(),
    startedAtMs,
    page: await pageOf(tabId),
    cdp: options.enableCdp ? await attachCdp(tabId, () => Date.now() - startedAtMs) : null,
    batches: [],
    stateStart: undefined,
  };

  await startVideo(tabId, {maxDurationMs: options.maxDurationMs, videoBitrate: options.videoBitrate});
  await chrome.tabs.sendMessage(tabId, {type: 'caliper/collector-start'}).catch(() => undefined);
};

export const stopTrace = async (tabId: number): Promise<void> => {
  const current = active;
  if (!current || current.tabId !== tabId) return;
  active = null;

  await chrome.tabs.sendMessage(tabId, {type: 'caliper/collector-stop'}).catch(() => undefined);
  await current.cdp?.detach();
  const video = await stopVideo();
  const options = await readTraceOptions();

  const merged = merge(current.batches);
  const short = current.id.slice(0, ID_LENGTH);
  const base = `caliper-${short}`;
  const sources: TraceSources = {
    network: current.cdp ? 'cdp' : 'fallback',
    console: current.cdp ? 'cdp' : 'fallback',
    state: merged.state.length > 0 ? 'devtools-bridge' : 'none',
  };

  const {trace, detail} = assembleTrace({
    id: current.id,
    label: current.label,
    startedAt: current.startedAt,
    durationMs: Date.now() - current.startedAtMs,
    truncated: video.truncated,
    page: current.page,
    sources,
    steps: merged.steps,
    console: current.cdp ? current.cdp.console : merged.console,
    network: current.cdp ? current.cdp.network : merged.network,
    state: merged.state,
    stateSnapshots: {
      start: current.stateStart,
      end: current.batches[current.batches.length - 1]?.stateSnapshot,
    },
    files: {
      trace: `${base}.trace.json`,
      replay: merged.replay.length > 0 ? `${base}.replay.ndjson.gz` : undefined,
      video: video.dataUrl ? `${base}.webm` : undefined,
    },
    redactSecrets: options.redactSecrets,
    maxStateDiffBytes: MAX_STATE_DIFF_BYTES,
  });

  await putBlob(`${current.id}:detail`, JSON.stringify(detail));
  if (merged.replay.length > 0) await putBlob(`${current.id}:replay`, merged.replay.join('\n'));
  if (video.dataUrl) await putBlob(`${current.id}:video`, video.dataUrl);

  await runOp({kind: 'pushTrace', trace});
};

export const activeTraceTabId = (): number | null => active?.tabId ?? null;

export type {CaliperTrace};
```

- [ ] **Step 3: Add the options reader**

Create `apps/qa-extension/src/trace/options.ts`:

```ts
const KEY = 'caliper.traceOptions';

export interface TraceOptions {
  redactSecrets: boolean;
  maxDurationMs: number;
  videoBitrate: number;
  enableCdp: boolean;
}

// Redaction stays off unless the team turns it on — the recorded trace is deliberately complete by
// default (D8). Every other default encodes the ~1 MB / 30 s budget.
export const DEFAULT_TRACE_OPTIONS: TraceOptions = {
  redactSecrets: false,
  maxDurationMs: 120_000,
  videoBitrate: 250_000,
  enableCdp: true,
};

export const readTraceOptions = async (): Promise<TraceOptions> => {
  const raw: unknown = (await chrome.storage.local.get(KEY))[KEY];
  if (typeof raw !== 'object' || raw === null) return DEFAULT_TRACE_OPTIONS;
  return {...DEFAULT_TRACE_OPTIONS, ...raw};
};

export const writeTraceOptions = (options: TraceOptions): Promise<void> =>
  chrome.storage.local.set({[KEY]: options});
```

- [ ] **Step 4: Add the store op**

In `apps/qa-extension/src/messaging/messages.ts`, extend `StoreOp` with:

```ts
  | {kind: 'pushTrace'; trace: CaliperTrace}
  | {kind: 'removeTrace'; id: string}
```

importing `CaliperTrace` from `@caliper/core`.

In `apps/qa-extension/src/sinks/store.ts`, add `traces: []` to `emptySession()` and handle both ops in `mutateSession`:

```ts
    case 'pushTrace':
      return {...session, schemaVersion: 2, traces: [...session.traces, op.trace]};
    case 'removeTrace':
      return {...session, traces: session.traces.filter((item) => item.id !== op.id)};
```

In `chromeStorageSink`, add `pushTrace: (trace: CaliperTrace) => dispatch({kind: 'pushTrace', trace})` and `removeTrace: (id: string) => dispatch({kind: 'removeTrace', id})` to the `MultiSessionSink` interface and the object.

- [ ] **Step 5: Wire the background**

In `apps/qa-extension/src/entrypoints/background.ts`, import the lifecycle and handle the new messages inside `chrome.runtime.onMessage.addListener`, before the final `return false;`:

```ts
    if (message.type === 'caliper/trace-start') {
      void startTrace(message.tabId, message.label).then(() => sendResponse(true));
      return true;
    }

    if (message.type === 'caliper/trace-stop') {
      void stopTrace(message.tabId).then(() => sendResponse(true));
      return true;
    }

    if (message.type === 'caliper/trace-batch') {
      ingestBatch(message.batch);
      sendResponse(true);
      return true;
    }

    if (message.type === 'caliper/trace-status') {
      sendResponse(traceStatus());
      return true;
    }
```

Add the navigation handler at the end of `defineBackground`, so a trace survives a page change:

```ts
  // A trace belongs to the tab, not the page: the collector is re-injected at document_start on the new
  // document, so it is told to resume into the same trace instead of a new one being started.
  chrome.webNavigation.onCommitted.addListener(({tabId, frameId}) => {
    if (frameId !== 0 || activeTraceTabId() !== tabId) return;
    void chrome.tabs.sendMessage(tabId, {type: 'caliper/collector-start'}).catch(() => undefined);
  });
```

- [ ] **Step 6: Manual verification**

Build, reload, open the side panel on a test app. From the side panel's devtools console:

```js
const tabId = (await chrome.tabs.query({active: true, currentWindow: true}))[0].id;
await chrome.runtime.sendMessage({type: 'caliper/trace-start', tabId, label: 'smoke'});
// click around the app, trigger a failing request
await chrome.runtime.sendMessage({type: 'caliper/trace-stop', tabId});
const store = (await chrome.storage.local.get('caliper.store'))['caliper.store'];
console.log(store.sessions.at(-1).traces);
```

Expected: one trace with `schemaVersion: 2` on the session, non-zero `summary.steps`, `files.trace` set, and `sources` reflecting whether DevTools was open.

- [ ] **Step 7: Commit**

```bash
git add apps/qa-extension/src
git commit -m "feat(extension): background trace lifecycle with IndexedDB blob storage"
```

---

## Task 13: Side-panel recording UI

**Files:**
- Create: `apps/qa-extension/src/entrypoints/sidepanel/RecordBar.tsx`
- Create: `apps/qa-extension/src/entrypoints/sidepanel/TraceCard.tsx`
- Modify: `apps/qa-extension/src/entrypoints/sidepanel/App.tsx`
- Modify: `apps/qa-extension/src/entrypoints/sidepanel/sidepanel.css`

**Interfaces:**
- Consumes: the trace messages (Task 9), `CaliperTrace` (Task 2), `getBlob` (Task 12).
- Produces: no exports beyond the two components.

- [ ] **Step 1: Build `RecordBar`**

Create `apps/qa-extension/src/entrypoints/sidepanel/RecordBar.tsx`:

```tsx
import {useEffect, useState} from 'preact/hooks';
import type {TraceStatusMessage} from '../../messaging/messages';

const POLL_MS = 1000;
const MS_PER_SECOND = 1000;
const SECONDS_PER_MINUTE = 60;

const elapsed = (startedAt: string | null): string => {
  if (!startedAt) return '0:00';
  const total = Math.floor((Date.now() - Date.parse(startedAt)) / MS_PER_SECOND);
  const minutes = Math.floor(total / SECONDS_PER_MINUTE);
  const seconds = total % SECONDS_PER_MINUTE;
  return `${minutes}:${String(seconds).padStart(2, '0')}`;
};

const IDLE: TraceStatusMessage = {
  type: 'caliper/trace-status',
  recording: false,
  startedAt: null,
  consoleErrors: 0,
  failedRequests: 0,
};

interface Props {
  tabId: number | null;
}

export const RecordBar = ({tabId}: Props) => {
  const [status, setStatus] = useState<TraceStatusMessage>(IDLE);
  const [, setTick] = useState(0);

  useEffect(() => {
    const poll = window.setInterval(() => {
      void chrome.runtime.sendMessage({type: 'caliper/trace-status'}).then((next: unknown) => {
        if (next && typeof next === 'object' && 'recording' in next) setStatus(next as TraceStatusMessage);
      });
      setTick((value) => value + 1);
    }, POLL_MS);
    return () => window.clearInterval(poll);
  }, []);

  const start = (): void => {
    if (tabId === null) return;
    const label = window.prompt('What are you reproducing?')?.trim();
    if (!label) return;
    void chrome.runtime.sendMessage({type: 'caliper/trace-start', tabId, label});
  };

  const stop = (): void => {
    if (tabId === null) return;
    void chrome.runtime.sendMessage({type: 'caliper/trace-stop', tabId});
  };

  if (!status.recording) {
    return (
      <button class="record record--idle" onClick={start} disabled={tabId === null}>
        <span class="record__dot" /> Start trace
      </button>
    );
  }

  return (
    <div class="record record--live">
      <button class="record__stop" onClick={stop}>
        ■ Stop
      </button>
      <span class="record__timer">{elapsed(status.startedAt)}</span>
      <span class="record__counts">
        {status.consoleErrors} err · {status.failedRequests} failed
      </span>
    </div>
  );
};
```

- [ ] **Step 2: Build `TraceCard`**

Create `apps/qa-extension/src/entrypoints/sidepanel/TraceCard.tsx`:

```tsx
import {useEffect, useState} from 'preact/hooks';
import type {CaliperTrace} from '@caliper/core';
import {getBlob} from '../../trace/blob-store';

const MS_PER_SECOND = 1000;

interface Props {
  trace: CaliperTrace;
  onRemove: (id: string) => void;
}

export const TraceCard = ({trace, onRemove}: Props) => {
  const [video, setVideo] = useState<string | null>(null);

  useEffect(() => {
    void getBlob(`${trace.id}:video`).then((dataUrl) => setVideo(dataUrl ?? null));
  }, [trace.id]);

  return (
    <article class="trace">
      <header class="trace__head">
        <span class="trace__label">{trace.label}</span>
        <span class="trace__duration">{(trace.durationMs / MS_PER_SECOND).toFixed(1)}s</span>
        <button class="trace__remove" onClick={() => onRemove(trace.id)} aria-label="Delete trace">
          ×
        </button>
      </header>

      {video ? <video class="trace__video" src={video} controls muted /> : null}

      <ul class="trace__chips">
        <li>{trace.summary.steps} steps</li>
        <li>{trace.summary.consoleErrors} console errors</li>
        <li>{trace.summary.failedRequests} failed requests</li>
        <li>{trace.summary.stateActions} state actions</li>
      </ul>

      {trace.sources.network === 'fallback' ? (
        <p class="trace__note">Network captured without CDP — bodies may be missing.</p>
      ) : null}
    </article>
  );
};
```

- [ ] **Step 3: Mount both in `App.tsx`**

In `apps/qa-extension/src/entrypoints/sidepanel/App.tsx`:

- import `RecordBar` and `TraceCard`;
- render `<RecordBar tabId={tabId} />` directly below `<TitleBar …/>`, using the tab id the panel already resolves for its picker messages;
- render the trace cards above the defect cards:

```tsx
      {session.traces.map((trace) => (
        <TraceCard key={trace.id} trace={trace} onRemove={(id) => void chromeStorageSink.removeTrace(id)} />
      ))}
```

- [ ] **Step 4: Style the new elements**

Append to `apps/qa-extension/src/entrypoints/sidepanel/sidepanel.css`, matching the file's existing custom-property palette (read the top of the file and reuse its variables rather than introducing new colour literals):

```css
.record { display: flex; align-items: center; gap: 8px; width: 100%; }
.record--idle { justify-content: center; padding: 8px; cursor: pointer; }
.record__dot { width: 8px; height: 8px; border-radius: 50%; background: currentColor; }
.record--live { justify-content: space-between; padding: 8px; }
.record__timer { font-variant-numeric: tabular-nums; }
.record__counts { opacity: 0.75; }
.trace { display: grid; gap: 8px; padding: 12px; }
.trace__head { display: flex; align-items: center; gap: 8px; }
.trace__label { flex: 1; font-weight: 600; }
.trace__video { width: 100%; border-radius: 4px; }
.trace__chips { display: flex; flex-wrap: wrap; gap: 6px; margin: 0; padding: 0; list-style: none; }
.trace__chips li { padding: 2px 6px; border-radius: 4px; font-size: 11px; }
.trace__note { margin: 0; font-size: 11px; opacity: 0.75; }
```

- [ ] **Step 5: Manual verification**

Build, reload, open the panel. Expected:

1. `Start trace` visible and enabled.
2. Clicking it prompts for a label; after accepting, the bar becomes the live strip with a ticking timer.
3. Triggering a console error in the page increments the `err` counter within a second.
4. `Stop` produces a trace card with a playable video and the four chips.
5. `×` removes the card and it does not return after closing and reopening the panel.

- [ ] **Step 6: Commit**

```bash
git add apps/qa-extension/src/entrypoints/sidepanel
git commit -m "feat(extension): side-panel record bar and trace card"
```

---

## Task 14: Export traces to the zip and to Jira

**Files:**
- Modify: `apps/qa-extension/src/export/export-session.ts`
- Modify: `apps/qa-extension/src/jira/send-to-jira.ts`

**Interfaces:**
- Consumes: `getBlob` (Task 12), `CaliperTrace` (Task 2).
- Produces: `downloadSessionArchive` and `buildJiraManifest` keep their signatures; `sendSessionToJira` gains no parameters. `traceFileEntries(session)` is a new internal helper shared by both.

- [ ] **Step 1: Extend the archive**

In `apps/qa-extension/src/export/export-session.ts`, add the imports and helper:

```ts
import {gzipSync} from 'fflate';
import {getBlob} from '../trace/blob-store';
```

```ts
interface TraceFileEntry {
  filename: string;
  bytes: Uint8Array;
}

// The three artifacts a trace publishes. The detail file is the agent's; the replay is its zoom-in
// source; the video is the human's. They are siblings, never inlined into the manifest — a WebM in a
// JSON asset map is what D5 exists to prevent.
const traceFileEntries = async (session: CaliperSession): Promise<TraceFileEntry[]> => {
  const entries: TraceFileEntry[] = [];

  for (const trace of session.traces) {
    const detail = await getBlob(`${trace.id}:detail`);
    if (detail) entries.push({filename: trace.files.trace, bytes: encode(detail)});

    if (trace.files.replay) {
      const replay = await getBlob(`${trace.id}:replay`);
      if (replay) entries.push({filename: trace.files.replay, bytes: gzipSync(encode(replay))});
    }

    if (trace.files.video) {
      const video = await getBlob(`${trace.id}:video`);
      if (video) entries.push({filename: trace.files.video, bytes: await toBytes(video)});
    }
  }

  return entries;
};
```

In `downloadSessionArchive`, before building the manifest, add:

```ts
  for (const entry of await traceFileEntries(session)) {
    files[entry.filename] = entry.bytes;
  }
```

`buildJiraManifest` already strips `assets`; it needs no change — `traces` carries filenames only. Export the helper so the Jira sender can reuse it:

```ts
export {traceFileEntries};
```

- [ ] **Step 2: Upload trace files to Jira**

In `apps/qa-extension/src/jira/send-to-jira.ts`, import the helper and upload the files alongside the manifest:

```ts
import {buildJiraManifest, traceFileEntries} from '../export/export-session';
```

Add above `sendSessionToJira`:

```ts
const uploadTraceFiles = async (session: CaliperSession, issueKey: string): Promise<void> => {
  for (const entry of await traceFileEntries(session)) {
    await uploadAttachment(issueKey, entry.filename, new Blob([entry.bytes]));
  }
};
```

and call it inside `sendSessionToJira`, immediately after `await uploadManifest(session, issueKey);`:

```ts
  await uploadTraceFiles(session, issueKey);
```

- [ ] **Step 3: Manual verification**

1. Record a trace, then use Download from the panel. Expected: the zip contains `session.json`, `session.toon`, and `caliper-<id8>.trace.json`, `.replay.ndjson.gz`, `.webm`. Open `session.json` and confirm `schemaVersion: 2` and a `traces` array whose `files` names match the zip entries exactly.
2. Send the same session to a Jira test issue. Expected: four attachments (manifest + three trace files), and the manifest's filenames resolve against them.

- [ ] **Step 4: Commit**

```bash
git add apps/qa-extension/src/export apps/qa-extension/src/jira
git commit -m "feat(extension): publish trace files to the zip and to Jira"
```

---

## Task 15: Options page and the privacy note

**Files:**
- Modify: `apps/qa-extension/src/entrypoints/options/App.tsx`
- Modify: `PRIVACY.md`

**Interfaces:**
- Consumes: `readTraceOptions` / `writeTraceOptions` / `DEFAULT_TRACE_OPTIONS` (Task 12).
- Produces: nothing.

- [ ] **Step 1: Add the controls**

In `apps/qa-extension/src/entrypoints/options/App.tsx`, follow the file's existing form pattern and add a **Bug traces** section with four controls bound to `TraceOptions`:

- `redactSecrets` — checkbox, label `Mask credentials in recorded network traffic`, help text `Off by default: a trace is recorded complete. Turn this on when traces go to a tracker other people can read.`
- `maxDurationMs` — number input in seconds (store `value * 1000`), label `Maximum trace length (seconds)`, default `120`
- `videoBitrate` — number input in kbps (store `value * 1000`), label `Video bitrate (kbps)`, default `250`
- `enableCdp` — checkbox, label `Use the debugger API for richer network capture`, help text `Gives response bodies and stack traces. Chrome shows a debugging banner while recording, and it cannot attach while DevTools is open — Caliper falls back automatically.`

Load with `readTraceOptions()` on mount and persist with `writeTraceOptions()` on change.

- [ ] **Step 2: Document what a trace contains**

In `PRIVACY.md`, add a `## Bug traces` section stating plainly:

- what a trace records — user steps, a DOM replay, console output, network requests including headers and bodies, store action names, and a video of the tab;
- that **by default nothing is masked**, so a trace can contain bearer tokens and session cookies from the environment under test;
- that `Mask credentials in recorded network traffic` in the options turns masking on;
- that traces are stored locally in the browser and leave the machine only when the user exports a zip or sends to Jira.

- [ ] **Step 3: Manual verification**

Open the options page. Expected: the four controls render, `Mask credentials` is unchecked, changing any value and reloading the page keeps the change.

- [ ] **Step 4: Commit**

```bash
git add apps/qa-extension/src/entrypoints/options PRIVACY.md
git commit -m "feat(extension): trace options and the privacy note for recorded traffic"
```

---

## Task 16: Test runner and `caliper trace` slicing

`apps/ask` has no test runner today. This task adds one, then builds the first tested unit on it.

**Files:**
- Create: `apps/ask/vitest.config.ts`
- Modify: `apps/ask/package.json`
- Create: `apps/ask/src/trace/slice.ts`, `apps/ask/src/trace/slice.test.ts`

**Interfaces:**
- Consumes: `traceDetailSchema`, `CaliperTrace` (Task 2).
- Produces: `sliceTrace(detail: TraceDetail, filter: TraceFilter): string` where
  `TraceFilter = {channels: ReadonlySet<'steps' | 'console' | 'network' | 'state'>; aroundMs: number | null; windowMs: number}`.
  Task 18 wires it to the CLI.

- [ ] **Step 1: Add the runner**

Create `apps/ask/vitest.config.ts`:

```ts
import {defineConfig} from 'vitest/config';

export default defineConfig({
  test: {include: ['src/**/*.test.ts']},
});
```

In `apps/ask/package.json`, add to `scripts`:

```json
    "test": "vitest run",
```

and to `devDependencies`:

```json
    "vitest": "^2.1.0",
```

Run: `pnpm install`

- [ ] **Step 2: Write the failing test**

Create `apps/ask/src/trace/slice.test.ts`:

```ts
import {describe, expect, it} from 'vitest';
import type {TraceDetail} from '@caliper/core';
import {sliceTrace} from './slice';

const detail: TraceDetail = {
  traceId: 'a3f0c1d2-0000-4000-8000-000000000001',
  schemaVersion: 2,
  steps: [
    {t: 1000, kind: 'click', selector: 'button.save', text: 'Save'},
    {t: 12_400, kind: 'click', selector: 'button.save', text: 'Save'},
  ],
  console: [{t: 12_500, level: 'error', text: 'TypeError: order is undefined'}],
  network: [
    {t: 1100, method: 'POST', url: 'https://api.test/orders', status: 201, durationMs: 90, failed: false},
    {t: 12_450, method: 'POST', url: 'https://api.test/orders', status: 500, durationMs: 120, failed: true},
  ],
  state: [{t: 12_460, action: '[Orders] Save Failure'}],
  stateSnapshots: {},
};

const all = new Set(['steps', 'console', 'network', 'state'] as const);

describe('sliceTrace', () => {
  it('prints every channel by default', () => {
    const output = sliceTrace(detail, {channels: all, aroundMs: null, windowMs: 2000});
    expect(output).toContain('steps[2]');
    expect(output).toContain('console[1]');
    expect(output).toContain('network[2]');
    expect(output).toContain('state[1]');
  });

  it('prints only the requested channel', () => {
    const output = sliceTrace(detail, {channels: new Set(['network']), aroundMs: null, windowMs: 2000});
    expect(output).toContain('network[2]');
    expect(output).not.toContain('steps[');
  });

  it('windows every channel around a timestamp', () => {
    const output = sliceTrace(detail, {channels: all, aroundMs: 12_400, windowMs: 2000});
    expect(output).toContain('steps[1]');
    expect(output).toContain('12500');
    expect(output).not.toContain('button.save 1000');
    expect(output).toContain('network[1]');
  });

  it('marks a failed request', () => {
    const output = sliceTrace(detail, {channels: new Set(['network']), aroundMs: null, windowMs: 2000});
    expect(output).toContain('FAILED');
  });

  it('says so when a window catches nothing', () => {
    const output = sliceTrace(detail, {channels: all, aroundMs: 90_000, windowMs: 1000});
    expect(output).toContain('nothing recorded in this window');
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm --filter @dendiem/caliper test`
Expected: FAIL — `Cannot find module './slice'`.

- [ ] **Step 4: Implement**

Create `apps/ask/src/trace/slice.ts`:

```ts
import type {TraceDetail} from '@caliper/core';

export type TraceChannel = 'steps' | 'console' | 'network' | 'state';

export interface TraceFilter {
  channels: ReadonlySet<TraceChannel>;
  aroundMs: number | null;
  windowMs: number;
}

const inWindow = (t: number, filter: TraceFilter): boolean =>
  filter.aroundMs === null || Math.abs(t - filter.aroundMs) <= filter.windowMs;

const section = (name: string, lines: readonly string[]): string =>
  [`${name}[${lines.length}]:`, ...lines.map((line) => `  ${line}`)].join('\n');

const truncate = (value: string, limit: number): string =>
  value.length > limit ? `${value.slice(0, limit)}…` : value;

const BODY_PREVIEW = 400;

// The zoom-in half of D9: pull prints the summary, this prints the slice the summary pointed at. Both
// exist so a trace's bodies never enter the context wholesale.
export const sliceTrace = (detail: TraceDetail, filter: TraceFilter): string => {
  const sections: string[] = [];
  let total = 0;

  if (filter.channels.has('steps')) {
    const lines = detail.steps
      .filter((step) => inWindow(step.t, filter))
      .map((step) => `${step.t} ${step.kind} ${step.selector ?? step.url ?? ''} ${step.text ?? ''}`.trimEnd());
    total += lines.length;
    sections.push(section('steps', lines));
  }

  if (filter.channels.has('console')) {
    const lines = detail.console
      .filter((entry) => inWindow(entry.t, filter))
      .map((entry) => `${entry.t} ${entry.level} ${entry.text}`);
    total += lines.length;
    sections.push(section('console', lines));
  }

  if (filter.channels.has('network')) {
    const lines = detail.network
      .filter((entry) => inWindow(entry.t, filter))
      .map((entry) => {
        const head = `${entry.t} ${entry.method} ${entry.url} ${entry.status}${entry.failed ? ' FAILED' : ''} ${entry.durationMs}ms`;
        const body = entry.responseBody ? `\n    body: ${truncate(entry.responseBody, BODY_PREVIEW)}` : '';
        return `${head}${body}`;
      });
    total += lines.length;
    sections.push(section('network', lines));
  }

  if (filter.channels.has('state')) {
    const lines = detail.state
      .filter((entry) => inWindow(entry.t, filter))
      .map((entry) => `${entry.t} ${entry.action}`);
    total += lines.length;
    sections.push(section('state', lines));
  }

  if (total === 0) {
    return `${sections.join('\n\n')}\n\nnothing recorded in this window`;
  }
  return sections.join('\n\n');
};
```

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @dendiem/caliper test`
Expected: PASS, 5 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/ask/vitest.config.ts apps/ask/package.json apps/ask/src/trace pnpm-lock.yaml
git commit -m "feat(ask): add a test runner and the trace slicing reader"
```

---

## Task 17: `caliper read` for the offline zip path

**Files:**
- Create: `apps/ask/src/trace/read-archive.ts`, `apps/ask/src/trace/read-archive.test.ts`
- Modify: `apps/ask/package.json`

**Interfaces:**
- Consumes: `caliperSessionSchema`, `toToon` (Tasks 2–3).
- Produces: `readArchive(path: string): Promise<string>` — returns the same TOON `pullSession` returns.

- [ ] **Step 1: Add the unzip dependency**

In `apps/ask/package.json`, add to `dependencies`:

```json
    "fflate": "^0.8.3"
```

Run: `pnpm install`

- [ ] **Step 2: Write the failing test**

Create `apps/ask/src/trace/read-archive.test.ts`:

```ts
import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {describe, expect, it} from 'vitest';
import {zipSync, strToU8} from 'fflate';
import {readArchive} from './read-archive';

const session = {
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
      page: {url: 'https://app.test/orders', title: 'Orders', viewport: {width: 1440, height: 900, dpr: 2}},
      sources: {network: 'cdp', console: 'cdp', state: 'devtools-bridge'},
      summary: {steps: 7, consoleErrors: 2, failedRequests: 1, stateActions: 12},
      files: {trace: 'caliper-a3f0c1d2.trace.json'},
    },
  ],
};

describe('readArchive', () => {
  it('reads a session out of a zip and prints its TOON', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'caliper-'));
    const archive = zipSync({
      'caliper-a3f0c1d2/session.json': strToU8(JSON.stringify(session)),
      'caliper-a3f0c1d2/caliper-a3f0c1d2.trace.json': strToU8('{"traceId":"x"}'),
    });
    const zipPath = join(dir, 'caliper.zip');
    writeFileSync(zipPath, archive);

    const output = await readArchive(zipPath);

    expect(output).toContain('traces[1]:');
    expect(output).toContain('Save fails on second submit');
  });

  it('reads an unpacked folder', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'caliper-'));
    writeFileSync(join(dir, 'session.json'), JSON.stringify(session));

    expect(await readArchive(dir)).toContain('traces[1]:');
  });

  it('explains itself when there is no session file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'caliper-'));
    await expect(readArchive(dir)).rejects.toThrow(/No Caliper session/);
  });
});
```

- [ ] **Step 3: Run to verify it fails**

Run: `pnpm --filter @dendiem/caliper test read-archive`
Expected: FAIL — module not found.

- [ ] **Step 4: Implement**

Create `apps/ask/src/trace/read-archive.ts`:

```ts
import {mkdirSync, readFileSync, readdirSync, statSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {caliperSessionSchema, toToon} from '@caliper/core';
import {unzipSync} from 'fflate';

const SESSION_FILE = /(^|\/)(caliper-.*\.)?session\.json$/;
const ID_SHORT = 8;

const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

const fromZip = (path: string): {files: Record<string, Uint8Array>; sessionKey: string} => {
  const files = unzipSync(new Uint8Array(readFileSync(path)));
  const sessionKey = Object.keys(files).find((name) => SESSION_FILE.test(name));
  if (!sessionKey) {
    throw new Error(
      `No Caliper session in ${path}: expected a session.json inside the archive. ` +
        'Ask QA to re-export with Download from the Caliper QA panel.',
    );
  }
  return {files, sessionKey};
};

const fromDirectory = (path: string): {files: Record<string, Uint8Array>; sessionKey: string} => {
  const files: Record<string, Uint8Array> = {};
  for (const name of readdirSync(path)) {
    const full = join(path, name);
    if (statSync(full).isFile()) files[name] = new Uint8Array(readFileSync(full));
  }
  const sessionKey = Object.keys(files).find((name) => SESSION_FILE.test(name));
  if (!sessionKey) {
    throw new Error(
      `No Caliper session in ${path}: expected a session.json in that folder. ` +
        'Point caliper read at the unpacked caliper-<id>/ folder or at the zip itself.',
    );
  }
  return {files, sessionKey};
};

// The offline half of the two delivery paths: QA hands over a zip directly, and the agent reads it
// through the same TOON entry point `caliper pull` produces from a ticket.
export const readArchive = async (path: string): Promise<string> => {
  const isDirectory = statSync(path).isDirectory();
  const {files, sessionKey} = isDirectory ? fromDirectory(path) : fromZip(path);

  const session = caliperSessionSchema.parse(JSON.parse(decode(files[sessionKey])));

  if (session.traces.length > 0) {
    // Trace detail files are materialised beside the screenshots so `caliper trace` has a path to open,
    // exactly as `caliper pull` leaves them.
    const short = session.id.slice(0, ID_SHORT);
    const outDir = join(process.cwd(), '.caliper', short);
    mkdirSync(outDir, {recursive: true});

    for (const [name, bytes] of Object.entries(files)) {
      const base = name.split('/').pop();
      if (!base || base === 'session.json' || base === 'session.toon') continue;
      writeFileSync(join(outDir, base), bytes);
    }

    for (const trace of session.traces) {
      trace.files.trace = `.caliper/${short}/${trace.files.trace}`;
      if (trace.files.replay) trace.files.replay = `.caliper/${short}/${trace.files.replay}`;
      if (trace.files.video) trace.files.video = `.caliper/${short}/${trace.files.video}`;
    }
  }

  return toToon(session);
};
```

- [ ] **Step 5: Run the tests**

Run: `pnpm --filter @dendiem/caliper test`
Expected: PASS, 8 tests.

- [ ] **Step 6: Commit**

```bash
git add apps/ask/src/trace apps/ask/package.json pnpm-lock.yaml
git commit -m "feat(ask): caliper read for the offline zip hand-off"
```

---

## Task 18: `caliper pull` v2 and the two new CLI commands

**Files:**
- Modify: `apps/ask/src/jira/pull.ts`
- Modify: `apps/ask/src/cli.ts`

**Interfaces:**
- Consumes: `readArchive` (Task 17), `sliceTrace` (Task 16), `traceBlock` (Task 3).
- Produces: the `read` and `trace` commands; `pullSession` keeps its signature.

- [ ] **Step 1: Materialise trace files in `pull`**

In `apps/ask/src/jira/pull.ts`, add beside `materializeScreenshots`:

```ts
// Every trace artifact the manifest names is fetched into .caliper/<id8>/ and the manifest is rewritten
// to those local paths, so `caliper trace <path>` works straight from the printed summary.
const materializeTraces = async (
  session: CaliperSession,
  attachments: readonly Attachment[],
  creds: JiraCreds,
): Promise<void> => {
  if (session.traces.length === 0) return;

  const short = session.id.slice(0, ID_SHORT);
  const dir = join(process.cwd(), '.caliper', short);
  mkdirSync(dir, {recursive: true});

  for (const trace of session.traces) {
    for (const key of ['trace', 'replay', 'video'] as const) {
      const filename = trace.files[key];
      if (!filename) continue;

      const match = newest(attachments.filter((item) => item.filename === filename));
      if (!match) {
        if (key === 'trace') continue;
        delete trace.files[key];
        continue;
      }

      const response = await fetchContent(creds, match.content);
      writeFileSync(join(dir, filename), Buffer.from(await response.arrayBuffer()));
      trace.files[key] = `.caliper/${short}/${filename}`;
    }
  }
};
```

and call it in `pullSession`, right after `await materializeScreenshots(session, attachments, creds);`:

```ts
  await materializeTraces(session, attachments, creds);
```

Also widen the "not a Caliper ticket" error so it names traces:

```ts
      `No Caliper session found on ${key}: expected a caliper-*.session.json attachment ` +
        '(added when QA uses "Send to Jira" from the Caliper QA extension, for marks or bug traces). ' +
        'This ticket has none.',
```

- [ ] **Step 2: Announce the ticket's composition**

Still in `pullSession`, replace `return toToon(session);` with:

```ts
  const marks = session.annotations.length;
  const traces = session.traces.length;
  const composition = [
    `${marks} mark${marks === 1 ? '' : 's'}`,
    `${traces} trace${traces === 1 ? '' : 's'}`,
  ].join(', ');

  return `${key}: ${composition}\n\n${toToon(session)}`;
```

- [ ] **Step 3: Add the commands to the CLI**

In `apps/ask/src/cli.ts`:

- extend `type Command` with `'read'` and `'trace'`;
- extend `isKnownCommand` with both;
- add `const READ_FLAGS = ['--help', '-h'];` and
  `const TRACE_FLAGS = ['--network', '--console', '--state', '--steps', '--around', '--help', '-h'];`
  and return them from `flagsForCommand`;
- allow a positional for both by changing the positional guard from
  `parsed.command === 'pull'` to
  `(parsed.command === 'pull' || parsed.command === 'read' || parsed.command === 'trace')`;
- add `channels: string[]` and `around: string | null` to `ParsedArgs` (initialised to `[]` and `null`) and parse them in the flag loop:

```ts
    if (flag === '--network' || flag === '--console' || flag === '--state' || flag === '--steps') {
      parsed.channels.push(flag.slice(2));
      continue;
    }
    if (flag === '--around') {
      const value = rest[index + 1];
      if (value === undefined) throw new UsageError('--around requires a value, e.g. --around 12.4s');
      parsed.around = value;
      index += 1;
      continue;
    }
```

- add the two help texts and register them in `helpForCommand`:

```ts
const readHelp = (): string =>
  [
    'caliper read — read a Caliper QA export handed to you directly (zip or unpacked folder)',
    '',
    'Usage:',
    '  caliper read <path-to-zip|folder>',
    '',
    'Prints the same TOON work list as caliper pull, and materialises any trace files under',
    '.caliper/<id>/ so caliper trace can open them. Use this when QA sent you the archive instead of',
    'filing it to a ticket. No Jira credentials are needed.',
  ].join('\n');

const traceHelp = (): string =>
  [
    'caliper trace — print one bug trace, or a slice of it',
    '',
    'Usage:',
    '  caliper trace <path-to-trace.json> [--steps] [--console] [--network] [--state] [--around <t>]',
    '',
    'With no channel flags every channel is printed. Combine flags to narrow it. --around takes a',
    'timestamp from the trace (e.g. 12400, 12.4s) and keeps ±2s of every channel around it — use it',
    'to read the moment a step, error or failed request points at instead of the whole recording.',
    '',
    'The .webm beside a trace is for humans; it carries nothing this command does not.',
  ].join('\n');
```

- add the runners:

```ts
const AROUND_WINDOW_MS = 2000;
const MS_PER_SECOND = 1000;

const parseTimestamp = (raw: string): number => {
  const seconds = raw.match(/^(\d+(?:\.\d+)?)s$/);
  if (seconds) return Math.round(Number(seconds[1]) * MS_PER_SECOND);
  const value = Number(raw);
  if (Number.isFinite(value)) return value;
  throw new UsageError(`Invalid --around "${raw}": expected milliseconds (12400) or seconds (12.4s).`);
};

const runRead = async (args: ParsedArgs): Promise<void> => {
  if (args.positional === null) {
    throw new UsageError('caliper read requires a path, e.g. caliper read ./caliper-a3f0c1d2.zip');
  }
  console.log(await readArchive(args.positional));
};

const runTrace = (args: ParsedArgs): void => {
  if (args.positional === null) {
    throw new UsageError(
      'caliper trace requires a trace file, e.g. caliper trace .caliper/a3f0c1d2/caliper-a3f0c1d2.trace.json',
    );
  }
  const detail = traceDetailSchema.parse(JSON.parse(readFileSync(args.positional, 'utf8')));
  const channels =
    args.channels.length > 0
      ? new Set(args.channels.map((name) => (name === 'steps' ? 'steps' : name)))
      : new Set(['steps', 'console', 'network', 'state']);

  console.log(
    sliceTrace(detail, {
      channels: channels as ReadonlySet<TraceChannel>,
      aroundMs: args.around === null ? null : parseTimestamp(args.around),
      windowMs: AROUND_WINDOW_MS,
    }),
  );
};
```

with the imports:

```ts
import {readFileSync} from 'node:fs';
import {traceDetailSchema} from '@caliper/core';
import {readArchive} from './trace/read-archive';
import {sliceTrace, type TraceChannel} from './trace/slice';
```

- dispatch them in `main`:

```ts
  } else if (args.command === 'read') {
    await runRead(args);
  } else if (args.command === 'trace') {
    runTrace(args);
```

- add both lines to `topLevelHelp`'s usage block:

```
  caliper read <path-to-zip|folder>
  caliper trace <path-to-trace.json> [--steps] [--console] [--network] [--state] [--around <t>]
```

- [ ] **Step 4: Verify the build and the commands**

Run: `pnpm --filter @dendiem/caliper build`
Expected: succeeds.

Run: `node apps/ask/dist/cli.js --help`
Expected: the usage block lists `read` and `trace`.

Run: `node apps/ask/dist/cli.js trace --help`
Expected: the trace help, including the "never open the .webm" line.

Using a zip produced in Task 14:

Run: `node apps/ask/dist/cli.js read ./caliper-<id8>.zip`
Expected: TOON with a `traces[1]:` section, and `.caliper/<id8>/` populated.

Run: `node apps/ask/dist/cli.js trace .caliper/<id8>/caliper-<id8>.trace.json --network --around 12.4s`
Expected: only the network channel, windowed.

- [ ] **Step 5: Commit**

```bash
git add apps/ask/src
git commit -m "feat(ask): pull schemaVersion 2 traces and add caliper read / caliper trace"
```

---

## Task 19: Teach the skill and the docs

**Files:**
- Modify: `apps/ask/skills/caliper-fix/SKILL.md`
- Modify: `README.md`, `apps/qa-extension/README.md`, `apps/ask/README.md`

**Interfaces:**
- Consumes: everything.
- Produces: nothing.

- [ ] **Step 1: Extend the skill's frontmatter**

In `apps/ask/skills/caliper-fix/SKILL.md`, replace the `description` so a bug trace triggers it too:

```yaml
description: Use when you are handed a Jira issue (URL or key) to fix UI defects, when you are given a Caliper QA zip archive directly, or when asked to apply the Caliper fixes on a ticket — pull the QA session Caliper attached and fix from its recorded marks, bug traces and screenshots, offline, without the running app.
```

- [ ] **Step 2: Add the artifact taxonomy**

Insert a section after `## Pull the session`:

````markdown
## Two ways in

- **A ticket** — `caliper pull <jira-url|key>`.
- **A zip handed to you directly** — `caliper read <path-to-zip|folder>`. No Jira credentials needed.

Both print the same TOON and both materialise files under `.caliper/<id>/`. The first line names what
the export contains, e.g. `ABC-123: 3 marks, 1 trace`.

## What a session can contain

| Artifact | What it is | How you read it |
| --- | --- | --- |
| **marks** | A moment: one element, its selector, component and token-matched styles | Inline in the TOON, per the guide below |
| **trace** | A sequence: steps, DOM replay, console, network, store actions | Summary in the TOON; detail via `caliper trace` |
| **`.webm`** | A video of the reproduction, for the human reading the ticket | **Never open it.** It carries nothing the trace does not, in a form that costs you far more to read |

## Reading a trace

The TOON lists each trace with its duration, label, counts and the path to its `trace.json`. Start
there — the summary usually tells you whether the trace explains the bug.

When you need detail, slice it; do not read the file whole:

```
caliper trace .caliper/<id>/caliper-<id>.trace.json            # every channel
caliper trace <file> --network --console                        # two channels
caliper trace <file> --around 12.4s                             # ±2s of everything around that moment
```

Every `t` is milliseconds from the trace's start, so a step, a console error and a failed request that
share a timestamp are the same instant. The usual path: read the steps, find the one where the defect
appears, then `--around` that timestamp to see what the app did underneath.

Two notes the summary may carry:

- `network captured in fallback mode` — `chrome.debugger` could not attach during recording (DevTools
  was open), so request/response **bodies may be missing**. Statuses and timings are still accurate.
- `truncated: true` — the recording hit its length limit and the earliest seconds were dropped. The
  reproduction's beginning is not in the file.
````

- [ ] **Step 3: Document the feature in the READMEs**

In root `README.md`, under the `🐞 Human → agent` section, add a paragraph introducing traces: what Start/Stop records, that the video is for humans and the trace for agents, and that a developer reads it with `caliper pull` or `caliper read`.

In `apps/qa-extension/README.md`, document the record bar, the trace card, and the four options with their defaults (`Mask credentials` **off**).

In `apps/ask/README.md`, add `caliper read` and `caliper trace` to the command list with one line each.

- [ ] **Step 4: Full verification**

Run: `pnpm test`
Expected: PASS across `@caliper/core`, `@caliper/recorder` and `@dendiem/caliper`.

Run: `pnpm lint`
Expected: no errors.

Run: `pnpm --filter @caliper/qa-extension build && pnpm --filter @dendiem/caliper build`
Expected: both succeed.

- [ ] **Step 5: Commit**

```bash
git add apps/ask/skills README.md apps/qa-extension/README.md apps/ask/README.md
git commit -m "docs: teach caliper-fix to read bug traces and document the recorder"
```

---

## Self-review notes

**Spec coverage.** §1 → Tasks 4–13. §2 path 1 → Task 18; path 2 → Task 17. D1 → Tasks 9, 10. D2 → Tasks 9, 11, 12. D3, D4 → Tasks 6, 9. D5 → Tasks 2, 12, 14. D6 → Task 10. D7 → no task needed (traces and marks stay separate by construction; `pushTrace` never touches `annotations`). D8 → Tasks 8, 15. D9 → Tasks 3, 16, 18. D10 → Task 1. §5 → Tasks 2, 14. §6 → Tasks 9–12. §7 → Tasks 13, 15. §8 → Task 4. §9 → Tasks 16–19. §11 non-goals: no task builds a replay viewer, external storage, mark↔trace correlation, multi-tab traces, or worker capture. §12 risks are addressed by Task 15 (privacy), Task 11 (CDP degradation) and Task 10 (budget).

**Known soft spots for the executor.**

- Task 2's import cycle between `annotation.schema.ts` and `trace.schema.ts` has a stated escape hatch; take it at the first sign of trouble rather than debugging it.
- Task 10's manual budget check is the only verification of D6. If 30 s lands above 1.2 MB, lower the default bitrate in Task 15 — do not add post-processing.
- Tasks 9–15 have no automated tests. That is a property of MV3, not an oversight: every one of them ends with concrete manual observations. Record what you actually saw, and if an observation does not match, stop and report rather than adjusting the expectation.
