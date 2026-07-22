export default defineBackground(() => {
  chrome.sidePanel.setPanelBehavior({openPanelOnActionClick: false}).catch(() => undefined);

  chrome.action.onClicked.addListener(async (tab) => {
    if (typeof tab.id !== 'number') return;
    await chrome.sidePanel.open({tabId: tab.id});
    await chrome.tabs.sendMessage(tab.id, {type: 'caliper/toggle'});
  });
});
