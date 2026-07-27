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

const getOwner = async (): Promise<number | undefined> =>
  (await chrome.storage.session.get(OWNER_KEY))[OWNER_KEY];

const claimOwner = async (tabId: number): Promise<void> => {
  const previous = await getOwner();
  if (typeof previous === 'number' && previous !== tabId) {
    await chrome.sidePanel.setOptions({tabId: previous, enabled: false}).catch(() => undefined);
  }
  await chrome.storage.session.set({[OWNER_KEY]: tabId});
};

const openPanel = (tabId: number): void => {
  void chrome.sidePanel.setOptions({tabId, path: PANEL, enabled: true});
  void chrome.sidePanel.open({tabId});
  void claimOwner(tabId);
};

export default defineBackground(() => {
  chrome.sidePanel.setPanelBehavior({openPanelOnActionClick: false}).catch(() => undefined);

  chrome.action.onClicked.addListener((tab) => {
    if (typeof tab.id === 'number') openPanel(tab.id);
  });

  chrome.tabs.onActivated.addListener(({tabId}) => {
    void getOwner().then((owner) => {
      if (typeof owner !== 'number') return;
      void chrome.sidePanel
        .setOptions({tabId, path: PANEL, enabled: tabId === owner})
        .catch(() => undefined);
    });
  });

  chrome.tabs.onRemoved.addListener((tabId) => {
    void getOwner().then((owner) => {
      if (owner === tabId) void chrome.storage.session.remove(OWNER_KEY);
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

    if (message.type === 'caliper/capture') {
      void captureElement(message.box, message.dpr)
        .then((dataUrl) => sendResponse(dataUrl))
        .catch(() => sendResponse(null));
      return true;
    }

    return false;
  });
});
