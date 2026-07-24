# Strategy review request — Caliper agent→human review (MCP)

**For:** an independent reviewer (Fable 5) with **no prior context**.
**Date:** 2026-07-24
**What this is:** a design *strategy* settled in a brainstorm, handed to you to attack **before** it is
turned into an implementation spec. It has not been built yet.

---

## 0. Your role

You are an adversarial architecture reviewer. **Do not rubber-stamp.** Your job is to find where this
strategy is wrong, fragile, over-built, or missing something — and to propose concrete corrections. A
polite "looks good" is a failure; if you genuinely find nothing, say *why* each risky decision holds.

- Every "we reuse X" claim below is checkable. If you have the repo, verify against the cited files. If
  you do not, the relevant signatures are quoted inline — judge from those.
- For each decision I list the alternatives I rejected. If you think a rejected one is better, reopen it.
- Weigh by correctness, robustness, and fit to the hard constraints — **not** by how long anything takes
  to build.

**Produce at the end:**
1. A verdict: **approve** / **approve-with-changes** / **reject-and-redesign**.
2. Concerns ranked HIGH / MEDIUM / LOW, each with a concrete failure scenario.
3. Specific corrections (what to change to what, and why).
4. Anything YAGNI (cut it) or anything missing (add it).

---

## 1. What Caliper is

Caliper turns a UI element into a machine-precise annotation:
`{ selector, component, styles matched to design tokens, box, screenshot, comment, severity }`.
One annotation format, **two directions**:

- **human→agent** — *already shipped.* A QA person clicks a broken element in a Chrome extension; a
  coding agent later reads the exported annotations and fixes them. Lives in `apps/qa-extension`.
- **agent→human** — *the thing under review.* When a coding agent is implementing a design and is
  **genuinely unsure about a specific region** ("what should this zone do / look like?"), it marks that
  region with a question and opens a browser where the developer sees the questions pinned to the actual
  UI, answers them, hits Submit, and the answers flow back to the agent, which continues. Delivered as an
  **MCP server**.

The whole thesis is *one annotation format, two directions* — the reverse flow must **reuse the shared
spine, not fork it**.

## 2. Hard constraints the design must satisfy (repo-enforced, mostly by lint)

- **Monorepo boundaries.** `packages/**` must contain **zero** `chrome.*`, **zero** `browser.*`, and no
  Node-only APIs, and `fetch`/stdio are treated as belonging to apps. Shared logic: `packages/core`
  (pure) and `packages/overlay` (DOM-only). Anything touching Node/`fetch`/stdio → `apps/*`.
- **Reuse `@caliper/core` and `@caliper/overlay`.** Re-deriving selectors, token matching, or overlay
  rendering is a smell — it exists already.
- **TypeScript strict, no `as` assertions** (fix types at source). LF endings. All code/docs/UI in English.
- **Tests: `packages/core` only** (vitest). Apps are verified by hand — no `*.spec` in apps.
- **`schemaVersion` stays `1`.** New session/annotation fields are additive (`.nullish()` + default) so
  old stored data still parses. Do **not** fork the annotation schema.
- Commit format `feat(scope): summary`, no `Co-Authored-By`. Do not touch the Chrome Web Store (CI does it).

## 3. Ground truth — the existing code (judge "reuse" claims against this)

Monorepo: **pnpm workspaces** (`pnpm@9`), `packages/*` + `apps/*`. Preact + `@preact/signals` in overlay.

**`packages/core` (pure, tested)** — exports (`src/index.ts`):
- `extractContext(element: Element, tokens: TokenMap): ElementContext` — builds the full annotation target
  (selector via `buildSelector`, component chain, `box`, and `styles` matched to design tokens).
- `collectTokens(document): TokenMap` — reads `--*` custom props off `:root/html/body` stylesheets.
- `elementAt(doc, x, y)`, `buildSelector(element)`, `toToon(session): string` (the AXI/TOON compact export).
- `caliperAnnotationSchema` — already carries `author: 'human' | 'agent'` (default `'human'`),
  `concernType: string | null`, `verdict: 'accepted'|'rejected'|'needs-work' | null`, optional `figmaUrl`,
  `screenshot`/`screenshotId`. `target: ElementContext`. **These agent/verdict fields were added for this
  exact flow.**
- `AnnotationSink` interface (`src/session/sink.ts`): `push / read / update / remove / clear`.

