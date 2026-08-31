const HOST_SOURCE = 'caliper-host';
const COLLECTOR_SOURCE = 'caliper-collector';

// Kept separate from content.ts, which mounts the overlay at document_idle. A navigation replaces the
// document mid-trace, and the background answers "is a trace running?" the moment this loads — an idle
// bridge would miss that answer and the new page would go unrecorded.
export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  main() {
    const tell = (kind: 'start' | 'stop'): void => {
      window.postMessage({source: HOST_SOURCE, kind}, '*');
    };

    window.addEventListener('message', (event: MessageEvent) => {
      if (event.source !== window) return;
      const data: unknown = event.data;
      if (typeof data !== 'object' || data === null) return;
      if (Reflect.get(data, 'source') !== COLLECTOR_SOURCE) return;
      if (Reflect.get(data, 'kind') !== 'batch') return;

      void chrome.runtime
        .sendMessage({type: 'caliper/trace-batch', batch: Reflect.get(data, 'batch')})
        .catch(() => undefined);
    });

    chrome.runtime.onMessage.addListener((message: unknown) => {
      if (typeof message !== 'object' || message === null) return;
      const type = Reflect.get(message, 'type');
      if (type === 'caliper/collector-start') tell('start');
      if (type === 'caliper/collector-stop') tell('stop');
    });

    void chrome.runtime
      .sendMessage({type: 'caliper/trace-active'})
      .then((active: unknown) => {
        if (active === true) tell('start');
      })
      .catch(() => undefined);
  },
});
