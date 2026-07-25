# @caliper/mcp-server

An MCP server that lets a coding agent stop guessing about ambiguous UI regions. While
implementing a design, the agent marks the elements it is unsure about, calls a tool, and a
browser opens against your running dev preview with those questions pinned to the live elements.
You answer them in place; the answers flow straight back to the agent as structured data.

## Install

```bash
npx @caliper/mcp-server init
```

This registers the MCP server with your coding agent and installs the `caliper-review` skill so
the agent knows when and how to use it.

Flags:

| Flag | Default | Description |
| --- | --- | --- |
| `--agent claude-code\|codex` | every detected agent | Install for one agent only |
| `--global` | project-local | Install into the user-global config instead of the current project |
| `--target <url>` | `$CALIPER_TARGET` or `http://localhost:3000` | Loopback dev-server URL to review |
| `--mode proxy\|snippet` | `proxy` | See Modes below |
| `--port <n>` | `4599` | Snippet server port, snippet mode only |

`caliper uninstall [--global] [--agent <id>]` removes the registration and installed guidance.

## Modes

**Proxy** (default) — Caliper runs a loopback HTTP proxy in front of your dev server and injects
its review client into the HTML it forwards. Zero changes to your app.

**Snippet** — for apps where the proxy's origin shift breaks something the proxy can't fix: API
CORS checks, an OAuth redirect, Next.js `allowedDevOrigins`. Re-run with `--mode snippet`, then
add the one line `caliper snippet` prints to your app's root HTML (e.g. `index.html`):

```bash
npx @caliper/mcp-server snippet
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

The full contract and a worked example ship as the `caliper-review` skill, installed by `init`.

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
