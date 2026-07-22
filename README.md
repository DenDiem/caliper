# Caliper

Turn a clicked DOM element into a machine-precise defect annotation for an AI coding agent.

Visual bug reporters produce a screenshot and a sentence. Caliper produces a stable selector, the
owning component name, and computed styles already matched against your design tokens — so an agent
can go straight to the file and the variable instead of decoding a picture.

## What is here

| Package | Description |
| --- | --- |
| `packages/core` | Element → annotation logic. No `chrome.*`, no UI framework, portable to any shell. |
| `packages/overlay` | In-page picker UI rendered in a Shadow DOM. |
| `apps/qa-extension` | Chrome MV3 extension for manual QA. |

## Quick start

```bash
pnpm install
pnpm --filter @caliper/qa-extension build
```

Then load `apps/qa-extension/.output/chrome-mv3` via `chrome://extensions` → Load unpacked.

`pnpm --filter @caliper/qa-extension dev` gives you hot reload, but writes a development build to the
same directory: it registers the content script at runtime through the dev server instead of
declaring it in the manifest, so the picker stops working the moment that server is gone. If the
shortcut list shows `Alt+R — Reload the extension during development`, you are running the dev build.

Click the toolbar icon to arm the picker, click an element, describe the defect, save. Open the side
panel to review and export.

## Output

```json
{
  "schemaVersion": 1,
  "annotations": [
    {
      "comment": "Padding is too small",
      "severity": "minor",
      "target": {
        "selector": "soa-inform-block p.info",
        "selectorConfidence": "medium",
        "componentName": "soa-inform-block",
        "componentSource": "tag-heuristic",
        "styles": {
          "padding-top": {"value": "4px", "token": "--spacing-1", "tokenMatch": "exact"},
          "color": {"value": "rgb(51, 51, 51)", "token": "--color-text-primary", "tokenMatch": "exact"}
        }
      }
    }
  ]
}
```

Screenshots live in a separate `assets` map keyed by `screenshotId`, and are omitted from
`Copy JSON` by default.

## License

MIT
