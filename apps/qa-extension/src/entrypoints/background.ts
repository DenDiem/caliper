import {isCaliperMessage} from '../messaging/messages';
import {captureElement} from '../screenshot/capture';
import {runOp} from '../sinks/store';

const CONTENT_SCRIPT = 'content-scripts/content.js';
const PANEL = 'sidepanel.html';
const OWNER_KEY = 'caliper.ownerTab';

const togglePicker = async (tabId: number): Promise<void> => {
  try {
    await chrome.tabs.sendMessage(tabId, {type: 'caliper/toggle'});
  } catch {
    await chrome.scripting.executeScript({target: {tabId}, files: [CONTENT_SCRIPT]});
    await chrome.tabs.sendMessage(tabId, {type: 'caliper/toggle'});
  }
};

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

  chrome.commands.onCommand.addListener((command, tab) => {
    if (typeof tab?.id !== 'number') return;
    const tabId = tab.id;

    if (command === 'toggle-picker') {
      void togglePicker(tabId);
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

    if (message.type === 'caliper/toggle-tab') {
      void togglePicker(message.tabId)
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

    if (message.type === 'caliper/capture') {
      void captureElement(message.box, message.dpr)
        .then((dataUrl) => sendResponse(dataUrl))
        .catch(() => sendResponse(null));
      return true;
    }

    return false;
  });
});
