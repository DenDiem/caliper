# @dendiem/caliper

<p align="center">
  <img alt="MCP server" src="https://img.shields.io/badge/MCP-server-4f7cff?labelColor=13161d">
  <a href="https://www.npmjs.com/package/@dendiem/caliper"><img alt="npm" src="https://img.shields.io/npm/v/@dendiem/caliper?labelColor=13161d&color=cb3837&logo=npm&logoColor=white"></a>
  <a href="https://github.com/DenDiem/caliper/actions/workflows/ci.yml"><img alt="CI" src="https://img.shields.io/github/actions/workflow/status/DenDiem/caliper/ci.yml?branch=main&label=ci&labelColor=13161d&logo=githubactions&logoColor=white"></a>
  <a href="../../LICENSE"><img alt="License: MIT" src="https://img.shields.io/github/license/DenDiem/caliper?label=license&labelColor=13161d&color=blue"></a>
  <a href="https://discord.gg/gVgasNbNc"><img alt="Discord" src="https://img.shields.io/discord/561608843080237066?label=discord&labelColor=13161d&color=5865F2&logo=discord&logoColor=white"></a>
  <a href="https://t.me/dendiem"><img alt="Telegram" src="https://img.shields.io/badge/telegram-%40dendiem-26A5E4?labelColor=13161d&logo=telegram&logoColor=white"></a>
  <a href="https://www.linkedin.com/in/dendiem/"><img alt="LinkedIn" src="https://img.shields.io/badge/linkedin-dendiem-0A66C2?labelColor=13161d&logo=linkedin&logoColor=white"></a>
  <a href="https://secure.wayforpay.com/tips/t81c7016f0f4a"><img alt="Tips" src="https://img.shields.io/badge/tips-%E2%98%95_buy_me_a_coffee-ff813f?labelColor=13161d"></a>
</p>

An MCP server that lets a coding agent — Claude Code, Codex, Cursor or any MCP client — stop
guessing about ambiguous UI regions. While implementing a design, the agent marks the elements it
is unsure about, calls a tool, and a browser opens against your running dev preview with those
questions pinned to the live elements. You answer them in place; the answers flow straight back to
the agent as structured data. It also ships a **design mode** for the reverse direction — see below.

![The agent asks about ambiguous UI, you answer on the live page, the answers flow back as a compact table](../../docs/media/ask/review-flow.gif)

## Install

```bash
npx @dendiem/caliper init
```

This registers the MCP server with your coding agent and installs the `caliper-ask` skill so
the agent knows when and how to use it.

By default the registered entry **auto-updates**: it runs `npx -y @dendiem/caliper@latest serve`,
so each agent launch resolves the latest published version (the same way big MCP servers such as
Playwright are set up). Pass `--pinned` to lock the entry to the current install
(`node <path>/dist/server.js`) instead — useful for offline or reproducible setups.

Flags:

| Flag                         | Default                                      | Description                                                        |
| ---------------------------- | -------------------------------------------- | ------------------------------------------------------------------ |
| `--agent claude-code\|codex` | every detected agent                         | Install for one agent only                                         |
| `--global`                   | project-local                                | Install into the user-global config instead of the current project |
| `--target <url>`             | `$CALIPER_TARGET` or `http://localhost:3000` | Loopback dev-server URL to review                                  |
| `--mode proxy\|snippet`      | `proxy`                                      | See Modes below                                                    |
| `--port <n>`                 | `4599`                                       | Snippet server port, snippet mode only                             |
| `--pinned`                   | auto-update (`npx @latest`)                  | Pin the entry to this install instead of resolving `@latest`       |

`caliper uninstall [--global] [--agent <id>]` removes the registration and installed guidance.

## Modes

**Proxy** (default) — Caliper runs a loopback HTTP proxy in front of your dev server and injects
its review client into the HTML it forwards. Zero changes to your app.

**Snippet** — for apps where the proxy's origin shift breaks something the proxy can't fix: API
CORS checks, an OAuth redirect, Next.js `allowedDevOrigins`. Re-run with `--mode snippet`, then
add the one line `caliper snippet` prints to your app's root HTML (e.g. `index.html`):

```bash
npx @dendiem/caliper snippet
```

Remove the tag once the review is done.

## Using it from an agent

1. Anchor each zone with an ordinary CSS selector for an element already on the page — never
   edit the app's source to add anchors. Include the zone's `route` (the path that element is
   on); no reliable selector yet (region not built, or you're unsure)? Ask anyway — the developer
   can click the region to point at it.
2. Call `caliper_ask` with the zones (ref, selector, route, question). It opens (or reuses) a
   browser session and returns the developer's answers keyed by `ref`.
3. If the result contains `status: PENDING`, not every zone was answered within the wait window.
   Call `caliper_wait` with the returned `ticket` to keep waiting.

The full contract and a worked example ship as the `caliper-ask` skill, installed by `init`.

## Design mode

The same server also ships a **design mode** for the opposite situation: instead of the agent asking
pinned questions, _you_ freely mark up the running UI and hand the result back. The agent calls
`caliper_design`, a browser opens against your dev preview, and you pick an element, strike one for
removal, or lasso an area when no single element fits — then hit **Send to agent**. Your marks come
back as a compact TOON work list keyed by selector, component and design-token-matched styles, and
the window closes.

It is the design-review loop Cursor's Design Mode popularised, but native to Claude Code, Codex and
any MCP client — precise, element-pinned and text-first, so the agent fixes from the file rather than
a screenshot.

## Remote / containers

The review URL is always printed in the tool result, even when the browser can't be opened
automatically (headless, WSL, SSH, devcontainer). If the agent runs somewhere that can't reach
`127.0.0.1` directly on your machine, forward the port — VS Code's automatic port forwarding,
`ssh -L <port>:127.0.0.1:<port>`, or a devcontainer `forwardPorts` entry — then open the printed
URL yourself.

## Security

- The review server binds to `127.0.0.1` only — never reachable off the local machine.
- Every session gets its own capability token; the review client authenticates every API call
  with it, checked in constant time.
- Origin and Host are validated on every request, so another site or process can't drive an
  active review session.
- Snippet mode hands the session token to any caller presenting the app's Origin — necessary
  because a static `<script>` tag can't carry a per-session token — so it assumes no untrusted
  local process is running. Proxy mode (the default) never exposes that endpoint at all.

## License

MIT
