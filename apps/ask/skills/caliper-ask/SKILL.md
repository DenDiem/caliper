---
name: caliper-ask
description: Use when implementing a design and you are genuinely unsure what a specific UI region should do or look like — anchor the region with a CSS selector and call caliper_ask to get the developer's answer, without editing the app's source.
---

# Caliper review

Caliper lets you ask the developer a direct question about a UI region, in the running dev
page, instead of guessing. It opens (or reuses) a browser session pointed at the pinned dev
server, highlights the zones you flagged, and returns the developer's answers.

## When to use it

Use `caliper_ask` when you are implementing a design and hit a region where the spec is
genuinely ambiguous: unclear empty/error state, an interaction that could reasonably go two
ways, spacing or copy that isn't specified, or a component whose behavior isn't covered by
the design system rules you have.

## When NOT to use it

If you are confident in the answer — from the design, the existing codebase conventions, or
project rules — just build it. Do not use `caliper_ask` as a substitute for reading the spec,
and do not batch trivial/obvious questions into a review just because the tool is available.
Each call interrupts the developer; only ask what you actually cannot resolve yourself.

## Which dev server (target)

`caliper init` pins one dev-server URL (`CALIPER_TARGET`), used as the default. If that default is
wrong for the work at hand — you're in a different project than the one it was pinned for, several
dev servers are up on different ports, or Caliper was installed globally — don't rely on the pin:
read the project's dev port from its config (Vite → `5173`, Angular → `4200`, Next / CRA → `3000`,
or whatever the `dev`/`serve` script uses) and pass `target` explicitly. Both `caliper_ask` and
`caliper_design` accept an optional `target` (`http://localhost:<port>`); it must be a loopback URL.

## Reading design marks (caliper_design)

Each mark block leads with `markType`:

- `element` — a deliberately picked element; `selector` is a real choice, act on it directly.
- `area` / `strike` — the loop had no single owning element, so `selector` is a *derived* anchor
  (often a container). Trust `covers` (the elements the area sits on, with % coverage) and `bbox`
  over the selector; never treat a container-level selector as the intended target.

`intent` is the action: `change` (restyle), `remove` (delete the element), `add` (insert a new one).
For `add`, `anchor` gives the position relative to the target — `after` / `before` / `inside-start` /
`inside-end` / `replace` → `<target>` — so "add a chart here" means a *new* sibling/child, not a
replacement of what is there.

If a mark is still ambiguous — a container-level selector, or you can't tell which element is meant —
resolve it by calling `caliper_ask` so the developer can point on the page, **not** by asking in chat.
Reserve chat for *lexical or scope* questions (an unclear word, whether to also delete a component's
files) — anything answered with words rather than a click.

## Finding a mark's source file

Caliper cannot emit a `file:line` — a running page carries no template source location. Use the
`component` a mark reports (e.g. `app-recent-activity`) plus its `selector` to locate the source
yourself: grep the repo for the component, then the class/attribute in the selector. Start from the
`component`, not a blind text search — it usually lands you in one or two files.

## Anchor with a selector — never edit the app to add one

Anchor each zone with an ordinary CSS `selector` for an element that already exists on the
page. Do not modify the app's source to place an anchor — no new attributes, no new classes,
no markup changes just to make a zone resolvable. Use whatever already identifies the element:
a class, a tag + `:nth-of-type`, an existing `id` or `data-testid`, anything stable.

Mark each zone's `route` (the path that element is on). A review can span multiple pages — the
developer drives the real app to get there, including logging in or working through a flow to
reach gated pages — and each page's questions light up in the panel as the developer arrives.

If you can't give a reliable selector — the region isn't built yet, or you're not sure which
element you mean — ask anyway. Leave `selector` off or best-effort it; the developer can click
the real element on the page to point at it.

`data-caliper-ref="<ref>"` is still supported, but only as an optional convenience: use it only
when you're already authoring brand-new markup from scratch and want a guaranteed-stable anchor
for it. Never add it to existing elements solely to satisfy Caliper.

```html
<div class="empty-state">...</div>
<button class="bulk-delete" type="button">...</button>
```

## Worked example

```json
{
  "zones": [
    {
      "ref": "orders-empty-state",
      "selector": ".orders-empty-state",
      "route": "/orders",
      "question": "No orders yet: show an illustration + CTA, or just plain text?"
    },
    {
      "ref": "bulk-delete-cta",
      "selector": "[data-testid=\"bulk-delete\"]",
      "route": "/orders",
      "question": "Should bulk delete require a confirm modal, or is inline undo enough?"
    }
  ]
}
```

Call the `caliper_ask` tool with this payload. It returns the developer's answers as a table
keyed by `ref` — match each row back to the zone with the same `ref` and apply that answer.

## PENDING results

If the result text contains `status: PENDING`, not every zone was answered within the wait
window — the review is still open. Call `caliper_wait` with the `ticket` from that result to
keep waiting for the remaining answers; it resolves the same way once they come in.

## If the review page looks broken

Default is proxy mode — nothing to change in the app. If the page shows failing API calls with
CORS errors, an OAuth redirect bouncing out, or a Next.js `allowedDevOrigins` warning, that's an
origin shift proxy mode cannot fix. Switch to snippet mode: re-run `caliper init --mode snippet`,
add the `<script>` line from `caliper snippet` to the app's root HTML (e.g. `index.html`), restart
the agent, and remove the line once the review is done.
