import type {CaliperAnnotation} from '@caliper/core';
import {mountOverlay} from '@caliper/overlay';
import type {AnnotationDraft, OverlayHandle} from '@caliper/overlay';
import {isCaliperMessage} from '../messaging/messages';

export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_idle',
  main() {
    let handle: OverlayHandle | null = null;

    const toAnnotation = (draft: AnnotationDraft): CaliperAnnotation => ({
      id: crypto.randomUUID(),
      createdAt: new Date().toISOString(),
      comment: draft.comment,
      severity: draft.severity,
      ...(draft.figmaUrl ? {figmaUrl: draft.figmaUrl} : {}),
      page: {
        url: location.href,
        title: document.title,
        viewport: {
          width: window.innerWidth,
          height: window.innerHeight,
          dpr: window.devicePixelRatio,
        },
      },
      target: draft.context,
    });

    const submit = async (draft: AnnotationDraft) => {
      const annotation = toAnnotation(draft);
      const screenshot: unknown = await chrome.runtime.sendMessage({
        type: 'caliper/capture',
        box: draft.context.box,
        dpr: window.devicePixelRatio,
      });
      await chrome.runtime.sendMessage({
        type: 'caliper/annotation-created',
        annotation,
        ...(typeof screenshot === 'string' ? {screenshot} : {}),
      });
    };

    chrome.runtime.onMessage.addListener((message: unknown) => {
      if (!isCaliperMessage(message) || message.type !== 'caliper/toggle') return;
      if (handle) {
        handle.destroy();
        handle = null;
        return;
      }
      handle = mountOverlay({onSubmit: (draft) => void submit(draft)});
    });
  },
});
