import {render} from 'preact';
import {collectTokens} from '@caliper/core';
import {AnswerPopover, createOverlayHost, HighlightLayer} from '@caliper/overlay/review';
import type {OverlayHost} from '@caliper/overlay/review';
import {Panel} from './panel';
import {startController} from './review-controller';
import {events, fetchState} from './sink';
import reviewStyles from './review.css?inline';

const hostContainer = (host: OverlayHost): HTMLDivElement => {
  const container = document.createElement('div');
  container.style.pointerEvents = 'none';
  host.root.append(container);
  return container;
};

const boot = async (): Promise<void> => {
  const host = createOverlayHost(reviewStyles);
  const container = hostContainer(host);
  const store = startController({tokens: collectTokens(document)});

  const paint = (): void => {
    const popover = store.activePopover();
    render(
      <>
        <HighlightLayer boxes={store.boxes()} />
        <Panel store={store} />
        {popover ? <AnswerPopover {...popover} /> : null}
      </>,
      container,
    );
  };

  store.onChange(paint);
  paint();

  store.hydrate(await fetchState());

  const stream = events();
  stream.addEventListener('state', (event: MessageEvent<string>) => {
    store.hydrate(JSON.parse(event.data));
  });
};

void boot();