**`packages/overlay` (DOM-only, Preact)** — `src/index.tsx`:
- `mountOverlay({ onSubmit, capture? }): OverlayHandle` — the **picker** mode: pointer hover →
  `Highlight`; click → `extractContext(element, tokens)` → `Popover` → emits `AnnotationDraft`
  (`{comment, severity, figmaUrl?, screenshot?, context}`). Mounts a `<div id="caliper-overlay-host">`
  with an open **shadow root** (`createOverlayHost`). Components `Highlight`, `Popover`, `Badge` exist.
  It is **transport-agnostic** — it only calls the `onSubmit`/`capture` callbacks; the caller owns
  transport.

**`apps/qa-extension` (WXT Chrome extension)** — `chromeStorageSink: AnnotationSink` persists to
`chrome.storage`; the content script wires `mountOverlay` and forwards drafts to the background. This is
the human→agent shell. It must keep building; it is **not** to be modified.

## 4. The strategy under review

### D1 — What the zone is marked *over* → **a running dev preview (`localhost`), over the live DOM**
Selectors are real CSS selectors; `extractContext` / `collectTokens` / token matching apply **unchanged**;
the agent's annotation is structurally identical to a QA defect. Design reference (the Figma frame or a
captured screenshot) is **attached** to a question via the existing `figmaUrl` / `screenshot` fields — it
is **not** the host.
- *Rejected:* **static screenshot** (zones become pixel rects → `target.selector`/`styles` become fake →
  de-facto schema fork + screenshot-capture machinery) and **Figma frame** (node ids → fork + Figma API
  at review time).

### D2 — How the overlay reaches the live DOM (no extension) → **an injecting reverse-proxy**
The MCP server runs a local HTTP server on a fixed loopback port that **reverse-proxies** the dev app
(`localhost:3000`) and **injects `<script>`** (the overlay client) into the HTML. The review browser opens
`localhost:PORT`. Because the app and the overlay are then **same-origin**, selectors are real and the
answer POST needs no CORS. Zero changes to the dev app, no extension, framework-agnostic. The proxy must
pass the HMR websocket through.
- *Rejected:* **Vite dev-server plugin/snippet** (most robust — untouched HMR — but assumes Vite + a
  one-time app-config edit) and **Playwright-driven window** (`addInitScript`; robust injection but the
  human interacts with an automated window, not their own browser, plus a heavy dependency). Vite-plugin
  is kept as a documented fallback if the proxy stumbles on HMR.

### D3 — Timing + transport → **blocking tool call, batch Submit, same HTTP server; timeout → async fallback**
`caliper_ask` creates a pending Promise, opens/updates the browser, and awaits. The developer answers all
pending zones and clicks **one Submit** → POST to the local server → the pending Promise resolves →
`caliper_ask` returns the answers to the agent. **No copy-paste.** If the developer steps away, a generous
timeout makes `caliper_ask` return "no answer yet — call `caliper_wait`", which re-awaits the same
resolver (graceful async fallback). Blocking stays the default.

### D4 — Multi-agent (Codex + Claude Code + others, from day one) → **one MCP server + baseline guidance in tool descriptions + per-agent adapters**
The MCP **server** is single and shared (MCP is a standard; Claude Code, Codex, Cursor speak it over
stdio). "When to reach for Caliper" is baked into the **tool descriptions** so any MCP agent (Codex) works
out of the box, and the installer **enriches** per agent where the agent supports richer guidance (Claude
Code skill, Codex `AGENTS.md`, Cursor rules) via an **adapter pattern**:
```ts
interface AgentAdapter {
  id: string;                 // 'claude-code' | 'codex' | ...
  detect(): boolean;
  registerServer(cfg): void;  // write the MCP-server entry into the agent's config
  installGuidance(): void;    // skill / AGENTS.md / rule
}
```
A new agent = **one new adapter**, no installer-core changes. `npx caliper init` asks which agent or
`--global`.
- *Rejected:* **per-agent adapters only** (no portable baseline — more work per agent) and **tool
  descriptions only** (no per-agent skill where the agent could use one).

### The `caliper_ask` contract and anchoring (inverse of the picker)
The agent wrote the code, so it **knows the selectors** of the zones it is unsure about — it passes them.
This is the exact inverse of the QA flow (there a human clicks → a selector is built; here the agent hands
a selector → it is resolved). The agent needs **no live DOM** to ask.
```
caliper_ask({
  target?: "http://localhost:3000",           // default from `caliper init`; tool may override
  zones: [{ ref, selector, route?, question, severity? }]
})
```
On the page, review-mode does `document.querySelector(zone.selector)` → `extractContext(el, tokens)` to
**enrich** into a full `ElementContext` (identical shape to a QA defect). If the selector does not resolve
(zone not built yet, or fuzzy selector), the zone shows in the right-hand panel as "not found on this
route", and the developer can **re-anchor by clicking the real element** — which **reuses the picker mode**.
Guidance tells the agent to pass a `data-testid` / stable selector.

