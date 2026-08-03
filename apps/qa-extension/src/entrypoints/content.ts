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
      intent: draft.intent,
      markType: draft.markType,
      anchor: draft.anchor,
      anchorTarget: draft.anchorTarget,
      author: 'human',
      concernType: null,
      verdict: null,
      ...(draft.region ? {region: draft.region} : {}),
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

    const MOUNTED_KEY = 'caliper.armed';
    const MODE_KEY = 'caliper.pickerArmed';

    const persistMounted = (value: boolean): void =>
      void chrome.storage.local.set({[MOUNTED_KEY]: value});
    const persistMode = (value: boolean): void => void chrome.storage.local.set({[MODE_KEY]: value});

    const readMode = async (): Promise<boolean> =>
      (await chrome.storage.local.get(MODE_KEY))[MODE_KEY] === true;

    const disarm = (): void => {
      if (!handle) return;
      handle.destroy();
      handle = null;
      persistMounted(false);
    };

    // On (mount) defaults to passive: clicks reach the app, hold Alt to mark. The persisted picker
    // mode is re-applied so a reload keeps the reviewer's last choice; the sidepanel toggle flips it
    // to arm-picker (clicks mark, Alt reaches the app).
    const arm = (): void => {
      if (handle) return;
      handle = mountOverlay({capture, onSubmit: (draft) => void submit(draft), onExit: disarm});
      persistMounted(true);
      void readMode().then((armed) => handle?.setArmed(armed));
    };

    const setMode = (armed: boolean): void => {
      if (!handle) return;
      handle.setArmed(armed);
      persistMode(armed);
    };

    chrome.runtime.onMessage.addListener((message: unknown) => {
      if (!isCaliperMessage(message)) return;
      if (message.type === 'caliper/toggle') {
        if (handle) disarm();
        else arm();
      } else if (message.type === 'caliper/disarm') {
        disarm();
      } else if (message.type === 'caliper/set-mode') {
        setMode(message.armed);
      }
    });
  },
});
