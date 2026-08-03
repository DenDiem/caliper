export const armPicker = async (): Promise<void> => {
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  if (typeof tab?.id !== 'number') return;
  await chrome.runtime.sendMessage({type: 'caliper/toggle-tab', tabId: tab.id});
};

export const disarmPicker = async (): Promise<void> => {
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  if (typeof tab?.id !== 'number') return;
  await chrome.runtime.sendMessage({type: 'caliper/disarm-tab', tabId: tab.id});
};

export const setPickerMode = async (armed: boolean): Promise<void> => {
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  if (typeof tab?.id !== 'number') return;
  await chrome.runtime.sendMessage({type: 'caliper/set-mode-tab', tabId: tab.id, armed});
};
