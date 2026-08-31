# Privacy Policy

**Last updated:** 31 August 2026

Caliper is a QA tool that turns a clicked page element into a structured defect annotation. This
policy describes exactly what it stores and where.

## What Caliper collects

Only what you explicitly record. Clicking an element while the picker is armed captures:

- the element's CSS selector, tag name and owning component name;
- a curated list of its computed styles, matched against the page's design tokens;
- the element's position and size, its visible text (first 120 characters) and identifying
  attributes (`id`, `class`, `data-*`, `aria-*`);
- the page URL, title and viewport size;
- a cropped screenshot of that element;
- the comment, severity and optional Figma link that you type yourself.

Caliper does not run until you arm the picker, and it records nothing while idle.

## Bug traces

Pressing **Start trace** begins a recording that stops when you press **Stop**. While it runs, Caliper
captures, for that one tab:

- the steps you take — clicks, scroll positions, in-app route changes, navigations, and which fields
  changed (their **length**, never their contents);
- a DOM replay of the page over time;
- console output, including uncaught errors and unhandled promise rejections, with their stack traces;
- network requests: method, URL, status, timing, **headers, and request/response bodies** — sent via
  `fetch` or `sendBeacon`;
- the names of the state-management actions your app dispatches, plus a snapshot of its store at the
  start and end of the recording;
- a low-bitrate video of the tab.

**By default nothing in a trace is masked.** That means a trace can contain live bearer tokens and
session cookies belonging to the environment you were testing. This is deliberate — a redacted trace
is often useless for debugging — but it makes a trace as sensitive as the session it was recorded
from. Before attaching one to a ticket other people can read, either turn on **Mask credentials in
recorded network traffic** in the extension's options, or check what the trace contains.

With that option on, Caliper masks credential-looking values in request and response headers, in JSON
request and response bodies, in URL query strings, in your application's store snapshot and per-action
diffs, and in console text. Masking is pattern-based, not a guarantee: a secret that does not look like
one — an opaque value under an unremarkable field name — will not be recognised. Treat the option as
a reduction in exposure, not as sanitisation.

Recording never starts on its own. Nothing is recorded before you press Start or after you press Stop,
and a trace covers only the tab you started it on.

Traces are stored on your machine (IndexedDB for the video and replay, `chrome.storage.local` for the
summary) and leave it only through the same explicit actions as everything else: a zip you download,
or Send to Jira.

## Where the data goes

**By default, nowhere.** Everything is written to `chrome.storage.local` on your own machine.

Caliper has no backend of its own, and contains no analytics, telemetry, tracking or advertising
code. Nothing is transmitted to the author.

Data leaves your machine only when you choose to send it:

- **Copy TOON**, **Copy JSON** or **zip** — to the destination you pick yourself (your clipboard,
  your Downloads folder). A zip carries any recorded traces, video included.
- **Send to Jira** (optional, off until you connect it) — directly to your own Jira site, described
  below.

## Jira integration (optional)

Connecting Jira is entirely opt-in and off until you set it up. When you connect it in the
extension's options, your Jira **site URL, account email and API token** are stored in
`chrome.storage.local` on your machine — the API token in plain text, like any locally stored
credential.

When you press **Send to Jira**, the extension talks **directly** to your own
`https://<your-site>.atlassian.net` to attach the screenshots and post the defect comment (or set
the description). It routes nothing through any Caliper-operated server — there is none — and nothing
to any third party. The Atlassian API token carries your own account's permissions, so treat it like
a password. **Disconnect** in the options erases the stored token, email and site.

## Retention and deletion

Annotations stay in local browser storage until you remove them. **Remove** deletes a single entry
with its screenshot; **Clear** empties the whole session. Uninstalling the extension deletes
everything Chrome stored for it.

## Permissions and why they are needed

| Permission | Why |
| --- | --- |
| `storage`, `unlimitedStorage` | Keep annotations and screenshots locally. Screenshots exceed the default quota, hence the unlimited variant. |
| `activeTab` | Read the element you clicked, in the tab you are looking at. |
| `scripting` | Inject the picker into tabs that were already open when the extension was installed or reloaded. |
| `sidePanel` | Show the recorded defects. |
| `downloads` | Save the exported archive to your Downloads folder. |
| `<all_urls>` | QA happens on arbitrary staging and production sites, so the picker cannot be limited to a fixed list of hosts. Access is used only on the tab where you arm it, and — if you connect Jira — to reach your own `*.atlassian.net` site. |

## Source code

Caliper is open source under the MIT licence: https://github.com/DenDiem/caliper — the claims above
can be verified by reading it.

## Contact

Open an issue at https://github.com/DenDiem/caliper/issues
