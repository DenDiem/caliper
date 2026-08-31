# Caliper Trace — bug-session recording, design

**Date:** 2026-08-31
**Status:** design approved in brainstorm; awaiting spec sign-off before the implementation plan.
**Scope:** the QA extension gains a recorder; `@dendiem/caliper` gains the reading side; the store
listing is renamed.

## 1. Goal

The shipped QA extension captures a **moment**: a marked element, its selector, component and
token-matched styles. A whole class of defect is not a moment — it is a sequence. "Save works, but
only the second time"; "the list flickers after the failed refresh"; "the modal closes itself when
the socket reconnects". A single mark cannot carry that.

Caliper Trace records the sequence. QA presses **Start trace**, reproduces the bug, presses **Stop**,
and the session carries a machine-readable account of what happened — user steps, DOM over time,
console, network, store actions — plus a small video for the human reading the ticket.

**Thesis: two artifacts, two audiences, and never confused.** `trace.json` (+ the rrweb replay) is
for the agent; `.webm` is for the person. The agent must never be handed the video to decode, and the
human must never be handed NDJSON to read.

## 2. What the user asked for, restated

Two delivery paths, both must work:

1. **Ticket path** — QA records, sends to a Jira issue. A developer hands their agent the issue key;
   `caliper pull` fetches everything and the agent works offline from it.
2. **Offline path** — QA records and hands a developer a zip directly (Slack, email). The developer's
   agent must read that zip through the *same* reading path.

Path 2 has no agent entry point today (§9.2) — closing that is in scope.

## 3. Decisions (rationale + rejected alternatives)

### D1 — Both a DOM replay and a video; the replay is the agent's artifact

rrweb-style DOM recording (mutations + input events) is the machine artifact: orders of magnitude
smaller than video, seekable, and it yields the *exact* DOM at any instant — selectors, text, classes.
The `.webm` exists so a human skimming the ticket understands the bug in five seconds.

- **Rejected — video only.** An agent cannot cheaply decode video, and what it would recover
  (approximate pixels) is strictly weaker than what the replay gives it (the actual DOM).
- **Rejected — replay only.** rrweb does not reproduce canvas, cross-origin iframes or native video
  faithfully, and a reviewer skimming a ticket will not run a replay tool.

### D2 — Hybrid collection: in-page instrumentation **and** CDP, with CDP optional

- **In-page (`world: 'MAIN'`, `run_at: 'document_start'`)** hosts rrweb, the Redux DevTools shim, and
  patches for `console` / `fetch` / `XHR` / `sendBeacon`.
- **CDP (`chrome.debugger`)** attaches *only for the duration of a trace* and is the preferred source
  for network and console: it sees response bodies, uncaught exceptions and stack traces that a
  monkey-patch cannot.

**CDP is preferred, never required.** It cannot attach when DevTools is open on the tab — and QA keeps
DevTools open — so a failed attach is a *normal* path: the recorder falls back to the in-page patches
and stamps `sources.network: 'fallback'` (§5.2) so the agent knows bodies may be incomplete. Recording is never
blocked by CDP.

- **Rejected — CDP only.** The `debugger` infobar plus the DevTools conflict makes it unusable as the
  sole mechanism, and state would need the in-page bridge anyway.
- **Rejected — in-page only.** Loses response bodies and uncaught-exception stacks, which is most of
  the debugging value of a network log.

### D3 — `document_start` main-world injection is mandatory, not an optimisation

