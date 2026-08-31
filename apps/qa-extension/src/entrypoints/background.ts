import {isCaliperMessage} from '../messaging/messages';
import {captureElement} from '../screenshot/capture';
import {runOp} from '../sinks/store';
import {dropTraceBlobs} from '../trace/blob-store';
import {
  activeTraceElapsed,
  activeTraceTabId,
  ingestBatch,
  startTrace,
  stopTrace,
  traceStatus,
} from '../trace/lifecycle';

const CONTENT_SCRIPT = 'content-scripts/content.js';
const PANEL = 'sidepanel.html';
const OWNER_KEY = 'caliper.ownerTab';
const ENGAGED_KEY = 'caliper.armed';

// Send a message to the tab's content script, injecting it first if it isn't there yet.
const sendToTab = async (tabId: number, type: string): Promise<void> => {
  try {
    await chrome.tabs.sendMessage(tabId, {type});
  } catch {
    await chrome.scripting.executeScript({target: {tabId}, files: [CONTENT_SCRIPT]});
    await chrome.tabs.sendMessage(tabId, {type});
  }
};

// Mount the overlay in its persisted mode (Browse by default) — called whenever the panel opens on a
// tab, so the picker is live (Alt marks) the moment the panel is up, without a separate arm step.
const engageTab = (tabId: number): Promise<void> => sendToTab(tabId, 'caliper/engage').catch(() => undefined);

const toggleModeTab = (tabId: number): Promise<void> => sendToTab(tabId, 'caliper/toggle-mode');

const disarmTab = (tabId: number): Promise<void> =>
  chrome.tabs
    .sendMessage(tabId, {type: 'caliper/disarm'})
    .then(() => undefined)
    .catch(() => undefined);

const setModeTab = (tabId: number, armed: boolean): Promise<void> =>
  chrome.tabs
    .sendMessage(tabId, {type: 'caliper/set-mode', armed})
    .then(() => undefined)
    .catch(() => undefined);

const getOwner = async (): Promise<number | undefined> => {
  const raw: unknown = (await chrome.storage.session.get(OWNER_KEY))[OWNER_KEY];
  return typeof raw === 'number' ? raw : undefined;
};

const setOwner = (tabId: number | undefined): Promise<void> =>
  tabId === undefined
    ? chrome.storage.session.remove(OWNER_KEY)
    : chrome.storage.session.set({[OWNER_KEY]: tabId});

const openPanel = (tabId: number): void => {
  void chrome.sidePanel.setOptions({tabId, path: PANEL, enabled: true});
  void chrome.sidePanel.open({tabId});
  void setOwner(tabId);
  void engageTab(tabId);
};

// Leaving the owner tab closes the panel and drops ownership, so returning does NOT auto-reopen —
// the toolbar icon is the only way back.
const closePanel = async (): Promise<void> => {
  const owner = await getOwner();
  if (typeof owner === 'number') {
    await chrome.sidePanel.setOptions({tabId: owner, enabled: false}).catch(() => undefined);
  }
  await setOwner(undefined);
};

export default defineBackground(() => {
  void chrome.sidePanel.setPanelBehavior({openPanelOnActionClick: false}).catch(() => undefined);
  // Off by default: no tab shows the panel until the icon opens it on that specific (owner) tab.
  void chrome.sidePanel.setOptions({enabled: false}).catch(() => undefined);

  chrome.action.onClicked.addListener((tab) => {
    if (typeof tab.id === 'number') openPanel(tab.id);
  });

  chrome.tabs.onActivated.addListener(({tabId}) => {
    void getOwner().then((owner) => {
      if (typeof owner === 'number' && owner !== tabId) {
        void disarmTab(owner);
        void closePanel();
      }
    });
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    void getOwner().then((owner) => {
      if (owner === tabId) void setOwner(undefined);
    });
  });

  // A reload of the owner tab drops its content script and overlay — re-engage once it finishes so the
  // picker survives navigation while the panel stays open. Only if it was still engaged (Escape or a
  // panel close clears caliper.armed, and must stay off across the reload).
  chrome.tabs.onUpdated.addListener((tabId, changeInfo) => {
    if (changeInfo.status !== 'complete') return;
    void Promise.all([getOwner(), chrome.storage.local.get(ENGAGED_KEY)]).then(([owner, store]) => {
      if (owner === tabId && store[ENGAGED_KEY] === true) void engageTab(tabId);
    });
  });

  // A trace belongs to the tab, not the page. The bridge re-injects at document_start on the new
  // document and asks whether recording is still on, but a commit that races that question is covered
  // by telling the tab again here.
  chrome.webNavigation.onCommitted.addListener(({tabId, frameId}) => {
    if (frameId !== 0 || activeTraceTabId() !== tabId) return;
    const elapsedMs = activeTraceElapsed(tabId) ?? 0;
    void chrome.tabs
      .sendMessage(tabId, {type: 'caliper/collector-start', elapsedMs})
      .catch(() => undefined);
  });

  chrome.commands.onCommand.addListener((command, tab) => {
    if (typeof tab?.id !== 'number') return;
    const tabId = tab.id;

    if (command === 'toggle-picker') {
      void toggleModeTab(tabId);
      return;
    }

    if (command === 'open-panel') {
      openPanel(tabId);
    }
  });

  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (!isCaliperMessage(message)) return false;

    if (message.type === 'caliper/annotation-created') {
      void runOp({kind: 'push', annotation: message.annotation, screenshot: message.screenshot}).then(
        () => sendResponse(true),
      );
      return true;
    }

    if (message.type === 'caliper/store-op') {
      void runOp(message.op)
        .then(() => sendResponse(true))
        .catch(() => sendResponse(false));
      return true;
    }

    if (message.type === 'caliper/disarm-tab') {
      void disarmTab(message.tabId).then(() => sendResponse(true));
      return true;
    }

    if (message.type === 'caliper/set-mode-tab') {
      void setModeTab(message.tabId, message.armed).then(() => sendResponse(true));
      return true;
    }

    // Both always answer. A rejection that never reached the panel used to leave its button disabled
    // for good, with the trace half-started behind it.
    if (message.type === 'caliper/trace-start') {
      void startTrace(message.tabId, message.label)
        .then((started) => sendResponse(started))
        .catch(() => sendResponse(false));
      return true;
    }

    if (message.type === 'caliper/trace-stop') {
      void stopTrace()
        .then((stopped) => sendResponse(stopped))
        .catch(() => sendResponse(false));
      return true;
    }

    if (message.type === 'caliper/trace-batch') {
      ingestBatch(message.batch);
      sendResponse(true);
      return true;
    }

    if (message.type === 'caliper/trace-status') {
      sendResponse(traceStatus());
      return true;
    }

    if (message.type === 'caliper/trace-blobs-drop') {
      void dropTraceBlobs(message.traceIds).then(() => sendResponse(true));
      return true;
    }

    if (message.type === 'caliper/trace-active') {
      const tabId = _sender.tab?.id;
      sendResponse(typeof tabId === 'number' ? activeTraceElapsed(tabId) : null);
      return true;
    }

    if (message.type === 'caliper/capture') {
      void captureElement(message.box, message.dpr)
        .then((dataUrl) => sendResponse(dataUrl))
        .catch(() => sendResponse(null));
      return true;
    }

    return false;
  });
});
