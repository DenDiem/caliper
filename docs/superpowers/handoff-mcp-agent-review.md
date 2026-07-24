# Handoff prompt — build the Caliper MCP (agent→human review flow)

Paste everything below the line to a fresh agent working in this repo. It is written to be
self-contained; the agent has no memory of the design sessions.

---

You are implementing a new part of **Caliper**, a monorepo you are already inside. Read this whole
prompt, then the linked files, before writing any code.

## What Caliper is

Caliper turns a UI element into a machine-precise annotation `{selector, component, styles matched
to design tokens, screenshot, comment, severity}`. It ships two directions of the same annotation:

- **human→agent** (already built): a QA person clicks a broken element in a Chrome extension; an AI
  agent later reads the export and fixes it. Lives in `apps/qa-extension`.
- **agent→human** (your job): when a coding agent is implementing a design and is *unsure* about a
  specific region, it marks that region with a question and opens a browser where the developer
  answers, then the agent continues. This is the MCP server.

The whole thesis is *one annotation format, two directions*. Your work must reuse the shared spine,
not fork it.

## Read these first, in order

1. `docs/superpowers/plans/2026-07-24-agent-review-mcp-next-stage.md` — the vision, the open
   questions, and the repo-structure decision. This is your primary brief.
2. `docs/design/2026-07-22-caliper-design.md` — the original design and the AXI (agent-ergonomic)
   principles the exports follow.
3. `packages/core/src/schema/annotation.schema.ts` — the annotation and session schema. Note it
   already carries `author: 'human' | 'agent'`, `concernType`, and `verdict` — added precisely for
   your flow. An agent's question is the same object as a human's defect.
4. `packages/core/src/session/sink.ts` — `AnnotationSink` and `SessionHistory` interfaces. The sink
   is the seam between logic and transport; a new transport is a new sink, not a schema change.
5. `packages/overlay/src/` — `mountOverlay`, the shadow-DOM host, highlight, popover. Marking a zone
   and pinning a question to it is the same operation the QA picker already does.
6. `packages/core/src/selector/build-selector.ts` and `context/extract-context.ts` — how an element
   becomes a stable annotation. Reuse, don't reinvent.

## Non-negotiable constraints (the repo enforces most with lint)

- **Monorepo boundaries.** `packages/**` must contain zero `chrome.*`, zero `browser.*`, and no
  Node-only APIs — ESLint `no-restricted-globals` fails the build otherwise. Shared logic goes in
  `packages/core` (pure) and `packages/overlay` (DOM-only). Anything touching Node/`fetch`/stdio
  goes in `apps/mcp-server`.
- **Reuse `@caliper/core` and `@caliper/overlay`.** If you find yourself re-deriving selectors,
  token matching, or overlay rendering, stop — it exists.
- **TypeScript strict, no `as` assertions** (ESLint `consistent-type-assertions: never`) — fix types
  at the source. LF line endings. Code, comments, README, UI copy in **English**.
- **Tests: `packages/core` only.** Pure, load-bearing functions get vitest tests. Shells
  (`apps/*`) are verified by hand — do not add `*.spec`/test files there.
- **`schemaVersion` stays `1`.** New session fields are added as `.nullish()` with a default, so old
  stored data still parses (see how `task`/`closedAt` were added on `feat/task-sessions`).
- Commit after every task: `feat(scope): summary`, no `Co-Authored-By`.
- Do NOT run `wxt submit` or touch the Chrome Web Store — publishing is automated in CI.

## START HERE: brainstorm before designing (do not skip)

Invoke the `superpowers:brainstorming` skill and settle the open questions with the user. The design
hangs on the first one — do not write an implementation plan until it is answered:

1. **What is the zone marked *over*?** The single load-bearing decision. Options:
   - a **running dev preview** (`localhost:3000`) — the overlay mounts over the live DOM, selectors
     are real CSS selectors (reuses everything as-is);
   - a **static screenshot** (e.g. the Figma export or a captured frame) — "zones" are pixel rects,
     not DOM selectors; the overlay renders over an image, and `build-selector` does not apply;
   - a **Figma frame** — zones are node ids.
   These imply different overlay hosts and different meanings of "selector". Get a decision.
2. **Blocking or async?** Does the agent's tool call block until the developer answers, or return
   immediately and poll? Blocking is simpler for the agent's reasoning; async survives the developer
   stepping away. Recommend blocking with a generous timeout.
3. **Transport.** In-memory HTTP server in the MCP process that the review page talks to (mirror the
   local-callback pattern already used for the OAuth token flow), or a file-based `AnnotationSink`
   the page watches. Prefer the HTTP server for a blocking flow.
4. **Which agents beyond Claude Code?** Support Claude Code fully first (MCP over stdio + an
   installable skill). Design the installer so Cursor/Windsurf/Cline/Codex can be added later, but
   do not build them yet.

## "Where do you open it?" — the review browser

This is the part the user specifically wants nailed down. Recommended shape, to confirm during the
brainstorm:

- The MCP server is a local Node process (stdio transport for Claude Code).
- When the agent calls the `ask` tool, the server starts (or reuses) a **local HTTP server on a
  fixed loopback port**, serves a small review page built from `@caliper/overlay`, and **opens the
  default browser at `http://localhost:PORT`** (via the `open` package or `start`/`xdg-open`). Same
  pattern as the OAuth loopback flow already in this repo's history.
- The review page renders the agent's marked zones with their questions (popover from
  `@caliper/overlay`), the developer types answers, the page POSTs them back to the local server.
- The server resolves the pending tool call with those answers (blocking) or stores them for the
  next poll (async).
- The tool result handed back to the agent is AXI-shaped: compact, the answers keyed to zone ids,
  ready to act on — follow the format rules in the design doc.

## Rough target layout (confirm, then build)

```
packages/
  core/          # unchanged spine — extend only if the schema genuinely needs it
  overlay/       # reused; may gain a "review mode" that renders agent questions read-first
apps/
  qa-extension/  # do not disturb; its store build must keep passing
  mcp-server/    # NEW — Node, stdio MCP, local HTTP review server, `open`s the browser
```

Tools the MCP server exposes (names to finalise):
- `caliper_ask({ target, zones: [{ ref, question }] })` — mark zones, open the review browser.
- `caliper_wait()` / result of `ask` — return the developer's answers.

## The workflow to follow

1. `superpowers:brainstorming` → settle the open questions → write a design doc to
   `docs/superpowers/specs/YYYY-MM-DD-mcp-agent-review-design.md`, get the user's approval.
2. `superpowers:writing-plans` → a task-by-task implementation plan.
3. `superpowers:executing-plans` (or subagent-driven) → build it, commit per task, verify.

## What NOT to do

- Do not build the Jira API integration — that is a separate, already-written spec
  (`docs/superpowers/specs/2026-07-23-jira-integration-design.md`).
- Do not fork the annotation schema — extend it additively if at all.
- Do not put `chrome.*`, `fetch`, or Node APIs in `packages/**`.
- Do not skip the brainstorm because the vision "seems clear" — open question #1 is genuinely
  unresolved and everything depends on it.
