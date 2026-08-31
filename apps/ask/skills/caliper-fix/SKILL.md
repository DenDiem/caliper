---
name: caliper-fix
description: Use when you are handed a Jira issue (URL or key) to fix UI defects, when you are given a Caliper QA zip archive directly, or when asked to apply the Caliper fixes on a ticket — pull the QA session Caliper attached and fix from its recorded marks, bug traces and screenshots, offline, without the running app.
---

# Fix UI defects from a Caliper QA session

QA records UI defects in the Caliper QA browser extension — either as **marks** (an element and what
is wrong with it) or as a **bug trace** (a recording of the reproduction) — and hands them over either
on a Jira issue or as a zip. When you are given one to fix, read the recorded session instead of
working from the comment text alone. The comment is a lossy human summary; the session carries the
marks' intent, anchors and style-token matches, and the trace's steps, console, network and store
actions.

## Two ways in

```
caliper pull <jira-url|key>          # QA filed it to a ticket
caliper read <path-to-zip|folder>    # QA sent you the archive directly — no Jira credentials
```

(prefix either with `npx -y @dendiem/caliper@latest` if Caliper isn't installed). `pull` reads the
newest `caliper-*.session.json` attachment on the issue; `read` opens a downloaded zip or the folder
unpacked from one. Both materialise screenshots and trace files under `.caliper/<id>/` and print the
same TOON work list to stdout, and both open with a line naming what the export contains, e.g.
`ABC-123: 3 marks, 1 trace`.

No live app or dev server is needed — the session was recorded earlier.

## What a session can contain

| Artifact | What it is | How you read it |
| --- | --- | --- |
| **marks** | A moment: one element, its selector, component and token-matched styles | Inline in the TOON, per the guide below |
| **trace** | A sequence: steps, DOM replay, console, network, store actions | Summary in the TOON; detail via `caliper trace` |
| **`.webm`** | A video of the reproduction, for the human reading the ticket | **Never open it.** It carries nothing the trace does not, in a form that costs you far more to read |

## Reading a trace

The TOON lists each trace with its duration, label, counts and the path to its `trace.json`. Start
there — the summary usually tells you whether the trace explains the bug.

When you need detail, slice it; do not read the file whole:

```
caliper trace .caliper/<id>/caliper-<id>.trace.json          # every channel
caliper trace <file> --network --console                      # two channels
caliper trace <file> --around 12.4s                           # 2s either side of that moment
```

Every `t` is milliseconds from the trace's start, so a step, a console error and a failed request that
share a timestamp are the same instant. The usual path: read the steps, find the one where the defect
appears, then `--around` that timestamp to see what the app did underneath.

Two notes a summary may carry:

- `network captured in fallback mode` — `chrome.debugger` could not attach while recording (DevTools
  was open on the tab), so request and response **bodies may be missing**. Statuses and timings are
  still accurate.
- `truncated: …` — part of the recording is missing, and the note says **which end**. `length-limit`
  means the recording was stopped and the **end** of the reproduction is absent (the start is intact);
  `buffer-overflow` means the **earliest** events were dropped; `video-window` costs only the video.
  Read the note rather than assuming: trusting the wrong half is the whole reason it is spelled out.

A trace's steps were recorded against the page as it was, so treat their selectors the same way you
treat a mark's: best-effort against the current source.

## Auth (once per machine)

`pull` talks to Jira directly with a read-scoped API token (`read` needs none):

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
