import type {Box, CaliperAnnotation} from '@caliper/core';
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
      author: 'human',
      concernType: null,
      verdict: null,
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

    const capture = async (box: Box): Promise<string | null> => {
      const result: unknown = await chrome.runtime.sendMessage({
        type: 'caliper/capture',
        box,
        dpr: window.devicePixelRatio,
      });
      return typeof result === 'string' ? result : null;
    };

    const submit = async (draft: AnnotationDraft) => {
      await chrome.runtime.sendMessage({
        type: 'caliper/annotation-created',
        annotation: toAnnotation(draft),
        ...(draft.screenshot ? {screenshot: draft.screenshot} : {}),
      });
    };

    chrome.runtime.onMessage.addListener((message: unknown) => {
      if (!isCaliperMessage(message) || message.type !== 'caliper/toggle') return;
      if (handle) {
        handle.destroy();
        handle = null;
        return;
      }
      handle = mountOverlay({capture, onSubmit: (draft) => void submit(draft)});
    });
  },
});
