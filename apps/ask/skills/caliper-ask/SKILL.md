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

Reach for `caliper_ask` when *you* have specific questions to pin; when you instead want the
developer to freely mark up whatever they want with no questions from you, use `caliper_design`.

## When NOT to use it

If you are confident in the answer — from the design, the existing codebase conventions, or
project rules — just build it. Do not use `caliper_ask` as a substitute for reading the spec,
and do not batch trivial/obvious questions into a review just because the tool is available.
Each call interrupts the developer; only ask what you actually cannot resolve yourself.

## Which dev server (target)

`caliper init` pins one dev-server URL as `CALIPER_TARGET`; it is the default, and the tool
descriptions show its current value. Prefer it: call `caliper_ask` / `caliper_design` with no `target`
and let the pin open the server — do not preflight a guessed port.

If the pin is wrong for the work at hand — you're in a different project than the one it was pinned
for, several dev servers are up, or Caliper was installed globally — read the real target from
configuration, never from a framework's default port:

- the pinned value in `.mcp.json` → `mcpServers.caliper.env.CALIPER_TARGET` (project scope), or the
  same entry in `~/.claude.json` (global);
- the project's own dev-server config — `angular.json` → `serve.options.port`, `vite.config.*` →
  `server.port`, the `dev`/`serve` script in `package.json` — not a remembered "Angular is 4200".

Then pass `target` explicitly. Both tools accept an optional `target` (`http://localhost:<port>`). In
proxy mode (the default) it must be a loopback URL; in snippet mode `caliper_ask` accepts any host,
including a custom hostname or an HTTPS dev server (snippet mode doesn't proxy, so the origin doesn't
shift).

In a multi-app repo (e.g. `client` on one port, `kiosk` on another), pass the app **name** matching the
app you're working on instead of a URL — `target: "client"`, `target: "kiosk"`. Names are resolved from
`caliper.targets.json` (at the project root) or the `CALIPER_TARGETS` env; this avoids a single pinned
`CALIPER_TARGET` silently opening the wrong app across worktrees.

When the developer instead freely marks up the page or asks to open "design mode", that's the
`caliper_design` flow — see the **caliper-design** skill for opening it and reading the marks.

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

## Reaching a page behind a route guard (setup)

If a zone's `route` is behind a guard (auth, app-state, a feature flag) so the developer would be
redirected away before the element ever mounts, add a `setup` snippet to that zone — JavaScript that
brings the app into the state where the guard *passes* (dispatch the store action, seed the flag it
reads), never a bypass. When the developer opens that route, Caliper shows the snippet and asks them to
run or skip it; on run it applies the setup and navigates client-side so the state survives.

```json
{
  "ref": "service-logs",
  "route": "/service-menu/logs",
  "selector": ".sk-logs-page__title",
  "setup": "ng.getComponent(document.querySelector('sk-root')).idleService.store.dispatch({type:'[serviceAuth] Authorization Confirmed'})",
  "question": "…"
}
```

Add `setup` only when the route is genuinely guarded — a normal page needs none. The developer sees and
approves the snippet every time, so keep it minimal and legible; several zones on one guarded route can
share the same `setup`.

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
