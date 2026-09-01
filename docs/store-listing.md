# Chrome Web Store listing

Copy-paste source for the store entry. Not part of the build.

**Extension ID:** `biedcnpfkefnocikeonknogjcippdopm` — derived from the item's public key, public by
design (it appears in the store URL). This is the value the `CHROME_EXTENSION_ID` secret needs.

## Name

```
Caliper QA — UI Marks & Bug Traces for AI Coding Agents
```

## Summary (132 characters max)

```
Mark up any web UI or record a bug trace — DOM, console, network and store — and hand it to Claude Code, Cursor or any AI agent.
```

> This is the `description` in `apps/qa-extension/wxt.config.ts` verbatim — the store takes the
> summary from the manifest, and `build/store-limits.ts` fails the build if it passes 132.

> See `docs/seo.md` for the discoverability strategy behind this name/summary and the GitHub topics.

## Category

Developer Tools

## Store icon

`docs/media/store-icon-128.png` — 128×128 PNG, artwork inside a centred 96×96 safe area because the
store crops the corners. This is a separate upload from the icons in the manifest.

## Description

```
A bug report made of a screenshot and a sentence puts the work on the wrong person. Someone else
opens devtools, hunts for the element, guesses which component owns it and where that colour came
from — and for anything that only happens on the second try, guesses at that too.

Caliper QA records what an agent actually needs, in two shapes.

MARK AN ELEMENT — for a defect you can point at

Click it while the picker is armed, say what is wrong, and Caliper records:

• a stable CSS selector, with an honest confidence level — it tells you when the selector is
  brittle instead of pretending otherwise
• the owning application component, looked past design-system wrappers like ion-* or mat-*
• the computed styles the element actually sets, matched against your design tokens, so a padding
  of 20px is reported as --offset-20px rather than a bare number
• a screenshot cropped to the element, captured the moment you clicked

Three ways to say what you mean: click an element to annotate it, strike one through to flag it for
removal, or lasso an area when no single element is the right target.

RECORD A TRACE — for a defect that is a sequence

"Save works, but only the second time" is not a moment, and no screenshot will ever explain it.
Press Start trace, reproduce the bug, press Stop. Caliper records the steps you took, the DOM as it
changed, the console including stack traces, every network request with its status and body, and
the actions your store dispatched — plus a small video for whoever reads the ticket.

The split is deliberate: the trace is what the coding agent reads, the video is for the human. An
agent handed the trace can see that the second save came back 409, that the app dispatched
"Save Succeeded" anyway, and which line threw two milliseconds later.

HAND IT OVER

Export as TOON (a compact, token-efficient format built for AI agents), as JSON, or as a zip. Or
send it straight to a Jira issue. A developer then runs one command — caliper pull for a ticket,
caliper read for a zip — and their agent has the whole session offline, with no running app.

Everything stays on your machine. No account, no backend, no telemetry.

Keyboard: Alt+Shift+C toggles the picker, Alt+Shift+P opens the panel, Escape steps back.

Open source, MIT: https://github.com/DenDiem/caliper
```

## Privacy practices

**Single purpose:** record UI defects on a page — as element annotations or as a recorded
reproduction — in a structured form a developer or their coding agent can act on.

**Data usage:** Caliper does not collect or transmit user data, and has no backend of its own.
Annotations and traces are stored locally (`chrome.storage.local` and IndexedDB) and leave the
machine only through an export the user explicitly triggers, to a destination the user chooses.

**Recording is never passive.** Nothing is captured before the user presses Start trace or arms the
picker, and nothing after they press Stop. A trace covers only the one tab it was started on.

**Justification per permission** — the store asks for each one:

| Permission | Justification |
| --- | --- |
| `storage` / `unlimitedStorage` | Persist recorded annotations and their screenshots locally between sessions; screenshots exceed the default quota. |
| `activeTab` | Read the element the user clicked in the tab they are currently viewing. |
| `scripting` | Inject the picker into tabs that were open before the extension was installed or reloaded, so the user does not have to reload every tab. |
| `sidePanel` | Display the list of recorded defects and the export controls. |
| `alarms` | End a bug-trace recording at the length limit the user configured. A plain timer does not survive the extension's service worker being unloaded, which would leave a recording running with no way to stop itself. |
| `downloads` | Write the exported zip archive to the user's Downloads folder. |
| `host_permissions: <all_urls>` | QA is performed on arbitrary staging and production hosts that cannot be enumerated ahead of time. The picker only reads a page after the user explicitly arms it on that tab. |
| `tabCapture` | Record the video of a bug reproduction, for the duration between the user pressing Start trace and Stop. Only the tab the recording was started on is captured, and only while a recording the user started is running. |
| `offscreen` | A service worker cannot run MediaRecorder. The offscreen document exists solely to encode that tab capture, and is created when a recording starts and closed when it ends. |
| `debugger` | While a trace is recording, attach to that one tab to collect network requests (with status, timing and response bodies) and uncaught-exception stack traces, which a page-level script cannot see, and — when tab capture is unavailable — to screencast that tab so the recording still has a video. Attached only for the duration of a user-started recording and detached at Stop; if it cannot attach, recording continues with a reduced page-level collector. |
| `webNavigation` | A reproduction often crosses a page load. This is used only to notice that the tab the user is recording has navigated, so the recording continues into the new page instead of stopping silently. |

**Privacy policy URL:**

```
https://github.com/DenDiem/caliper/blob/main/PRIVACY.md
```

## Screenshots

Four, all exactly 1280×800, in `docs/media/store/` — regenerate with
`node scripts/record-store-shots.mjs` (needs the demo server and a built extension) rather than
re-shooting by hand:

| File | Shows |
| --- | --- |
| `store-1-picker-armed.png` | The picker armed over a real page, highlight following the cursor |
| `store-2-popover.png` | The popover open on an element, selector and token match visible |
| `store-3-recording.png` | Mid-recording — the red strip with its timer and live error/request counts |
| `store-4-trace-card.png` | A finished trace: video, label, and the summary chips |

The side panel is browser chrome and cannot be captured with the page, so 3 and 4 are composed — app
on the left, the real `sidepanel.html` on the right, which is how it looks docked.
3. The side panel with a few defects recorded.
4. The TOON export pasted into an agent.
