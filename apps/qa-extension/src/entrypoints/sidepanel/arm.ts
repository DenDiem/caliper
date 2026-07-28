export const armPicker = async (): Promise<void> => {
  const [tab] = await chrome.tabs.query({active: true, currentWindow: true});
  if (typeof tab?.id !== 'number') return;
  await chrome.runtime.sendMessage({type: 'caliper/toggle-tab', tabId: tab.id});
};
