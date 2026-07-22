# Privacy Policy

**Last updated:** 22 July 2026

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

## Where the data goes

**Nowhere.** Everything is written to `chrome.storage.local` on your own machine.

Caliper has no backend, makes no network requests, and contains no analytics, telemetry, tracking or
advertising code. Nothing is transmitted to the author or to any third party.

Data leaves your machine only when you choose to export it — **Copy TOON**, **Copy JSON** or **zip**
— and then only to the destination you pick yourself (your clipboard, your Downloads folder).

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
| `<all_urls>` | QA happens on arbitrary staging and production sites, so the picker cannot be limited to a fixed list of hosts. Access is used only on the tab where you arm it. |

## Source code

Caliper is open source under the MIT licence: https://github.com/DenDiem/caliper — the claims above
can be verified by reading it.

## Contact

Open an issue at https://github.com/DenDiem/caliper/issues
