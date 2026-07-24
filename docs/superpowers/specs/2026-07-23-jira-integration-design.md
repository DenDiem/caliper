# Jira integration — design

**Date:** 2026-07-23
**Status:** approved for planning
**Depends on:** `feat/task-sessions` (session `task` field, session history, `toJiraComment`)

## Goal

Post a Caliper session into the Jira issue it was recorded against, without leaving the browser and
without a server in the middle.

## Decisions already taken

**Authentication: API token, not OAuth.** Atlassian 3LO requires `client_secret` on the
authorization-code exchange and does not support PKCE, so a browser extension cannot be a public
OAuth client. OAuth would force a hosted proxy holding that secret — a permanent operational
dependency and a single point of failure for every user, plus a third party that credentials pass
through. An API token keeps every request between the user's browser and the user's own Jira.

**One connection.** A single Jira instance per installation. Multiple instances are not in scope.

**Data leaves the machine only on an explicit action.** No background sync, no telemetry. Pressing
*Send to Jira* is the only thing that produces a network request.

## Scope

In:

- connect / disconnect a single Jira Cloud instance
- verify the connection and show who is authenticated
- post the active session as one comment on the session's issue
- upload each screenshot as an attachment on that issue
- report failures in the panel with an actionable message

Out:

- creating issues or sub-tasks
- reading anything from Jira beyond identity verification
- Jira Data Center / Server (they need PAT bearer auth; revisit if asked for)
- syncing verdicts back from Jira

## Storage

One record under `caliper.jira` in `chrome.storage.local`:

```ts
interface JiraConnection {
  baseUrl: string;      // https://acme.atlassian.net, no trailing slash
  email: string;
  token: string;        // Atlassian API token
  accountName: string;  // display name from /myself, shown in the UI
}
```

**`storage.local`, never `storage.sync`.** Sync replicates through the user's Google account to
every device and into Google's cloud; third-party credentials must not travel that way.

The token is stored in clear text — `chrome.storage.local` offers no encryption, and any key the
extension could use to encrypt it would ship inside the same bundle. What protects it is the
browser profile boundary, the same one that protects saved passwords. This is stated plainly in the
privacy policy rather than dressed up.

## Permissions

Atlassian hosts are **not** added to `host_permissions`. The manifest declares:

```ts
optional_host_permissions: ['https://*.atlassian.net/*']
```

and the extension calls `chrome.permissions.request({origins: [`${baseUrl}/*`]})` when the user
connects, scoped to the instance they typed.

Until someone connects, the extension holds no access to any Atlassian domain. During store review
this is the difference between "permanent access to every Atlassian domain" and "access to one
host the user entered by hand".

`chrome.permissions.remove` runs on disconnect.

## Network

Three requests, all direct to the user's Jira, authenticated with
`Authorization: Basic base64(email:token)`.

| Call | Endpoint | Purpose |
| --- | --- | --- |
| Verify | `GET /rest/api/3/myself` | confirm credentials, read `displayName` |
| Comment | `POST /rest/api/3/issue/{key}/comment` | the session as one comment |
| Attach | `POST /rest/api/3/issue/{key}/attachments` | one screenshot per annotation |

The attachment endpoint additionally requires `X-Atlassian-Token: no-check` and a
`multipart/form-data` body with the field name `file`. Screenshots are held as data URLs, so each is
converted to a `Blob` before upload.

CORS does not apply: an MV3 extension holding a host permission issues cross-origin requests from a
privileged context.

## Comment format

API v3 takes **Atlassian Document Format**, not wiki markup, so a dedicated renderer is needed:

```ts
toJiraAdf(session: CaliperSession): AdfDocument
```

A pure function in `@caliper/core`, tested like the other exporters. Structure:

- `heading` (level 3) — `Caliper — N defects`
- `table` — one row per defect: index, severity, component, selector, comment, matched design token
- `bulletList` — pages tested
- `paragraph` — note naming the attached screenshots, only when the session has any

`toJiraComment` (wiki markup) stays as-is for manual copying; the two renderers share the row
selection logic but not the serialisation.

> **To verify during implementation:** whether Jira Cloud still accepts a wiki-markup string on
> `/rest/api/2/issue/{key}/comment`. If it does, the v2 path can reuse `toJiraComment` and ADF
> becomes optional. The documentation page could not be retrieved while writing this spec, so the
> design assumes ADF and treats v2 as an optimisation to confirm, not a dependency.

## Module boundaries

| Unit | Location | Depends on |
| --- | --- | --- |
| `toJiraAdf` | `packages/core/src/export/to-jira-adf.ts` | schema only — no `chrome.*`, no `fetch` |
| `JiraClient` | `apps/qa-extension/src/jira/jira-client.ts` | `fetch`, connection record |
| `jira-connection.ts` | `apps/qa-extension/src/jira/` | `chrome.storage`, `chrome.permissions` |
| Options page | `apps/qa-extension/src/entrypoints/options/` | the two above |
| Panel button | existing side panel | `JiraClient`, active session |

The ESLint boundary that keeps `chrome.*` out of `packages/**` already enforces the top row.

## User interface

**Options page** (`options_page` in the manifest, opened from the panel) holds the connection: base
URL, email, token, a *Connect* button that requests the host permission then calls `/myself`, and
the resulting state — `Connected as Denys Baranov` with a *Disconnect* button.

**Panel** gains one button next to the existing exports: `Jira ↑`. It is disabled, with a reason on
hover, when there is no connection or the session has no task. Pressing it posts the comment, then
uploads screenshots, then shows the outcome inline — a link to the comment on success, the error
otherwise.

## Errors

Every failure is reported in the panel; none are swallowed.

| Condition | Message |
| --- | --- |
| 401 | `Jira rejected the token — reconnect in settings` |
| 403 | `No permission to comment on {key}` |
| 404 | `Issue {key} not found` |
| 429 | `Jira is rate-limiting — try again shortly` |
| network failure | `Could not reach {baseUrl}` |
| comment posted, attachment failed | `Comment posted; N screenshots failed to upload` |

The last row matters: the comment and the attachments are separate requests, and a partial success
must not be reported as a total failure — the user needs to know the comment is already there
before they press the button again.

## Testing

`packages/core` gets unit tests for `toJiraAdf`: document shape, one row per annotation, table
header, empty session, and that a low-confidence selector is marked. This matches the existing rule
— pure core functions are tested, shells are verified by hand.

`JiraClient` is not unit-tested. Verification is manual against a real instance: connect, post to a
test issue, confirm the comment renders and screenshots appear as attachments, then check each
error path by using a bad token, a foreign issue key and an unreachable host.

## Privacy and store impact

`PRIVACY.md` currently states the extension makes no network requests. That sentence becomes false
and must be rewritten to say: when the user presses *Send to Jira*, the session — including
screenshots — is sent to the Jira instance they configured; credentials are stored locally and are
sent to nobody but that instance; there is still no Caliper backend and no telemetry.

The Chrome Web Store data declaration gains **authentication information** (stored locally, not
transmitted to the developer) and **user activity** (sent only to the user's own Jira on an explicit
action). The permission justification for `optional_host_permissions` explains that the host is
supplied by the user.

Expect a slower review than 0.1.0 — a credential-handling extension attracts more attention. This
should ship as its own version after 0.1.0 is approved, not bundled into the first submission.

## Open questions

- Should the comment be posted as internal (Jira Service Management) or always public? Assuming
  public; JSM has a different comment endpoint shape.
- Should posting mark the session somehow (e.g. `postedAt`) so the panel can show a session was
  already sent and avoid duplicate comments? Leaning yes, one nullable timestamp on the session.
