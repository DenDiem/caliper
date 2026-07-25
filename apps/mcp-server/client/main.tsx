import {render} from 'preact';
import {collectTokens} from '@caliper/core';
import type {ReviewSessionState} from '@caliper/core';
import {AnswerPopover, createOverlayHost, HighlightLayer} from '@caliper/overlay/review';
import type {OverlayHost} from '@caliper/overlay/review';
import {Panel} from './panel';
import {startController} from './review-controller';
import {bootstrap, events, fetchState} from './sink';
import reviewStyles from './review.css?inline';

const LIVE_SYNC_LOST_MESSAGE = 'Live sync lost — reload the page';

const hostContainer = (host: OverlayHost): HTMLDivElement => {
  const container = document.createElement('div');
  container.style.pointerEvents = 'none';
  host.root.append(container);
  return container;
};

const boot = async (): Promise<void> => {
  const host = createOverlayHost(reviewStyles, 'caliper-review-host');
  const container = hostContainer(host);
  const store = startController({tokens: collectTokens(document)});

  const paint = (): void => {
    const popover = store.activePopover();
    render(
      <>
        <HighlightLayer boxes={store.boxes()} />
        <Panel store={store} />
        {popover ? <AnswerPopover key={popover.zoneRef} {...popover} /> : null}
      </>,
      container,
    );
  };

  store.onChange(paint);
  paint();

  try {
    await bootstrap();
  } catch (error) {
    store.setSyncNotice(error instanceof Error ? error.message : 'Caliper could not reach its server.');
    return;
  }

  store.hydrate(await fetchState());

  const stream = events();
  stream.addEventListener('state', (event: MessageEvent<string>) => {
    let state: ReviewSessionState;
    try {
      state = JSON.parse(event.data);
    } catch {
      return;
    }
    store.setSyncNotice(null);
    store.hydrate(state);
  });

  stream.addEventListener('error', () => {
    if (stream.readyState === EventSource.CLOSED) store.setSyncNotice(LIVE_SYNC_LOST_MESSAGE);
  });
};

void boot().catch((error: unknown) => {
  console.error('Caliper review client failed to boot', error);
});
