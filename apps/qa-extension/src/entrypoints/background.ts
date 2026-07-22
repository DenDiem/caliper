import {isCaliperMessage} from '../messaging/messages';
import {captureElement} from '../screenshot/capture';
import {chromeStorageSink} from '../sinks/chrome-storage.sink';

const CONTENT_SCRIPT = 'content-scripts/content.js';

const togglePicker = async (tabId: number): Promise<void> => {
  try {
    await chrome.tabs.sendMessage(tabId, {type: 'caliper/toggle'});
  } catch {
    await chrome.scripting.executeScript({target: {tabId}, files: [CONTENT_SCRIPT]});
    await chrome.tabs.sendMessage(tabId, {type: 'caliper/toggle'});
  }
};

export default defineBackground(() => {
  chrome.action.onClicked.addListener((tab) => {
    if (typeof tab.id !== 'number') return;
    const tabId = tab.id;
    void chrome.sidePanel.open({tabId});
    void togglePicker(tabId);
  });

  chrome.commands.onCommand.addListener((command, tab) => {
    if (typeof tab?.id !== 'number') return;
    const tabId = tab.id;

    if (command === 'toggle-picker') {
      void togglePicker(tabId);
      return;
    }

    if (command === 'open-panel') {
      void chrome.sidePanel.open({tabId});
    }
  });

  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (!isCaliperMessage(message)) return false;

    if (message.type === 'caliper/annotation-created') {
      void chromeStorageSink
        .push(message.annotation, message.screenshot)
        .then(() => sendResponse(true));
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

  chrome.sidePanel.setPanelBehavior({openPanelOnActionClick: false}).catch(() => undefined);
});
