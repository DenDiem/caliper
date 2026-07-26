---
name: caliper-review
description: Use when implementing a design and you are genuinely unsure what a specific UI region should do or look like — stamp data-caliper-ref on the element, then call caliper_ask to get the developer's answer.
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

## MUST: stamp `data-caliper-ref` before asking

Before calling `caliper_ask`, add `data-caliper-ref="<ref>"` to each element you're asking
about, in the code you just wrote. The review page resolves every zone by that attribute — a
zone whose ref isn't present on the page shows up as unresolved and the developer can't see
what you mean.

```html
<div class="empty-state" data-caliper-ref="orders-empty-state">...</div>
<button class="bulk-delete" data-caliper-ref="bulk-delete-cta">...</button>
```

## Worked example

```json
{
  "zones": [
    {
      "ref": "orders-empty-state",
      "selector": "[data-caliper-ref=\"orders-empty-state\"]",
      "route": "/orders",
      "question": "No orders yet: show an illustration + CTA, or just plain text?"
    },
    {
      "ref": "bulk-delete-cta",
      "selector": "[data-caliper-ref=\"bulk-delete-cta\"]",
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
