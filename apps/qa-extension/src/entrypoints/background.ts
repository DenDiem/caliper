import {isCaliperMessage} from '../messaging/messages';
import {captureElement} from '../screenshot/capture';
import {chromeStorageSink} from '../sinks/chrome-storage.sink';

export default defineBackground(() => {
  chrome.sidePanel.setPanelBehavior({openPanelOnActionClick: false}).catch(() => undefined);

  chrome.action.onClicked.addListener(async (tab) => {
    if (typeof tab.id !== 'number') return;
    await chrome.sidePanel.open({tabId: tab.id});
    await chrome.tabs.sendMessage(tab.id, {type: 'caliper/toggle'});
  });

  chrome.runtime.onMessage.addListener((message: unknown, _sender, sendResponse) => {
    if (!isCaliperMessage(message)) return false;

    if (message.type === 'caliper/annotation-created') {
      void chromeStorageSink
        .push(message.annotation, message.screenshot)
        .then(() => sendResponse(true));
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
