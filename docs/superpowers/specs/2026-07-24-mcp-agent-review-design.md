# Caliper agent→human review — MCP design

**Date:** 2026-07-24
**Status:** design approved in brainstorm; awaiting spec sign-off before the implementation plan.
**Reviewed by:** two independent Fable 5 critiques (one with repo access, one judging from quoted
signatures). Both are folded in; where they conflicted, §16 records the resolution.
**Amended 2026-07-25:** the anchoring decision reversed — see §17. `data-caliper-ref` stamping is no longer
a MUST; anchoring is selector-based and non-invasive throughout.

## 1. Goal

The reverse of the shipped QA extension. QA is **human→agent** (a person marks a defect, an agent fixes
it). This is **agent→human**: while a coding agent implements a design and hits genuine uncertainty about a
specific UI region, it marks that region with a question, a browser opens showing the questions pinned to
the live UI, the developer answers and hits Submit, and the answers flow back to the agent — no copy-paste.
Delivered as an MCP server that any MCP-speaking coding agent (Claude Code and Codex first) installs with
one command.

Thesis: *one annotation format, two directions*. The reverse flow reuses `@caliper/core` and
`@caliper/overlay` and does not fork the annotation schema.

## 2. Decisions (rationale + rejected alternatives)

### D1 — Zone marked over a live dev preview (`localhost`), over the real DOM
Real CSS selectors; `extractContext` / `collectTokens` / token matching apply unchanged; the agent's
annotation is structurally identical to a QA defect. The design reference (Figma frame) is **attached** to a
question via the existing `figmaUrl` field — not the host.
- **Rejected — static screenshot / Figma frame.** `ElementContext` is irreducibly live-DOM
  (`getBoundingClientRect`, `getComputedStyle`, `document.styleSheets` walking), and
  `caliperAnnotationSchema.target` requires it. A pixel-rect / node-id host is a de-facto schema fork plus
  capture machinery. Both reviewers confirm the rejection.

### D2 — Injecting reverse-proxy is the default; a guarded snippet is the first-class v1 fallback
The MCP server reverse-proxies the dev app and injects a **same-origin external**
`<script src="/__caliper__/client.js">` into HTML responses. Same origin ⇒ real selectors, no CORS on the
answer POST, zero app changes, framework-agnostic.
- **Fallback (built in v1, not a footnote): a guarded one-line snippet**
  `<script data-caliper src="http://127.0.0.1:PORT/__caliper__/client.js"></script>` in the app's root
  `index.html`, added/removed by `caliper init` or the agent. It **replaces the Vite plugin**: `@angular/build`
  exposes no user Vite-plugin hook, so a plugin fallback is dead exactly on the primary stack (Angular). The
  snippet preserves the app's real origin, sidestepping the origin-shift failure class the proxy cannot fix
  (§6). The proxy **auto-detects** its own failure (HMR handshake / CSP / service-worker) and points the
  developer at the snippet — it is not discovered after an afternoon of debugging.
- **Rejected — Playwright-driven window** (~150 MB browser download + review-in-an-automated-window; the
  human must stay in their own browser). Both reviewers confirm.

### D3 — Async ticket + poll is the transport spine; blocking is a bounded fast path
The binding constraint is the **client's** tool-call timeout, which the server cannot observe and the
installer cannot reliably set: Claude Code's `MCP_TOOL_TIMEOUT` is global to the client process and there is
a live trail of long MCP calls being killed even when the server emits progress; Codex's `tool_timeout_sec`
is per-server and bounded (default recently raised to 300 s — i.e. it was lower, and it is a hard cap).
Therefore:
- `caliper_ask` waits at most a conservative window (**≈50 s**, under every known client default), then
  returns `{ status: 'pending', ticket, answered: [...] }` whose text explicitly instructs calling
  `caliper_wait(ticket)`.