### Review UI (a new **review-mode** added to `packages/overlay`, additive)
Shares `Highlight` / `Popover` / `Badge` / `createOverlayHost` with the picker; new is only the mode +
a **right-hand question panel** (click a question → navigate to its `route`, same-origin, + focus the
highlight), **rectangles** on the page synced to the panel, a hover **popover with an answer field**, and
**one Submit** (batch `onSubmit(answers)`). Each answer lands on the annotation as `verdict` + `comment`,
with `author: 'agent'`, `concernType: 'question'`.

### Result to the agent
Reuse `to-toon`: a sibling `toReviewToon` returning a compact table `ref | selector | question | answer |
verdict`, keyed by zone ref — AXI-shaped, ready to act on, no JSON dump.

### Repo placement → **one monorepo; add `apps/mcp-server`; reuse packages, not the extension**
Deciding test: does the new thing import `@caliper/core`? Yes (and `@caliper/overlay`). The two flows
share their hardest, most central code; the "one format, two directions" thesis only holds if schema +
engine do not drift; splitting forces either duplicating core+overlay or publishing them as versioned npm
(cross-repo bumps on every spine change). A monorepo shares **packages** without coupling **products** —
`qa-extension` ships to the Chrome Web Store, `mcp-server` to npm, independently. The **extension itself**
is **not** reused (different shell: manual install, human-driven picker, `chrome.storage` transport) —
only the packages it already imports are shared.

Target layout:
```
packages/
  core/                    # unchanged
  overlay/                 # + review-mode (shares Highlight/Popover/host)
apps/
  qa-extension/            # untouched
  mcp-server/
    src/                   # Node: stdio MCP, HTTP proxy+inject, session registry
    src/adapters/          # AgentAdapter: claude-code, codex, ...
    client/                # browser glue: HTTP AnnotationSink (fetch), mountReview bootstrap
```

## 5. Where I most want you to push (highest-risk assumptions)

Rank these and add any I missed:

1. **Reverse-proxy robustness (D2).** Is transparently proxying a modern dev server (Vite/Angular/Next)
   and injecting a script actually reliable — HMR websocket upgrade, chunked/streamed HTML, `<base>` and
   absolute asset URLs, SPA client-side routing, CSP/nonce on injected inline script, HTTP/2? Or is this a
   fragility trap where the Vite-plugin (D2 rejected) is the correct default and the proxy is the fallback,
   not the reverse?
2. **Selector-at-ask-time (contract).** Does a coding agent *reliably* know a **stable** selector for a
   zone it is *unsure how to build*? If the region is not yet rendered, or the selector is a generated
   class, does the "re-anchor via picker" fallback quietly become the *main* path — and if so, is the
   selector-first contract the wrong framing?
3. **Blocking a stdio MCP tool call for minutes (D3).** Do Claude Code and Codex actually tolerate a tool
   call that blocks for many minutes, or do they impose tool-call timeouts / heartbeats that make **async
   (ask → returns a ticket → poll `caliper_wait`) mandatory** rather than a fallback?
4. **Overlay seam (review UI).** Does a right-hand list panel + Submit belong inside `packages/overlay`
   (DOM-only, currently a thin picker), or does that bloat a shared package with app-specific UI — should
   the panel live in `apps/mcp-server/client` and the package expose only primitives?
5. **Baseline trigger sufficiency (D4).** Is "when to use" in an MCP tool *description* enough to make a
   non-Claude agent (Codex) actually *reach for* the tool at the right moment, or does it need per-agent
   guidance to fire at all — i.e., is the "works out of the box for any MCP agent" claim real?
6. **Security on loopback.** A local server that proxies arbitrary origins, injects scripts, and resolves
   agent tool calls from browser POSTs — any DNS-rebinding / CSRF / other-tab exposure risk worth a token
   or `Origin` check? Is a fixed port right vs an ephemeral one?
7. **YAGNI / missing.** Is re-anchor-via-picker, the screenshot reference, or the async fallback premature?
   Is anything load-bearing absent (e.g., multi-route session lifecycle, what a zone's `ElementContext`
   holds when the selector never resolves, concurrent `caliper_ask` calls)?

## 6. Output

Give the verdict, the ranked concerns with concrete failure scenarios, and specific corrections. Be
technical and specific; cite the file/decision you are challenging. If you reopen a rejected alternative,
say what evidence makes it the better call.
