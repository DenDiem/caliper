import type {ReviewZoneState} from '@caliper/core';
import type * as preact from 'preact';
import type {ReviewClientStore, ReviewOtherPageGroup} from './review-controller';

export interface PanelProps {
  store: ReviewClientStore;
}

interface PanelItemProps {
  zone: ReviewZoneState;
  number: number;
  store: ReviewClientStore;
}

const UNREACHABLE_HINT =
  "Not here yet — you may need to log in or complete a flow on this page to reach this element; it will appear once it's on screen.";

const PanelItem = ({zone, number, store}: PanelItemProps) => {
  const resolved = store.isResolved(zone.ref);
  const active = store.activeRef() === zone.ref;

  const activate = (): void => store.setActiveRef(zone.ref);

  const onHeaderKeyDown = (event: preact.JSX.TargetedKeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activate();
    }
  };

  return (
    <li
      class={active ? 'caliper-panel__item caliper-panel__item--active' : 'caliper-panel__item'}
      onMouseEnter={() => store.setHoverRef(zone.ref)}
      onMouseLeave={() => store.setHoverRef(null)}
    >
      <div
        class="caliper-panel__item-header"
        role="button"
        tabIndex={0}
        onClick={activate}
        onKeyDown={onHeaderKeyDown}
      >
        <span class="caliper-panel__badge-number">{number}</span>
        <div class="caliper-panel__item-body">
          <span class="caliper-panel__question">{zone.question}</span>
          <span
            class={
              resolved
                ? 'caliper-panel__badge caliper-panel__badge--resolved'
                : 'caliper-panel__badge caliper-panel__badge--unresolved'
            }
          >
            {resolved ? 'Resolved' : 'Not on screen yet'}
          </span>
        </div>
      </div>

      {resolved ? null : (
        <>
          <p class="caliper-panel__hint">{UNREACHABLE_HINT}</p>
          <button type="button" class="caliper-panel__reanchor" onClick={() => store.reanchor(zone.ref)}>
            Re-anchor
          </button>
        </>
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

interface OtherPageGroupSectionProps {
  group: ReviewOtherPageGroup;
}

const OtherPageGroupSection = ({group}: OtherPageGroupSectionProps) => (
  <li class="caliper-panel__route-group">
    <span class="caliper-panel__route-header">
      {group.route} ({group.zones.length})
    </span>
    <ul class="caliper-panel__route-list">
      {group.zones.map((zone) => (
        <li key={zone.ref} class="caliper-panel__other-item">
          <span class="caliper-panel__other-question">{zone.question}</span>
          <button type="button" class="caliper-panel__goto" onClick={() => location.assign(group.route)}>
            Go to this page →
          </button>
        </li>
      ))}
    </ul>
  </li>
);

const CollapsedTab = ({store}: PanelProps) => {
  const unansweredCount = store.zones().filter((zone) => !zone.answered).length;

  return (
    <button type="button" class="caliper-panel-tab" onClick={() => store.setCollapsed(false)}>
      <span class="caliper-panel-tab__icon" aria-hidden="true">
        «
      </span>
      <span class="caliper-panel-tab__name">Caliper</span>
      <span class="caliper-panel-tab__count">{unansweredCount}</span>
    </button>
  );
};

export const Panel = ({store}: PanelProps) => {
  if (store.isCollapsed()) return <CollapsedTab store={store} />;

  const zones = store.zones();
  const pageGroups = store.pageGroups();

  return (
    <div class="caliper-panel">
      <div class="caliper-panel__header">
        <span class="caliper-panel__title">Caliper review</span>
        <div class="caliper-panel__header-actions">
          <span class="caliper-panel__count">{zones.length}</span>
          <button
            type="button"
            class="caliper-panel__collapse"
            onClick={() => store.setCollapsed(true)}
            aria-label="Collapse panel"
          >
            »
          </button>
        </div>
      </div>

      {store.syncNotice() ? <p class="caliper-panel__notice">{store.syncNotice()}</p> : null}

      <div class="caliper-panel__body">
        <span class="caliper-panel__section-title">On this page ({pageGroups.onPage.length})</span>
        <ul class="caliper-panel__list">
          {pageGroups.onPage.map((zone, index) => (
            <PanelItem key={zone.ref} zone={zone} number={index + 1} store={store} />
          ))}
        </ul>

        {pageGroups.otherPages.length > 0 ? (
          <>
            <span class="caliper-panel__section-title">Other pages</span>
            <ul class="caliper-panel__route-groups">
              {pageGroups.otherPages.map((group) => (
                <OtherPageGroupSection key={group.route} group={group} />
              ))}
            </ul>
          </>
        ) : null}
      </div>

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