NgRx `StoreDevtoolsModule` (and Redux, and Zustand's devtools middleware) probe
`window.__REDUX_DEVTOOLS_EXTENSION__` **once, during bootstrap**. A hook installed when the user
presses Start is installed too late — forever. The shim must therefore exist before the app runs,
which forces a `document_start` main-world content script on `<all_urls>`.

Consequence accepted: the patches are resident on every page. Idle cost is bounded by writing into a
ring buffer of capacity 0 until a trace starts — one extra function call per intercepted API.

### D4 — Never overwrite a real Redux DevTools hook

If `window.__REDUX_DEVTOOLS_EXTENSION__` already exists, the developer has the real extension
installed. We **wrap** `connect()` so both receive messages; we do not replace it. Breaking a
developer's DevTools to record a trace is a worse outcome than recording no state.

### D5 — Heavy data lives in files, not in the session manifest

The v1 manifest inlines PNGs as data-URLs in `session.assets`. That does not scale to a trace. Each
trace is a set of sibling files; the manifest carries only metadata, a summary and filenames (§5).

### D6 — Video budget: ~1 MB per 30 s, enforced by encoder settings, not post-processing

Downscale to ≤1280 px wide at ≤12 fps and encode VP9 at `videoBitsPerSecond: 250_000` → ≈0.94 MB per
30 s. VP9 on a mostly-static UI leaves headroom. A ring buffer of 1-second chunks bounded by
`maxDurationMs` (default 120 s) keeps a forgotten recording from growing without limit; when it bites,
the trace records `truncated: true` and the retained window.

- **Rejected — record at full rate, transcode down afterwards.** MV3 has no cheap transcoder; the
  encoder settings get there directly.

### D7 — Trace and mark are separate artifacts

A session may hold marks, traces, or both, with no temporal correlation between them. Correlating a
mark to a moment inside a trace was considered and dropped — it adds UI friction (QA must mark
*during* recording) for a link the agent can usually infer from the trace's own steps.

### D8 — Network bodies are recorded verbatim; redaction is opt-in

The default is **no redaction** — explicit product decision. A `redactSecrets` option (default `off`)
masks `Authorization` / `Cookie` / `Set-Cookie` headers and `password` / `token` / `secret` fields.

> **Standing caveat, to be stated in the UI and in `PRIVACY.md`:** with the default settings a trace
> sent to Jira contains live bearer tokens and session cookies from the environment under test. This
> is acceptable for an internal staging ticket and is not acceptable for a public issue tracker.

### D9 — Summary-first reading; detail is pulled, not pushed

`caliper pull` prints the trace **summary** — duration, step list, console errors, failed requests,
recent store actions, file paths. Bodies and rrweb events stay on disk and are read through
`caliper trace <file> --network|--console|--state|--around <t>`.

Without this, one 30-second trace with response bodies consumes the agent's context before it has read
the ticket. The reading tool is part of the feature, not a follow-up.

### D10 — The extension is renamed `Caliper QA`

`Caliper QA — UI Marks & Bug Traces for AI Coding Agents` (55 of the store's 75 characters).
`docs/seo.md` is explicit that the name field is indexed and its budget should be spent on keywords,
so the name stays keyword-loaded rather than being trimmed to the bare brand. `Caliper` remains the
umbrella brand over both products; `QA` names this one. The npm package `@dendiem/caliper` is
untouched.

## 4. Naming

The feature is **Trace** throughout: `Start trace` in the UI, `CaliperTrace` in the schema,
`*.trace.json` on disk, `caliper trace` on the CLI. "Session" is already taken by `CaliperSession` and
is not reused.

## 5. Data contract

`schemaVersion` goes `1 → 2`. `CaliperSession` gains `traces: CaliperTrace[]`; `annotations` is
unchanged. v1 sessions remain readable (§9.1).

### 5.1 Files

```
caliper-<id8>.session.json          manifest: annotations + traces[] metadata
caliper-<id8>-t<n>.trace.json       steps, console, network, state
caliper-<id8>-t<n>.replay.ndjson.gz rrweb events (agent, on demand)
caliper-<id8>-t<n>.webm             video (human)
```

In the zip these are siblings inside the existing `caliper-<id8>/` folder. On a Jira issue they are
individual attachments; the manifest references them by filename, exactly as `buildJiraManifest`
already does for PNGs.

### 5.2 `CaliperTrace` (in the manifest)

```ts
{
  id: string;
  label: string;
  startedAt: string;            // ISO
  durationMs: number;
  truncated: boolean;           // ring buffer dropped the head
  page: {url, title, viewport: {width, height, dpr}};
  sources: {
    network: 'cdp' | 'fallback';
    console: 'cdp' | 'fallback';
    state: 'devtools-bridge' | 'none';
  };
  summary: {
    steps: number;
    consoleErrors: number;
    failedRequests: number;
    stateActions: number;
  };
  files: {trace: string; replay?: string; video?: string};
}
```

### 5.3 `trace.json` (the detail file)

All timestamps are `t`: milliseconds from trace start.

```ts
{
  traceId, schemaVersion: 2,
  steps:   [{t, kind: 'click'|'input'|'key'|'navigation'|'scroll', selector?, text?, url?}],
  console: [{t, level, text, stack?}],
  network: [{t, method, url, status, durationMs, requestBody?, responseBody?, headers?, failed?}],
  state:   [{t, action, diff?}],
  stateSnapshots: {start?: unknown; end?: unknown};
}
```

State sizing: action types and timestamps are always recorded; the full store state is snapshotted at
start and end only; per-action diffs are kept while they fit under a size cap. Recording full state per
action would dwarf every other channel.

## 6. Capture pipeline

Orchestrated by the background service worker, keyed by `tabId`.

| Part | Where | Responsibility |
| --- | --- | --- |
| Main-world collector | new `document_start` entrypoint, `world: 'MAIN'` | rrweb, Redux shim, console/fetch/XHR patches |
| Bridge | existing isolated content script | `window.postMessage` ↔ `chrome.runtime` |
| Recorder host | background SW | trace lifecycle, CDP attach/detach, assembly |
| Video | offscreen document (`reasons: ['USER_MEDIA']`) | `tabCapture` stream → constraints → `MediaRecorder` |
| Storage | IndexedDB (blobs) + existing sink (manifest) | `.webm` / `.replay` are blobs, not data-URLs |

**Deduplication.** When CDP is attached its stream wins and the in-page patch buffer for that channel
is discarded. One source per channel, and the chosen source is named in `sources`.

**Navigation.** A trace belongs to the tab, not the page. On `webNavigation.onCommitted` the collector
re-injects at `document_start`, rejoins the active trace, rrweb emits a fresh full snapshot, and a
`navigation` step is appended. `tabCapture` survives a same-tab navigation, so the video does not break.

**Response bodies** are fetched via `Network.getResponseBody` at Stop for a bounded set (failures,
JSON responses, first N) — not streamed during the trace, which would compete with the app.

## 7. Extension UI

- `TitleBar` gains `● Start trace`. While recording the bar becomes a recording strip: elapsed timer,
  live counters (console errors, failed requests), `■ Stop`.
- An in-page pill in the overlay shows the recording is live when the side panel is closed.
- After Stop, a trace card joins the panel list beside the defect cards: label, video preview, summary
  chips, delete.
- `TaskSheet` / `JiraSheet` send unchanged, with the trace files added to the payload.
- Options: `redactSecrets` (default off), `maxDurationMs`, `videoBitrate`, `enableCdp`.

## 8. Packaging

New `packages/recorder` — event collection with no `chrome.*`, the same portability rule
`packages/core` already follows, so the logic is unit-testable outside the extension. The schema lives
beside its sibling at `packages/core/src/schema/trace.schema.ts`.

## 9. Reading side (`@dendiem/caliper`)

### 9.1 `caliper pull`

`apps/ask/src/jira/pull.ts` today matches one filename pattern, parses `schemaVersion: z.literal(1)`
and materialises PNGs. It changes to:

- accept `schemaVersion` `1 | 2`, so tickets filed before this release keep working;
- download each trace's files into `.caliper/<id8>/` alongside the screenshots;
- emit a summary line per trace and announce the ticket's composition explicitly —
  `3 marks, 1 trace (24s, 2 console errors, 1 failed request)`. The skill therefore learns what a
  ticket contains by reading an enumerated manifest, not by guessing from filenames.

### 9.2 `caliper read <zip|dir>`

The offline path's missing entry point. Reads a downloaded zip or an unpacked folder and prints the
same TOON as `pull`. Without it, path 2 from §2 requires the agent to unpack an archive by hand.

### 9.3 `caliper trace <file> [--network|--console|--state|--around <t>]`

The zoom-in mechanism behind D9. Prints a filtered slice of one `trace.json`.

### 9.4 Skill `caliper-fix`

Extended with: the artifact taxonomy, how to read a trace summary, when to zoom in with
`caliper trace`, and the standing rule that **`.webm` is never opened** — it carries nothing the trace
does not, in a form the agent cannot read cheaply.

## 10. Renaming checklist

| File | Change |
| --- | --- |
| `apps/qa-extension/wxt.config.ts` | `manifest.name`, `manifest.description`, `action.default_title` |
| `docs/store-listing.md` | name + summary |
| `docs/seo.md` | name + summary |
| root `README.md`, `apps/qa-extension/README.md` | product name |

> `docs/seo.md` and `docs/store-listing.md` are **currently stale**: both still carry
> `Caliper — Design Mode & UI Annotation for AI Coding Agents`, although `49cb747` removed "Design
> Mode" from the manifest. This change resynchronises all three.

## 11. Non-goals (v1)

- **A replay viewer.** No `replay.html`, no in-panel scrubber. The `.webm` serves the human; the
  replay serves the agent as data.
- **External storage for large artifacts.** Jira attachments and the local zip only.
- **Correlating marks to trace timestamps** (D7).
- **Multi-tab traces.** One trace, one tab.
- **Recording Service Worker / Web Worker traffic.** Out of reach of both collectors as specified.

## 12. Risks

| Risk | Mitigation |
| --- | --- |
| `debugger` permission slows Chrome Web Store review | Attach only during an explicit user-started trace, detach at Stop; justify in the listing |
| A `document_start` main-world script on `<all_urls>` is a broad surface | Zero-capacity buffers until Start; no network egress from the collector |
| Traces carry live credentials (D8) | UI warning + `PRIVACY.md` + `redactSecrets` toggle |
| rrweb misses canvas / cross-origin iframes | The `.webm` covers what the replay cannot |
| Jira's ~10 MB per-attachment limit | D6 budget plus `maxDurationMs`; oversize is reported before send, not after |
| A stale selector in a trace step | Same standing caveat as marks — steps are best-effort against current source |
