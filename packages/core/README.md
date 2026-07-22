# @caliper/core

Element → annotation logic. Pure functions over a `Document`: no `chrome.*`, no UI framework, no
build step of its own. Any shell — a Chrome extension today, a Playwright driver tomorrow — reuses
this package unchanged.

## Surface

| Export | Purpose |
| --- | --- |
| `caliperAnnotationSchema`, `caliperSessionSchema` | Zod schemas and the inferred types. `schemaVersion` is `1`. |
| `buildSelector(element)` | Stable selector with a strategy and a confidence level. |
| `resolveComponent(element)`, `buildComponentChain(element)` | Owning component name, dev-mode global first, custom-element tag as fallback. |
| `collectStyles(element)`, `STYLE_ALLOWLIST` | Curated computed styles, under 50 properties. |
| `collectTokens(document)`, `matchToken(value, tokens)`, `toStyleValues(styles, tokens)` | Design-token map and colour-aware matching (CIE76, ΔE < 3 counts as `nearest`). |
| `extractContext(element, tokens)` | Everything above, assembled into an `ElementContext`. |
| `elementAt(document, x, y)` | Picker target resolution. |
| `AnnotationSink` | Storage contract implemented by each shell. |

## Tests

```bash
pnpm --filter @caliper/core test
```

The boundary is enforced by ESLint, not by convention: `no-restricted-globals` rejects `chrome` and
`browser` anywhere under `packages/`.
