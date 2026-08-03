import type {CaliperAnnotation} from '@caliper/core';
import {mountOverlay} from '@caliper/overlay';
import type {AnnotationDraft, OverlayHandle} from '@caliper/overlay';
import {createOverlayHost} from '@caliper/overlay/review';
import {render} from 'preact';
import {DesignPanel} from './design-panel';
import {postCapture, postMark, postSubmit} from './sink';
import designStyles from './design.css?inline';

// The sidebar is an injected fixed panel — a page script can't claim real browser side-panel space the
// way the extension does — so reserve room by shifting the page left while design mode is open, else it
// overlaps the right edge of the app. Width matches `.caliper-design-panel` in design.css.
const PANEL_WIDTH = 340;

const reservePageSpace = (): (() => void) => {
  const root = document.documentElement;
  const previousMargin = root.style.marginRight;
  const previousTransition = root.style.transition;
  const width = Math.min(PANEL_WIDTH, Math.round(window.innerWidth * 0.9));
  root.style.transition = 'margin-right 0.15s ease';
  root.style.marginRight = `${width}px`;
  return () => {
    root.style.marginRight = previousMargin;
    root.style.transition = previousTransition;
  };
};

const toAnnotation = (draft: AnnotationDraft): CaliperAnnotation => ({
  id: crypto.randomUUID(),
  createdAt: new Date().toISOString(),
  comment: draft.comment,
  severity: draft.severity,
  intent: draft.intent,
  markType: draft.markType,
  anchor: draft.anchor,
  anchorTarget: draft.anchorTarget,
  author: 'human',
  concernType: null,
  verdict: null,
  ...(draft.region ? {region: draft.region} : {}),
  ...(draft.figmaUrl ? {figmaUrl: draft.figmaUrl} : {}),
  ...(draft.screenshot ? {screenshot: draft.screenshot} : {}),
  page: {
    url: location.href,
    title: document.title,
    viewport: {width: window.innerWidth, height: window.innerHeight, dpr: window.devicePixelRatio},
  },
  target: draft.context,
});

export const bootDesign = (): void => {
  document.title = `Caliper design — ${document.title}`;

  const host = createOverlayHost(designStyles, 'caliper-design-panel-host');
  const container = document.createElement('div');
  host.root.append(container);
  const restorePageSpace = reservePageSpace();

  const marks: CaliperAnnotation[] = [];
  let sent = false;
  let handle: OverlayHandle | null = null;
  // Same model as the extension: OFF (Browse, the default) — clicks drive the app, hold Alt to mark;
  // ON (Mark) — clicks mark, hold Alt to reach the app. The single toggle flips between them; the
  // overlay stays mounted in both so Alt always inverts. Closing the window is the full stop.
  let picking = false;

  const toggleArm = (): void => {
    picking = !picking;
    handle?.setActive(true);
    handle?.setArmed(picking);
    paint();
  };

  const paint = (): void => {
    render(
      <DesignPanel
        marks={marks}
        sent={sent}
        armed={picking}
        onArm={toggleArm}
        onSubmit={() => void submit()}
      />,
      container,
    );
  };

  const submit = async (): Promise<void> => {
    sent = true;
    paint();
    try {
      await postSubmit();
    } catch {
      // Marks already reached the server as they were made; close the window regardless.
    }
    restorePageSpace();
    window.close();
  };

  handle = mountOverlay({
    capture: (box) => postCapture(box),
    onSubmit: (draft) => {
      const annotation = toAnnotation(draft);
      marks.push(annotation);
      paint();
      void postMark(annotation).catch(() => undefined);
    },
    onExit: () => {
      picking = false;
      paint();
    },
  });

  paint();
};