- `caliper_wait(ticket)` repeats the bounded await; it is idempotent, repeatable, and returns partial
  answers as they exist. **A killed/timed-out tool call is a normal path, never an error path** — the
  session outlives any number of dropped calls.
- If the developer is already at the screen, the first `caliper_ask` returns completed answers directly
  (fast path).
- MCP progress notifications are emitted when the client supplied a `progressToken` (best-effort; never
  depended on). The Codex adapter also raises `tool_timeout_sec` belt-and-braces.

### D4 — One shared MCP server; baseline guidance in tool descriptions; per-agent guidance adapters
The MCP server is single (MCP is a standard). Baseline "when to reach for Caliper" lives in the **tool
descriptions** — cheap, helps discovery, and lets any MCP agent see the tool. But models **systematically
under-ask** (a mid-implementation agent defaults to guessing, not to opening a review), so the per-agent
**guidance adapters are load-bearing, not mere enrichment**. `caliper init` installs, via an adapter:
```ts
interface AgentAdapter {
  id: string;                       // 'claude-code' | 'codex'
  detect(): boolean;
  registerServer(config): void;     // write the MCP-server entry into the agent's config
  installGuidance(): void;          // skill (Claude Code) / AGENTS.md snippet (Codex)
  uninstall(): void;
}
```
v1 ships **claude-code** and **codex** adapters. "Codex reaches for the tool from description + AGENTS.md"
is a **hypothesis to smoke-test on first use**, not a claim. The interface keeps Cursor/Windsurf/Cline
additive (one file each, no installer-core change).

### D5 — One monorepo; add `apps/mcp-server`; reuse the packages, not the extension
Deciding test: the new app imports `@caliper/core` (and `@caliper/overlay`) → same repo. Splitting forces
duplicating the spine or publishing it as versioned npm with cross-repo bumps on every change — the drift
the thesis exists to prevent. A monorepo shares **packages** without coupling **products**: `qa-extension`
ships to the Chrome Web Store, `mcp-server` to npm, independently. The **extension itself is not reused**
(different shell: manual install, human-driven picker, `chrome.storage` transport); only the packages it
already imports are shared. `apps/qa-extension` is not modified.

## 3. Architecture and layout

```
packages/
  core/            # PURE, TESTED. + review schemas, + reducers, + injector transform, + toReviewToon
  overlay/         # DOM-only primitives. Picker entry unchanged; review primitives under a /review subpath
apps/
  qa-extension/    # UNTOUCHED — its store build must keep passing
  mcp-server/
    src/
      server.ts      # stdio MCP: tools caliper_ask, caliper_wait
      http/          # Node plumbing: proxy piping, WS upgrade, content-type detect, endpoints
      session/       # Node: registry, tickets, ephemeral-port + browser open, temp-file persistence
      adapters/      # AgentAdapter: claude-code, codex
      init.ts        # `caliper init` CLI
    client/          # BROWSER glue (fetch): HTTP AnnotationSink, mountReview, right panel, MutationObserver
```

**Pure logic lives in `packages/core` where vitest reaches it** — the riskiest new code must not sit in the
untested app layer:
- `injectScriptTag(html-or-chunk, src, token)` — a **pure string/stream-chunk transformer** (insert the
  external script at the first `<head>` chunk). Tested against Vite / Next-app-router / Angular-CLI HTML
  fixtures. This turns §6's hardening list into runnable tests.
- **Review session/zone reducers** — pure state transitions (`addZones`, `setDraft`, `setAnswer`,
  `resolve`, `merge`). Tested.
- `reviewZoneSchema` / `reviewSessionSchema` / the `caliper_ask` payload schema — zod, next to the
  annotation schema. Tested.
- `toReviewToon` — AXI/TOON result table. Tested.

