---
name: caliper-fix
description: Use when you are handed a Jira issue (URL or key) to fix UI defects, or asked to apply the Caliper fixes on a ticket — pull the QA session Caliper attached and fix from its recorded marks and screenshots, offline, without the running app.
---

# Fix UI defects from a Jira ticket (caliper pull)

QA marks UI defects in the Caliper browser extension and files them to a Jira issue. When you are
handed that issue to fix — a URL or a bare key, with or without the word "Caliper" — pull the
recorded session instead of working from the comment text alone. The comment is a lossy human
summary; the pulled session carries the marks' intent, anchors, style-token matches and screenshots.

## Pull the session

```
caliper pull <jira-url|key>
```

(or `npx -y @dendiem/caliper@latest pull <url>` if Caliper isn't installed). It reads the newest
`caliper-*.session.json` attachment on the issue, materialises its screenshots under `.caliper/<id>/`,
and prints a TOON work list to stdout. No live app or dev server is needed — the session was captured
earlier.

## Auth (once per machine)

`pull` talks to Jira directly with a read-scoped API token:

- `CALIPER_JIRA_SITE` — your team (e.g. `your-team` or `your-team.atlassian.net`)
- `CALIPER_JIRA_EMAIL` — your Atlassian login email
- `CALIPER_JIRA_TOKEN` — an API token from https://id.atlassian.com/manage-profile/security/api-tokens

If they're unset the command prints exactly which to set. A read token is enough — `pull` never writes
to the ticket.

## Read the marks

The output is the **same shape** `caliper_design` returns, so read it the same way — `markType`
(`element` vs a derived `area`/`strike`, where you trust `covers`/`bbox` over the selector), `intent`
(`change`/`remove`/`add`, with the `add` `anchor` giving the insertion point), and the `styles` token
table (match each `value` to the design-token variable of the same name before hardcoding). The
**caliper-design** skill has the full mark-reading guide and how to locate a mark's source file from its
`component` + `selector` — the same reading applies here.

Selectors were recorded against the page at review time, so treat them as best-effort against the
current source. If a mark is genuinely ambiguous and the dev server is running, you can open a live
`caliper_design` to have the developer re-point — but usually the recorded marks plus screenshots are
enough to fix directly.

## Not a Caliper ticket?

If the issue has no `caliper-*.session.json` attachment, `pull` says so — it isn't Caliper-managed, so
fix it the usual way. `pull` only reads context; it never moves the ticket's status — leave that to the
developer.
