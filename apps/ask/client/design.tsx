import type {CaliperAnnotation} from '@caliper/core';
import {mountOverlay} from '@caliper/overlay';
import type {AnnotationDraft, OverlayHandle} from '@caliper/overlay';
import {createOverlayHost} from '@caliper/overlay/review';
import {render} from 'preact';
import {postCapture, postMark, postSubmit} from './sink';
import designStyles from './design.css?inline';

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

interface DockProps {
  count: number;
  sent: boolean;
  onArm: () => void;
  onSubmit: () => void;
}

const DesignDock = ({count, sent, onArm, onSubmit}: DockProps) => (
  <div class="caliper-design-dock">
    {sent ? (
      <span class="caliper-design-dock__done">✓ Sent to the agent — you can close this window</span>
    ) : (
      <>
        <button type="button" class="caliper-design-dock__arm" onClick={onArm}>
          Arm picker
        </button>
        <span class="caliper-design-dock__count">
          {count} mark{count === 1 ? '' : 's'}
        </span>
        <button
          type="button"
          class="caliper-design-dock__send"
          disabled={count === 0}
          onClick={onSubmit}
        >
          Send to agent
        </button>
      </>
    )}
  </div>
);

export const bootDesign = (): void => {
  document.title = `Caliper design — ${document.title}`;

  const host = createOverlayHost(designStyles, 'caliper-design-dock-host');
  const container = document.createElement('div');
  host.root.append(container);

  let count = 0;
  let sent = false;
  let handle: OverlayHandle | null = null;

  const paint = (): void => {
    render(
      <DesignDock
        count={count}
        sent={sent}
        onArm={() => handle?.setActive(true)}
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
    window.close();
  };

  handle = mountOverlay({
    capture: (box) => postCapture(box),
    onSubmit: (draft) => {
      count += 1;
      paint();
      void postMark(toAnnotation(draft)).catch(() => undefined);
    },
  });

  paint();
};