**Node/`fetch`/stdio stay in `apps/mcp-server`** (`src` = Node http/proxy/socket, `client` = browser
`fetch`). `packages/overlay` stays transport-agnostic (callbacks only), zero `chrome.*`. Overlay gains only
**primitives** (multi-highlight layer; an answer-popover variant of `Popover`) exported under a
`@caliper/overlay/review` subpath so `qa-extension`'s picker import graph is untouched. The **panel +
navigation + batch Submit** — product-specific review chrome — lives in `apps/mcp-server/client`.

## 4. Data model (additive — `schemaVersion` stays 1, no fork)

- **`reviewZoneSchema`** (new) — what the agent submits and what the session tracks:
  ```ts
  { ref: string; selector?: string; route?: string; question: string; severity?: Severity }
  ```
  `selector` is **optional**: a not-yet-built region has no element. Unanchored zones are first-class (§7).
- **In-memory `ReviewZone`** adds resolution/answer state: `resolvedTarget: ElementContext | null`,
  `answer: string | null`, `verdict: Verdict | null`.
- **`caliperAnnotationSchema` gains `answer: z.string().nullish().default(null)`** — the developer's free
  text. `comment` holds the agent's question; `verdict` (existing closed enum) stays **nullable/optional**
  (a question may have prose and no verdict); `answer` carries the prose. Additive, old data still parses.
- **Anchored zones become `CaliperAnnotation`s** (target present) for the QA-symmetric persisted record.
  **Unanchored zones are NOT annotations** — they live as `ReviewZone`s and surface in `toReviewToon`
  keyed by `ref`. This keeps `target` **required** on the annotation (no nullability creep into the tested
  `toToon`), while still making unanchored questions first-class in the panel and in the agent-facing
  result. (This is the explicit resolution of the "target nullable?" question — see §16.)

## 5. `caliper_ask` / `caliper_wait` protocol

- `caliper_ask({ target?, zones: ReviewZone[] })`
  - `target` defaults to the URL pinned at `caliper init`; the tool may only **select among configured
    loopback targets**, never an arbitrary origin (SSRF / injection guard, §8).
  - Creates/merges a `ReviewSession`, ensures proxy + browser are up, waits ≤ the bounded window (§D3).
  - Returns completed answers (`toReviewToon`) or `{ status:'pending', ticket, answered:[...] }`.
  - **Tool description guidance (revised — see §17):** anchor each zone with an ordinary CSS `selector`
    for an element that already exists on the page; never modify the app's source to place an anchor.
    Include `route` for every zone. No reliable selector (region not built, or the agent is unsure)? Ask
    anyway — the developer can click the real element to point at it. The client resolves a zone by
    `[data-caliper-ref="<ref>"]` first, then `zone.selector`, then leaves it unanchored — `data-caliper-ref`
    remains supported only as an optional convenience for markup the agent is authoring from scratch, never
    a requirement.
- `caliper_wait({ ticket })` — bounded, repeatable, idempotent; returns answers or still-pending.
- **Concurrency.** A second `caliper_ask` from the same agent **merges** its zones into the open session
  and pushes them to the page over SSE (§7); each zone's answer resolves the await that owns it. Two
  different projects get two ephemeral-port servers/tabs (§8) naturally.

## 6. Injection, proxy, and origin-shift (proxy hardening = acceptance criteria)

Verified against a named matrix — **Vite, Next app-router, Angular CLI** — as acceptance tests (the pure
`injectScriptTag` transformer is unit-tested; the live plumbing is hand-verified):
- **External same-origin script**, never inline — survives `script-src 'self'` with no nonce. On
  **nonce/strict-dynamic CSP** the injection still breaks: detect the CSP header, warn, and point at the
  snippet fallback.
- **Compression:** strip `Accept-Encoding` (or decompress) and drop `Content-Length` on **HTML** responses
  before injecting — injecting into a gzip/brotli stream corrupts it (blank page).
- **Streamed HTML:** operate on the first `<head>` chunk of a stream (Next app-router streams), not a
  buffered document.
