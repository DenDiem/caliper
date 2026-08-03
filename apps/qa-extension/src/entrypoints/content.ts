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

    // Engaged = overlay mounted. It stays mounted in BOTH modes so Alt always inverts: Mark (armed)
    // marks on click and Alt reaches the app; Browse (not armed) reaches the app on click and Alt
    // marks. The single sidepanel toggle flips the mode; the overlay only unmounts when the panel
    // closes or you leave the tab. Mount state lives in caliper.armed, the mode in caliper.pickerArmed.
    const ENGAGED_KEY = 'caliper.armed';
    const MODE_KEY = 'caliper.pickerArmed';

    let markMode = false;

    const persistEngaged = (value: boolean): void =>
      void chrome.storage.local.set({[ENGAGED_KEY]: value});
    const persistMode = (value: boolean): void => void chrome.storage.local.set({[MODE_KEY]: value});

    // Default (unset) is Browse: opening the panel engages passively, clicks reach the app, Alt marks.
    const readMode = async (): Promise<boolean> =>
      (await chrome.storage.local.get(MODE_KEY))[MODE_KEY] === true;

    const applyMode = (armed: boolean): void => {
      markMode = armed;
      if (!handle) {
        handle = mountOverlay({capture, onSubmit: (draft) => void submit(draft), onExit: disengage});
        persistEngaged(true);
      }
      handle.setArmed(armed);
    };

    // Mount in the persisted mode without changing it — used when the panel (re)opens.
    const engage = async (): Promise<void> => applyMode(await readMode());

    // Flip and persist the mode; guarantees the overlay is mounted so the toggle also (re)engages.
    const setMode = (armed: boolean): void => {
      applyMode(armed);
      persistMode(armed);
    };

    // ⌥⇧C flips Mark ⇄ Browse (mounting if needed) instead of unmounting.
    const toggleMode = (): void => setMode(!markMode);

    function disengage(): void {
      if (!handle) return;
      handle.destroy();
      handle = null;
      persistEngaged(false);
    }

    chrome.runtime.onMessage.addListener((message: unknown) => {
      if (!isCaliperMessage(message)) return;
      if (message.type === 'caliper/engage') {
        void engage();
      } else if (message.type === 'caliper/toggle-mode') {
        toggleMode();
      } else if (message.type === 'caliper/set-mode') {
        setMode(message.armed);
      } else if (message.type === 'caliper/disarm') {
        disengage();
      }
    });
  },
});
