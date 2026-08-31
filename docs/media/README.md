# Demo media

`icon.png` and the extension icon set are generated, not drawn — rerun `node scripts/make-icons.mjs`
after changing the shape or the palette. It writes 16/32/48/128 into the extension's `public/icon`
and a 512 version here for the README and the store listing.

## The two README GIFs are scripted — re-run them, do not re-shoot them

`qa-extension/mark-defect.gif` and `qa-extension/trace-flow.gif` are produced by scripts, so they can
be regenerated whenever the UI moves instead of drifting years out of date (which is exactly what
happened to the hand-shot version of `mark-defect.gif`).

```bash
pnpm --filter @dendiem/caliper demo          # the pages both demos drive, on :5599
pnpm --filter @caliper/qa-extension build
pnpm --filter @dendiem/caliper build         # trace-flow only: it runs the real CLI

node scripts/record-mark-demo.mjs            # marking an element -> the side panel
node scripts/record-trace-demo.mjs           # reproducing a bug -> the trace an agent reads
```

Both drive the real built extension in Chromium and both end in the same two-pass ffmpeg palette step
described below. Nothing in either is staged: the trace demo's terminal shows the actual stdout of
`caliper read` and `caliper trace --around` over the session the first half just recorded.

Two things that will waste an hour if you rediscover them:

- Playwright puts `--disable-extensions` in its default args, and leaving it there alongside
  `--load-extension` hangs the browser at startup with no error. Both scripts pass
  `ignoreDefaultArgs: ['--disable-extensions']`.
- Every page in a persistent context records its own file, including the initial `about:blank`. Take
  the clip from `page.video()`, never by scanning the output directory.

Chrome's side panel is browser chrome and page video cannot see it, so the panel is recorded from
`sidepanel.html` — the same component the docked panel renders — and framed on its own.

---

The rest of this page covers hand-recording, still the way to capture anything the scripts do not:
store screenshots, or a flow that needs a human hand. `ffmpeg` does the work; the recording itself can
come from anything that writes an mp4.

## 1. Record

Windows Game Bar needs no install: `Win+Alt+R` starts and stops, the file lands in
`~/Videos/Captures`. Record at the window size you want to publish — upscaling later looks soft.

Worth capturing in one take, ~15 seconds:

1. Arm the picker (`Alt+Shift+C`) — the badge appears, the cursor turns into a crosshair.
2. Move across two or three elements so the highlight follows.
3. Click one, type a comment, hit Save.
4. Open the side panel, press **Copy TOON**.

## 2. GIF for the README

Two passes: the first builds a palette from the clip, the second applies it. A single-pass GIF
banded gradients badly, which is exactly what a dark UI is made of.

```powershell
$in = "$env:USERPROFILE\Videos\Captures\demo.mp4"

ffmpeg -ss 00:00:02 -t 15 -i $in `
  -vf "fps=14,scale=960:-1:flags=lanczos,palettegen=stats_mode=diff" -y palette.png

ffmpeg -ss 00:00:02 -t 15 -i $in -i palette.png `
  -lavfi "fps=14,scale=960:-1:flags=lanczos[v];[v][1:v]paletteuse=dither=bayer:bayer_scale=3" `
  -y docs/media/demo.gif

Remove-Item palette.png
```

`-ss` skips the lead-in, `-t` caps the length. Keep the result under ~5 MB or the README stalls on
slow connections — drop `fps` to 10 or `scale` to 800 if it runs over.

## 3. Screenshots for the Chrome Web Store

The store rejects GIFs. It wants PNG or JPEG at exactly 1280×800 (or 640×400), so pull stills from
the same recording:

```powershell
ffmpeg -ss 00:00:06 -i $in -frames:v 1 `
  -vf "scale=1280:800:force_original_aspect_ratio=increase,crop=1280:800" `
  -y docs/media/store-1.png
```

Repeat with a different `-ss` for each frame you need. `force_original_aspect_ratio=increase` plus
`crop` fills the canvas without letterboxing — the store shows black bars as-is.

## 4. Reference it

In the root README:

```markdown
![Caliper picking an element and exporting the annotation](docs/media/demo.gif)
```

An mp4 is the better format for anything longer than ~20 seconds: drag it into any GitHub issue
comment, copy the `user-images.githubusercontent.com` URL it produces, and paste that URL into the
README — GitHub renders it as a player with pause and scrubbing.