- **HMR websocket, both paths:** proxy WS upgrades for frameworks that go same-origin; **tolerate HMR that
  bypasses the proxy entirely** (Vite's client may dial `localhost:3000` directly on pure localhost). Both
  paths tested; a failed HMR handshake triggers the snippet suggestion.
- **Service workers:** an app SW on the proxy origin can serve cached HTML without the injection — detect
  and warn.
- **Origin-shift is the real limit, not HMR.** Serving from `localhost:PORT_PROXY` means the app's API at
  `localhost:8080` (dev CORS allowlisting `:3000`), OAuth redirect URIs registered for `:3000`, and Next
  `allowedDevOrigins` can all break — none are proxy bugs, none fixable by proxy hardening. When they bite,
  the **snippet** (origin-preserving) is the answer; the tool's error guidance documents the signatures
  (failing XHRs with CORS errors, OAuth bounce).
- **Target down:** the proxy serves a clear **502 page**, not a dead tab.

## 7. Review UI and page lifecycle

- **Overlay primitives (`@caliper/overlay/review`):** a **multi-highlight layer** (N zone rectangles at
  once), an **answer-popover** variant of `Popover` (question display + free-text answer field), reusing
  `createOverlayHost`. The existing `mountOverlay` picker is reused **unchanged** for re-anchoring.
- **Client orchestration (`apps/mcp-server/client`):** the **right-hand question panel** (click a question
  → navigate to its `route`, same-origin, focus its highlight), rectangles synced to the panel, the hover
  answer-popover, and one **Submit** (bottom-right) batching all answers.
- **Anchoring (non-invasive — revised, see §17).** The agent anchors with an ordinary CSS `selector` over an
  existing element; it never edits the app's source to place an anchor. On mount, resolve each zone by
  `[data-caliper-ref]` then `selector` — the ref lookup only ever hits when the agent opted to stamp one on
  markup it authored from scratch, so in practice resolution is selector-driven. On hit, `extractContext(el,
  tokens)` enriches to a full `ElementContext`. A **MutationObserver** re-resolves zones that render late
  (modals, tabs, `@if`). Unresolved zones render in the panel (labelled "not found on this route") and can be
  **re-anchored by clicking the real element** (reuses the picker). Genuinely unanchored zones (nothing
  built) stay answerable in the panel, optionally as a **droppable marker** the developer places on the page.
- **Multi-page reviews are developer-driven.** A zone's `route` marks which page it belongs to; the review
  can span the whole app. The developer navigates the real app to reach each `route` — including logging in
  or working through a gated flow — the panel is not expected to deep-link past auth or app state it does
  not control. Each page's questions resolve and light up as the developer arrives there.
- **The page is a stateless view; the MCP server owns the session.** Full-page navigations (route clicks in
  an MPA, or dev-server reloads) remount the injected script — so the client **rehydrates from
  `GET /__caliper__/state`** on every load and **never** holds session state in page memory. Answer drafts
  autosave to the server on input/blur and rehydrate on mount, so navigation never loses typed answers.
- **Live updates.** The client subscribes to a token-gated **SSE** endpoint; a later `caliper_ask` adds
  zones to the open tab with no manual refresh.

## 8. Security (loopback is a write channel into an agent with shell/file access)

All mandatory, day-one:
1. **Per-session capability token** minted by the MCP process, embedded by the proxy into the injected
   client/page (only HTML the proxy injected carries it), required on every `/__caliper__/*` request (POST
   answers/drafts, SSE/poll).
2. **`Origin` + `Host` validation** on every state-changing request against the proxy's own loopback origin
   — kills drive-by cross-origin POSTs and DNS-rebinding reads.
3. **Bind `127.0.0.1`, ephemeral port per session** — the server opens the browser itself, so no
   predictable URL is needed; ephemeral also fixes concurrent-session port collisions (D4's own scenario).
4. **`target` restricted to loopback/localhost origins**, pinned at `caliper init`; the tool may not proxy
   an arbitrary origin (else a prompt-injected agent turns the server into an open injecting proxy).

## 9. Persistence and process lifetime

The `ReviewSession` (zones + drafts + answers + ticket + token) is persisted to a temp file. Claude Code may
restart the stdio server on reconnect/config change; a restarted server rehydrates and still serves
`caliper_wait(ticket)` and in-flight browser answers. Server death with typed-but-unsubmitted answers loses
only that unsaved text (drafts autosave on blur, so the window is small) — acceptable for v1.

## 10. Execution environments (remote / container / WSL)

Claude Code and Codex frequently run in devcontainers / WSL / SSH / cloud, where `open` fails and
`localhost:3000` may not be the developer's browser machine. v1:
- **Always print the review URL** in the tool result; `open`ing the browser is best-effort on top.
- **Detect the no-display / headless case** and say so explicitly instead of failing opaquely.
- **Document port-forwarding** (VS Code auto-forward, `ssh -L`, devcontainer `forwardPorts`) so the ephemeral
  port reaches the developer's browser.
- State the support boundary plainly: local and port-forwarded are supported; a truly headless agent with no
  reachable browser is documented-unsupported for v1. (This is the most likely #1 filed issue — name it.)

## 11. Testing

Vitest lives in `packages/core` only (repo rule); apps are hand-verified. Because the riskiest new logic is
pure and lives in core (§3), it is tested there:
- `injectScriptTag` against Vite / Next-app-router / Angular-CLI HTML fixtures (head present, streamed first
  chunk, already-has-caliper idempotency, compressed-body guard path).
- Review session/zone reducers (add/merge/setDraft/setAnswer/resolve; concurrent-merge semantics).
- `reviewZoneSchema` / `caliper_ask` payload schema (optional selector, defaults) and the annotation
  `answer` default.
- `toReviewToon` (anchored + unanchored rows; quoting/escaping parity with `toToon`).
`apps/mcp-server` (server, proxy plumbing, client) is verified by hand — no `*.spec` in apps.

## 12. Lint boundary hardening

The eslint config bans only `chrome`/`browser` globals in `packages/**`; `fetch`/Node are convention. Since
`apps/mcp-server/client` legitimately uses `fetch` while packages must not, add `no-restricted-globals`
entries for `fetch`/`process` scoped to `packages/**` so the boundary is enforced, not trusted.

## 13. Out of scope for v1 (YAGNI)

- Adapters beyond `claude-code` and `codex` (interface keeps them additive).
- Fixed port (ephemeral per session — §8).
- Base64 **screenshot** attachment on questions — `figmaUrl` covers the reference; screenshots re-import the
  token-weight problem the original design doc engineered out.
- Threaded/multi-turn clarification (`answer` is one field for v1).
- `Badge` in review mode; UI built around question `severity` (an agent grading its own uncertainty is of
  dubious value — keep the field optional, build no UI on it).
- The Jira integration (separate spec: `docs/superpowers/specs/2026-07-23-jira-integration-design.md`).

## 14. Empirical items to pin before/at implementation

- Current Claude Code `MCP_TOOL_TIMEOUT` and Codex `tool_timeout_sec` defaults, and whether Claude Code
  resets its timeout on progress notifications — the async-first direction is robust to the numbers, but
  verify the ≈50 s cap against real defaults.
- Codex's real propensity to invoke the tool from description + `AGENTS.md` alone — smoke-test on first use;
  the adapter hedges it.

## 15. Note on the earlier handoff doc

`docs/superpowers/handoff-mcp-agent-review.md` overstates the existing foundation: it cites a
`SessionHistory` interface, `task`/`closedAt` session fields, and an "OAuth loopback pattern already in this
repo" that are **not on `main`** (only `AnnotationSink` exists in `session/sink.ts`). The transport is built
from scratch, not mirrored. Treat that handoff's "read these first" list with this correction.

## 16. How the two reviews were reconciled

- **Fallback mechanism — snippet, not a Vite plugin.** Review B (no repo access) urged building a Vite
  plugin in v1; Review A (repo access) showed `@angular/build` exposes no user Vite-plugin hook, so a plugin
  is dead on the primary stack. Resolution: keep the **snippet** as the fallback but adopt Review B's
  intensity — it is a **first-class v1 feature with auto-detected suggestion**, not a documented afterthought.
- **Overlay seam — hybrid.** Review A: panel → app client. Review B: keep review UI in overlay under a
  subpath. Resolution: overlay exposes only **primitives** under `@caliper/overlay/review` (subpath so the
  extension's import graph is untouched); the **panel + navigation + batch Submit** (product semantics) live
  in `apps/mcp-server/client`.
- **Unanchored zones — first-class, without nullable `target`.** Both flagged not-yet-built regions.
  Resolution: `reviewZoneSchema.selector` is optional and unanchored zones are first-class in the panel and
  `toReviewToon`, but they are **not** persisted as `CaliperAnnotation`s, so `caliperAnnotationSchema.target`
  stays required (no nullability creep into the tested `toToon`).
- **Answer field name.** `answer` (this spec) vs `reply` (Review B) — same additive field; `answer` chosen.
- **Pure code into core (Review B, MEDIUM-7).** Adopted wholesale — see §3, §11.

## 17. Amendment (2026-07-25) — anchoring reversed to non-invasive, selector-based

**This supersedes the `data-caliper-ref` stamping MUST in §5 and §7 as originally written.** The original
design (§D1, §5, §7) required the agent to stamp `data-caliper-ref="<ref>"` on the element in the code it
just wrote, before calling `caliper_ask`, and framed the client's `[data-caliper-ref]` lookup as the primary
resolution path. In practice this meant the agent edited the app's own source — even a throwaway
attribute — purely to satisfy the review tool. That is reversed:

- **Anchoring is an ordinary CSS `selector` over an existing element, full stop.** The agent never modifies
  the app's source to place an anchor. It uses whatever already identifies the element — a class, a tag +
  structural selector, an existing `id`/`data-testid` — exactly as `@caliper/overlay`'s QA-side picker
  already does for a human. This is the non-invasive posture the rest of the design already assumes for
  everything except this one MUST; the amendment removes the inconsistency.
- **`data-caliper-ref` is demoted to an optional convenience**, useful only when the agent is already
  authoring brand-new markup from scratch in the same change and wants a guaranteed-stable anchor for it.
  It is never required, and is never added to pre-existing elements solely for Caliper's benefit.
- **The resolver is unchanged** (`[data-caliper-ref]` first, then `selector`, per §5/§7) — this already
  supports selector-first behavior with the ref as an optional fallback, since the ref lookup simply misses
  when no such attribute exists. No packages/client code changes were needed to realize the reversal; it was
  purely a guidance/spec correction (tool descriptions, the `caliper-review` skill, the Codex `AGENTS.md`
  section).
- **`route` is mandatory-in-practice for every zone**, and reviews are explicitly expected to span multiple
  pages: the developer drives the real running app to reach each zone's route, including authenticating or
  walking through a gated flow the tool cannot and should not try to script around. Each page's questions
  resolve and light up in the panel as the developer navigates there — this was implicit in §7's "route"
  field and MutationObserver re-resolution but is now stated as an explicit expectation for multi-page work.
- **Why the reversal:** stamping source attributes for a review tool is exactly the kind of app-touching
  side effect the proxy/snippet injection model (§D2, §6) works hard to avoid everywhere else — injecting a
  script rather than requiring app changes, auto-detecting CSP/origin failures rather than asking the
  developer to alter their app. Requiring a source edit to *ask a question* broke that non-invasiveness for
  no compensating benefit: a plain selector is already near-deterministic for a freshly-authored region (the
  agent knows its own class names), and existing elements already carry stable selectors the agent can read
  off the DOM/template it just looked at.
