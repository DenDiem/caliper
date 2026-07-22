# Chrome Web Store listing

Copy-paste source for the store entry. Not part of the build.

**Extension ID:** `biedcnpfkefnocikeonknogjcippdopm` — derived from the item's public key, public by
design (it appears in the store URL). This is the value the `CHROME_EXTENSION_ID` secret needs.

## Name

```
Caliper — element-precise QA annotations
```

## Summary (132 characters max)

```
Click an element, describe what is wrong, export a defect report an AI agent can act on.
```

## Category

Developer Tools

## Store icon

`docs/media/store-icon-128.png` — 128×128 PNG, artwork inside a centred 96×96 safe area because the
store crops the corners. This is a separate upload from the icons in the manifest.

## Description

```
Visual bug reporters give you a screenshot and a sentence. Someone then has to open devtools, find
the element, guess which component owns it and which design token that colour came from.

Caliper skips that step. Click an element while the picker is armed, type what is wrong, and it
records:

• a stable CSS selector, with an honest confidence level — it tells you when the selector is
  brittle instead of pretending otherwise
• the owning application component, looked past design-system wrappers like ion-* or mat-*
• the computed styles that the element actually sets, matched against your design tokens, so a
  padding of 20px is reported as --offset-20px rather than a bare number
• a screenshot cropped to the element, captured at the moment you clicked it

Export the session as TOON (a compact, token-efficient format built for AI agents), as JSON, or as
a zip holding both plus the screenshots. Paste it into Claude Code, Cursor or any coding agent and
it can go straight to the file and the variable.

Everything stays on your machine. No account, no backend, no telemetry.

Keyboard: Alt+Shift+C toggles the picker, Alt+Shift+P opens the panel, Escape steps back.

Open source, MIT: https://github.com/DenDiem/caliper
```

## Privacy practices

**Single purpose:** record UI defects on a page as structured annotations for developers.

**Data usage:** Caliper does not collect or transmit user data. Annotations live in
`chrome.storage.local` and leave the machine only through an explicit export the user triggers.

**Justification per permission** — the store asks for each one:

| Permission | Justification |
| --- | --- |
| `storage` / `unlimitedStorage` | Persist recorded annotations and their screenshots locally between sessions; screenshots exceed the default quota. |
| `activeTab` | Read the element the user clicked in the tab they are currently viewing. |
| `scripting` | Inject the picker into tabs that were open before the extension was installed or reloaded, so the user does not have to reload every tab. |
| `sidePanel` | Display the list of recorded defects and the export controls. |
| `downloads` | Write the exported zip archive to the user's Downloads folder. |
| `host_permissions: <all_urls>` | QA is performed on arbitrary staging and production hosts that cannot be enumerated ahead of time. The picker only reads a page after the user explicitly arms it on that tab. |

**Privacy policy URL:**

```
https://github.com/DenDiem/caliper/blob/main/PRIVACY.md
```

## Screenshots still needed

At least one, 1280×800 or 640×400. Worth capturing:

1. The picker armed over a real page, highlight and badge visible.
2. The popover open on an element, with the screenshot thumbnail inside.
3. The side panel with a few defects recorded.
4. The TOON export pasted into an agent.
