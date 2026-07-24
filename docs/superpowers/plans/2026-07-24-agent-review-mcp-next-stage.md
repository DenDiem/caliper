# Next stage — the agent→human review flow (MCP)

**Date:** 2026-07-24
**Status:** exploration, to be brainstormed properly next session — NOT a finalised plan
**Relationship to shipped work:** this is the *reverse* of the QA extension. The extension is
human→agent (a person marks a defect, an agent fixes it). This is agent→human (the agent marks a
zone it is unsure about and asks the developer what to do).

## The idea, in one paragraph

A developer installs Caliper's agent side with one command, and it becomes available to their coding
agent (Claude Code first; others after). Nobody invokes it by hand. When the agent is given a
build-from-design task — "implement this Figma frame", "here is a screenshot, build it", "do this
per the design" — and it hits genuine uncertainty about a specific region ("what exactly should this
zone do / look like?"), it marks that zone and opens a browser where the developer sees the agent's
questions pinned to the actual elements, answers them, and the agent continues with the answers.

It turns the agent's silent guesses into a small, precise conversation anchored to the UI.

## Why the foundation is already here

Two things were built for this without it existing yet:

- **The annotation schema already carries `author: 'human' | 'agent'`, `concernType`, and
  `verdict`.** These were added early precisely so an agent-authored annotation (a question) is the
  same object as a human-authored one (a defect). The reverse flow needs no schema fork.
- **`@caliper/overlay` marks a zone and attaches a popover regardless of who authored it.** Pinning
  Claude's question to an element is the same operation as pinning a QA comment.

So the reverse flow is largely a new *shell* over the existing `core` + `overlay`, plus a transport
between the agent and the browser.

## Rough shape (to be pinned down next session)

Three pieces:

1. **MCP server** — exposes tools the agent calls:
   - `caliper_ask(zones)` — the agent submits regions it is unsure about, each with a question;
     this opens/updates the review browser.
   - `caliper_wait()` — returns the developer's answers (blocking or polled — open question).
   - Annotations are `author: 'agent'`, `concernType: 'question'`, and the developer's reply lands
     as `verdict` / a comment.

2. **Review browser** — a local page rendering the marked zones over the target, showing each
   question, collecting answers. Reuses `@caliper/overlay` and `@caliper/core`. The target it marks
   over is the biggest open question (see below).

3. **One-command install** — `npx caliper init` (or similar) that registers the MCP server in the
   agent's config and drops a skill so the agent knows *when* to reach for it (design-implementation
   tasks where it is uncertain). Claude Code via `claude mcp add` + a skill file; other agents via
   their own MCP/skill mechanisms.

## Open questions for the brainstorm

1. **What is the zone marked *over*?** A running dev preview (`localhost:3000`)? A static
   screenshot? A Figma frame? Each implies a different overlay host and a different notion of
   "selector". This is the decision everything else hangs on.
2. **Blocking or async?** Does the agent's tool call block until the developer answers, or return
   immediately and poll? Blocking is simpler for the agent's reasoning; async survives the developer
   stepping away.
3. **Transport.** In-memory HTTP server in the MCP process that the browser talks to (like the OAuth
   callback we just built), or a file-based `AnnotationSink` the browser watches. `AnnotationSink`
   is already the seam for this.
4. **Which agents beyond Claude Code?** Cursor, Windsurf, Cline, Codex — each has a different
   install surface. Support Claude Code fully first, design the installer to be pluggable.
5. **Is it worth building at all?** The honest one. The QA extension has a clear user today (you,
   on RestoApp). This flow's value is real but less proven — validate the shape on your own agent
   work before investing.

## Repo structure — my recommendation

**Keep it one monorepo. Add `apps/mcp-server` (and a review web app) next to `apps/qa-extension`;
do not spin up a second repo for the agent flow.**

The reasoning, concretely:

- The two flows share their hardest, most central code: `@caliper/core` (the annotation schema, the
  selector engine, token matching) and `@caliper/overlay` (highlight, popover, shadow host). The
  whole thesis is "one annotation format, two directions" — that only holds if the schema and the
  engine do not drift.
- Splitting forces one of two taxes: duplicate `core` + `overlay` across repos and fight drift
  forever, or publish them as versioned npm packages and pay a cross-repo version bump on every
  change to the shared spine. For code this central, that is pure overhead.
- **A monorepo shares packages; it does not couple products.** The two apps already have their own
  `package.json`, version, and release workflow. `qa-extension` ships to the Chrome Web Store on
  `v*` tags; `mcp-server` would ship to npm on its own tag scheme. They release independently while
  importing the same `packages/*`.

Target layout:

```
packages/
  core/          # schema, selectors, tokens        — shared by both flows
  overlay/       # highlight, popover, shadow host   — shared by both flows
apps/
  qa-extension/  # human→agent, Chrome Web Store
  mcp-server/    # agent→human transport, npm
  review-web/    # the page the agent opens (may fold into the extension instead)
```

**The deciding test, applied honestly:** does the new thing `import @caliper/core`? If yes, it
belongs in this repo. If no, it does not — no matter how convenient "one repo" feels.

That test is exactly how to place **Rhythmie**. If Rhythmie shares Caliper's annotation schema or
overlay, it is another app in this monorepo. If Rhythmie is a separate product that shares none of
that spine, it should have its own repo — putting it here just because a single repo is tidy would
dilute what this repo *is* (the Caliper annotation platform) and drag unrelated release concerns
into it. I cannot place Rhythmie without knowing what it shares; that is the first thing to settle.

## Where to start next session

Brainstorm open question #1 (what the zone is marked over) — it determines the overlay host and the
selector model, and nothing downstream can be designed until it is fixed. Then decide #2 and #3
(blocking + transport), which are small once #1 is settled. Only then write an implementation plan.
