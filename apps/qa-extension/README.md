# @caliper/qa-extension

Chrome MV3 shell around `@caliper/core` and `@caliper/overlay`, built with [WXT](https://wxt.dev).

## Develop

```bash
pnpm --filter @caliper/qa-extension dev
```

Load `.output/chrome-mv3` via `chrome://extensions` → Developer mode → Load unpacked. `wxt build`
produces the same directory without the dev server.

## How the pieces talk

| Entry point | Responsibility |
| --- | --- |
| `entrypoints/content.ts` | Mounts the overlay, turns a draft into a `CaliperAnnotation`, sends it to the background. |
| `entrypoints/background.ts` | Toolbar click → open side panel and toggle the picker. Owns storage and screenshot capture. |
| `entrypoints/sidepanel/` | Session list, remove/clear, export. |
| `sinks/chrome-storage.sink.ts` | `AnnotationSink` over `chrome.storage.local`; screenshots go to `assets`, not into the annotation. |
| `screenshot/capture.ts` | `captureVisibleTab` cropped to the element with 16px padding via `OffscreenCanvas`. |

## Shortcuts

| Input | Action |
| --- | --- |
| Toolbar icon | Open or close the side panel |
| `Alt+Shift+C` | Arm or disarm the picker |
| `Alt+Shift+P` | Open the side panel |
| `Escape` | Dismiss the popover, then disarm the picker |

The picker is armed from the panel's **Arm picker** button or the shortcut — never by opening the
panel, so the icon stays a safe thing to click.

Rebind them at `chrome://extensions/shortcuts`. The picker only inspects the page while it is armed,
and recomputes at most once per animation frame, and only when the cursor crosses into a different
element.

## Export

**Copy TOON** — the smallest payload for an agent: three tables (`session`, `annotations`,
`styles`) with explicit row counts, no braces or quotes.

**Copy JSON** — the same data as JSON, `assets` stripped.

**zip** — a single `caliper-<id>.zip`:

```
caliper-<id>/
  session.json     annotations with a relative `screenshot` path, no inline base64
  session.toon     the same session in TOON, ready to paste into an agent
  <id>.png         one cropped screenshot per annotation
```

The JSON points at the PNGs by path instead of carrying base64, so an agent reads the structure
cheaply and opens an image only when the structure was not enough.
