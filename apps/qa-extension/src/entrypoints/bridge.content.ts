const HOST_SOURCE = 'caliper-host';
const COLLECTOR_SOURCE = 'caliper-collector';

// Kept separate from content.ts, which mounts the overlay at document_idle. A navigation replaces the
// document mid-trace, and the background answers "is a trace running?" the moment this loads — an idle
// bridge would miss that answer and the new page would go unrecorded.
export default defineContentScript({
  matches: ['<all_urls>'],
  runAt: 'document_start',
  main() {
    const tell = (kind: 'start' | 'stop', elapsedMs = 0): void => {
      window.postMessage({source: HOST_SOURCE, kind, elapsedMs}, '*');
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
      if (type === 'caliper/collector-start') {
        const elapsed = Reflect.get(message, 'elapsedMs');
        tell('start', typeof elapsed === 'number' ? elapsed : 0);
      }
      if (type === 'caliper/collector-stop') tell('stop');
    });

    // A fresh document mid-trace asks how far in it is, so its timeline continues the trace's rather
    // than starting again from zero.
    void chrome.runtime
      .sendMessage({type: 'caliper/trace-active'})
      .then((elapsed: unknown) => {
        if (typeof elapsed === 'number') tell('start', elapsed);
      })
      .catch(() => undefined);
  },
});
