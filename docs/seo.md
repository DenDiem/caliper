# SEO & discoverability

**Strategy in one line:** keep the distinctive brand token **Caliper** (people can search it
exactly), and load the *category* keywords into the store description, GitHub topics and README H1.
Do **not** try to rank for the bare phrase "design mode" — that SERP is owned by Cursor / Framer /
Webflow. Rank for the clean qualified combos instead: `caliper mcp`, `caliper claude code`,
`caliper chrome extension` (all empty today — first publish owns them).

> Bare `caliper` collides with Hyperledger Caliper (a blockchain benchmark) and brake calipers /
> vernier calipers. Never rely on the bare word — always the qualified combo.

---

## Chrome Web Store — the QA extension

The CWS **name and description are both indexed** (by the store search and by Google), and the name
can be up to 75 chars. Use that budget for keywords.

**Name** (≤75)
```
Caliper QA — UI Marks & Bug Traces for AI Coding Agents
```

**Summary** (≤132)
```
Mark up any web UI or record a bug trace — DOM, console, network and store — and hand it to Claude Code, Cursor or any AI agent.
```

**Keywords to weave into the description** (the store has no separate tags field — the description
body is what gets indexed):
> design mode, UI annotation, visual feedback, AI coding agent, Claude Code, Cursor, MCP,
> Model Context Protocol, QA, bug report, bug trace, session replay, repro, design review,
> human-in-the-loop, front-end, devtools

Lead the first two sentences of the description with the highest-value phrases ("Design Mode",
"UI annotation for AI coding agents", "Claude Code / Cursor") — the store weights the opening.

---

## GitHub — the repo page

**About / description** (Settings → the ⚙ next to *About*; ≤350 chars, indexed by Google)
```
Design Mode & UI annotation for AI coding agents. Mark up any web page — click, strike, or lasso an element — and hand Claude Code or Cursor a precise, element-pinned change list. Chrome extension + MCP server, both directions.
```

**Topics** (Settings → Topics, up to 20 — GitHub's topic pages are indexed and searchable)
```
design-mode  ai-agents  coding-agent  claude-code  cursor  mcp  model-context-protocol
chrome-extension  ui-annotation  visual-feedback  human-in-the-loop  qa  design-review
devtools  frontend  preact  wxt  developer-tools
```
Apply both in one command:
```bash
gh repo edit DenDiem/caliper \
  --description "Design Mode & UI annotation for AI coding agents. Mark up any web page — click, strike, or lasso an element — and hand Claude Code or Cursor a precise, element-pinned change list. Chrome extension + MCP server, both directions." \
  --add-topic design-mode --add-topic ai-agents --add-topic coding-agent --add-topic claude-code \
  --add-topic cursor --add-topic mcp --add-topic model-context-protocol --add-topic chrome-extension \
  --add-topic ui-annotation --add-topic visual-feedback --add-topic human-in-the-loop --add-topic qa \
  --add-topic design-review --add-topic devtools --add-topic frontend --add-topic preact --add-topic wxt \
  --add-topic developer-tools
```

**README H1 subtitle** — the first line under the title is what Google shows as the snippet. Keep
the keywords in it (already updated in `README.md`).

---

## Why the combos, not the bare terms

| Term | Verdict |
| --- | --- |
| `caliper` (bare) | Polluted — Hyperledger Caliper, brake calipers. Don't rely on it. |
| `caliper mcp` / `caliper claude code` / `caliper chrome extension` | **Empty SERP today — own them with the first publish.** |
| `design mode` (bare) | Unwinnable — Cursor/Framer/Webflow. Capture it only *inside* description + topics, never as the sole target. |
| `ui annotation for ai agents`, `human-in-the-loop ui` | Long-tail, low competition — worth a sentence in each description. |

**Practical test before shipping any copy:** search the phrase in quotes + `github` +
`chrome extension`. If page one isn't potentially yours, the phrase is too crowded — pick a
qualified combo instead.
