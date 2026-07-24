import type {ReviewZoneState} from '@caliper/core';
import type * as preact from 'preact';
import type {ReviewClientStore} from './review-controller';

export interface PanelProps {
  store: ReviewClientStore;
}

interface PanelItemProps {
  zone: ReviewZoneState;
  store: ReviewClientStore;
}

const PanelItem = ({zone, store}: PanelItemProps) => {
  const resolved = store.isResolved(zone.ref);
  const active = store.activeRef() === zone.ref;

  const locate = (): void => {
    store.setActiveRef(zone.ref);
    if (zone.route && zone.route !== location.pathname) location.assign(zone.route);
  };

  const onHeaderKeyDown = (event: preact.JSX.TargetedKeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      locate();
    }
  };

  return (
    <li class={active ? 'caliper-panel__item caliper-panel__item--active' : 'caliper-panel__item'}>
      <div
        class="caliper-panel__item-header"
        role="button"
        tabIndex={0}
        onClick={locate}
        onKeyDown={onHeaderKeyDown}
      >
        <span class="caliper-panel__question">{zone.question}</span>
        <span
          class={
            resolved
              ? 'caliper-panel__badge caliper-panel__badge--resolved'
              : 'caliper-panel__badge caliper-panel__badge--unresolved'
          }
        >
          {resolved ? 'Resolved' : 'Not found on this route'}
        </span>
      </div>

      {resolved ? null : (
        <button type="button" class="caliper-panel__reanchor" onClick={() => store.reanchor(zone.ref)}>
          Re-anchor
        </button>
      )}

      <textarea
        class="caliper-panel__answer"
        value={store.draft(zone.ref)}
        placeholder="Answer…"
        onInput={(event: preact.JSX.TargetedEvent<HTMLTextAreaElement>) =>
          store.setDraft(zone.ref, event.currentTarget.value)
        }
        onBlur={() => store.saveDraft(zone.ref)}
      />
    </li>
  );
};

export const Panel = ({store}: PanelProps) => {
  const zones = store.zones();

  return (
    <div class="caliper-panel">
      <div class="caliper-panel__header">
        <span class="caliper-panel__title">Caliper review</span>
        <span class="caliper-panel__count">{zones.length}</span>
      </div>

      {store.liveSyncLost() ? (
        <p class="caliper-panel__notice">Live sync lost — reload the page</p>
      ) : null}

      <ul class="caliper-panel__list">
        {zones.map((zone) => (
          <PanelItem key={zone.ref} zone={zone} store={store} />
        ))}
      </ul>

      <div class="caliper-panel__footer">
        {store.submitError() ? <p class="caliper-panel__error">{store.submitError()}</p> : null}
        <button
          type="button"
          class="caliper-panel__submit"
          disabled={store.isSubmitting()}
          onClick={() => void store.submit()}
        >
          {store.isSubmitting() ? 'Submitting…' : 'Submit'}
        </button>
      </div>
    </div>
  );
};
