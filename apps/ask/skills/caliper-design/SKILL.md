---
name: caliper-design
description: Use when the developer says they've marked up / annotated the running page, or asks to open "design mode" — call caliper_design to get their marks (picked elements, struck-for-removal, lassoed areas) back as a work list, and read markType / intent / covers / styles to apply them.
---

# Caliper design mode

Design mode is the reverse of `caliper_ask`: instead of you pinning questions, the developer freely
marks up the running UI — picks an element, strikes one for removal, lassoes an area — and hands the
result back as a work list. Reach for it when the developer says they've marked up the page or asks to
open "design mode". (When *you* have specific pinned questions instead, use `caliper_ask`.)

## Opening design mode

Call `caliper_design` when the developer says they've marked up / annotated the page, or asks to
open "design mode" — it opens the review window and returns their marks. While the result says
`status: PENDING`, call `caliper_design` again to keep waiting until they submit.

## Reading design marks

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

## Shared setup — target, proxy/snippet

Design mode opens against the same dev server and uses the same modes as `caliper_ask`. See the
**caliper-ask** skill for picking the target (including named targets in a multi-app repo) and for
switching to snippet mode when the review page looks broken (CORS/OAuth/`allowedDevOrigins`).
