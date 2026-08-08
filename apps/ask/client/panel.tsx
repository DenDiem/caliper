import type {ReviewZoneState} from '@caliper/core';
import type * as preact from 'preact';
import type {PageLedgerRow, ReviewClientStore} from './review-controller';

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

const LEDGER_DOTS_MAX = 4;

const PanelItem = ({zone, number, store}: PanelItemProps) => {
  const resolved = store.isResolved(zone.ref);
  const active = store.activeRef() === zone.ref;
  const answered = store.isAnswered(zone.ref);

  const activate = (): void => store.setActiveRef(zone.ref);

  const onHeaderKeyDown = (event: preact.JSX.TargetedKeyboardEvent<HTMLDivElement>): void => {
    if (event.key === 'Enter' || event.key === ' ') {
      event.preventDefault();
      activate();
    }
  };

  const itemClasses = ['caliper-panel__item'];
  if (active) itemClasses.push('caliper-panel__item--active');
  if (answered) itemClasses.push('caliper-panel__item--answered');

  const badgeClasses = answered
    ? 'caliper-panel__badge-number caliper-panel__badge-number--answered'
    : 'caliper-panel__badge-number';

  return (
    <li
      class={itemClasses.join(' ')}
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
        <span class={badgeClasses}>{answered ? '✓' : number}</span>
        <div class="caliper-panel__item-body">
          <span class="caliper-panel__question">{zone.question}</span>
          <span
            class={
              resolved
                ? 'caliper-panel__badge caliper-panel__badge--resolved'
                : 'caliper-panel__badge caliper-panel__badge--unresolved'
            }
          >
            {resolved ? 'On screen' : 'Not on screen yet'}
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

interface InlineOpenButtonProps {
  route: string;
  store: ReviewClientStore;
  class?: string;
}

// Navigation goes through the controller (not a bare `location.assign`) so a route carrying a `setup`
// snippet can open its consent gate first instead of navigating straight into a guard.
const InlineOpenButton = ({route, store, class: className}: InlineOpenButtonProps) => (
  <button
    type="button"
    class={className ?? 'caliper-panel__ledger-open'}
    onClick={() => store.navigateToRoute(route)}
  >
    Open →
  </button>
);

const renderLedgerDots = (total: number, answeredCount: number): string =>
  Array.from({length: total}, (_, index) => (index < answeredCount ? '●' : '○')).join('');

interface PageLedgerRowItemProps {
  row: PageLedgerRow;
  store: ReviewClientStore;
}

const PageLedgerRowItem = ({row, store}: PageLedgerRowItemProps) => {
  const label = row.route ?? 'Anywhere';
  const showOpen = !row.isCurrent && row.route !== null;

  return (
    <li
      class={
        row.isCurrent
          ? 'caliper-panel__ledger-row caliper-panel__ledger-row--current'
          : 'caliper-panel__ledger-row'
      }
    >
      <div class="caliper-panel__ledger-info">
        <span class="caliper-panel__ledger-route">{label}</span>
        {row.isCurrent ? <span class="caliper-panel__ledger-here">← here</span> : null}
      </div>
      <div class="caliper-panel__ledger-progress">
        {row.total <= LEDGER_DOTS_MAX ? (
          <span class="caliper-panel__ledger-dots" aria-hidden="true">
            {renderLedgerDots(row.total, row.answeredCount)}
          </span>
        ) : null}
        <span class="caliper-panel__ledger-count">
          {row.answeredCount}/{row.total}
        </span>
        {showOpen && row.route !== null ? <InlineOpenButton route={row.route} store={store} /> : null}
      </div>
    </li>
  );
};

interface PageLedgerSectionProps {
  ledger: readonly PageLedgerRow[];
  store: ReviewClientStore;
}

const PageLedgerSection = ({ledger, store}: PageLedgerSectionProps) => (
  <>
    <span class="caliper-panel__section-title">Pages</span>
    <ul class="caliper-panel__ledger">
      {ledger.map((row) => (
        <PageLedgerRowItem key={row.route ?? '__anywhere__'} row={row} store={store} />
      ))}
    </ul>
  </>
);

const findNextPendingRoute = (ledger: readonly PageLedgerRow[]): PageLedgerRow | undefined =>
  ledger.find((row) => row.route !== null && !row.isCurrent && row.answeredCount < row.total);

interface EmptyPageStateProps {
  ledger: readonly PageLedgerRow[];
  store: ReviewClientStore;
}

const EmptyPageState = ({ledger, store}: EmptyPageStateProps) => {
  const next = findNextPendingRoute(ledger);

  if (!next || next.route === null) {
    return (
      <div class="caliper-panel__empty-state">
        <p class="caliper-panel__empty-text">No questions on this page.</p>
      </div>
    );
  }

  const route = next.route;
  return (
    <div class="caliper-panel__empty-state">
      <p class="caliper-panel__empty-text">
        No questions on this page. First stop: {route} ({next.total})
      </p>
      <InlineOpenButton route={route} store={store} class="caliper-panel__empty-open" />
    </div>
  );
};

interface CompletionNudgeProps {
  store: ReviewClientStore;
}

const CompletionNudge = ({store}: CompletionNudgeProps) => {
  const onPageZones = store.onPageZones();
  if (onPageZones.length === 0) return null;
  if (!onPageZones.every((zone) => store.isAnswered(zone.ref))) return null;

  const ledger = store.pageLedger();
  const currentRow = ledger.find((row) => row.isCurrent);
  const currentLabel = currentRow?.route ?? location.pathname;
  const next = findNextPendingRoute(ledger);

  if (next && next.route !== null) {
    const route = next.route;
    return (
      <p class="caliper-panel__nudge">
        ✓ {currentLabel} done — next: {route} <InlineOpenButton route={route} store={store} class="caliper-panel__nudge-open" />
      </p>
    );
  }

  return <p class="caliper-panel__nudge caliper-panel__nudge--done">✓ all pages done — send your answers</p>;
};

interface OrientationLineProps {
  store: ReviewClientStore;
  pageCount: number;
}

const orientationMessage = (total: number, pageCount: number): string =>
  pageCount > 1
    ? `${total} questions across ${pageCount} pages. Answer inline — the app underneath still works, so navigate and log in as needed. Send when you're done.`
    : `${total} questions. Answer inline — the app underneath still works, so navigate and log in as needed. Send when you're done.`;

const OrientationLine = ({store, pageCount}: OrientationLineProps) => {
  if (store.orientationDismissed()) return null;

  return (
    <div class="caliper-panel__orientation">
      <p class="caliper-panel__orientation-text">{orientationMessage(store.progress().total, pageCount)}</p>
      <button type="button" class="caliper-panel__orientation-dismiss" onClick={() => store.dismissOrientation()}>
        [got it]
      </button>
    </div>
  );
};

const submitLabel = (store: ReviewClientStore, answered: number): string => {
  if (store.isSent()) return '✓ Sent';
  if (store.isSubmitting()) return 'Sending…';
  return `Send ${answered} & finish`;
};

const CollapsedTab = ({store}: PanelProps) => {
  const {answered, total} = store.progress();

  return (
    <button type="button" class="caliper-panel-tab" onClick={() => store.setCollapsed(false)}>
      <span class="caliper-panel-tab__icon" aria-hidden="true">
        «
      </span>
      <span class="caliper-panel-tab__name">Caliper</span>
      <span class="caliper-panel-tab__count">
        {answered}/{total}
      </span>
    </button>
  );
};

// The consent gate for a zone's `setup` snippet. It shows the exact JavaScript verbatim and never runs
// it until the developer clicks Run — the whole security model of the feature is this visibility +
// per-open consent. Skip navigates without running anything.
const SetupGate = ({store}: PanelProps) => {
  const pending = store.pendingSetup();
  if (!pending) return null;

  return (
    <div class="caliper-panel__setup-gate">
      <p class="caliper-panel__setup-title">
        Run setup to reach <code>{pending.route}</code>?
      </p>
      <p class="caliper-panel__setup-note">
        Runs agent-supplied JavaScript in your app so a route guard passes — review it first. It never
        runs on its own.
      </p>
      <pre class="caliper-panel__setup-code">{pending.snippet}</pre>
      <div class="caliper-panel__setup-actions">
        <button type="button" class="caliper-panel__setup-run" onClick={() => void store.runPendingSetup()}>
          Run &amp; open
        </button>
        <button type="button" class="caliper-panel__setup-skip" onClick={() => store.skipPendingSetup()}>
          Skip
        </button>
      </div>
    </div>
  );
};

export const Panel = ({store}: PanelProps) => {
  if (store.isCollapsed()) return <CollapsedTab store={store} />;

  const onPageZones = store.onPageZones();
  const ledger = store.pageLedger();
  const progress = store.progress();
  const realPageCount = ledger.filter((row) => row.route !== null).length;
  const progressPercent = progress.total > 0 ? Math.round((progress.answered / progress.total) * 100) : 0;

  return (
    <div class="caliper-panel">
      <div class="caliper-panel__header">
        <span class="caliper-panel__title">Caliper review</span>
        <div class="caliper-panel__header-actions">
          <span class="caliper-panel__count">
            {progress.answered}/{progress.total}
          </span>
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

      <div class="caliper-panel__progress-track">
        <div class="caliper-panel__progress-fill" style={{width: `${progressPercent}%`}} />
      </div>

      <OrientationLine store={store} pageCount={realPageCount} />

      {store.syncNotice() ? <p class="caliper-panel__notice">{store.syncNotice()}</p> : null}
      {store.setupNotice() ? <p class="caliper-panel__setup-warning">{store.setupNotice()}</p> : null}
      <SetupGate store={store} />

      <div class="caliper-panel__body">
        {realPageCount > 1 ? <PageLedgerSection ledger={ledger} store={store} /> : null}

        <span class="caliper-panel__section-title">On this page ({onPageZones.length})</span>
        {onPageZones.length === 0 ? (
          <EmptyPageState ledger={ledger} store={store} />
        ) : (
          <ul class="caliper-panel__list">
            {onPageZones.map((zone, index) => (
              <PanelItem key={zone.ref} zone={zone} number={index + 1} store={store} />
            ))}
          </ul>
        )}
      </div>

      <div class="caliper-panel__footer">
        <CompletionNudge store={store} />
        {store.submitError() ? <p class="caliper-panel__error">{store.submitError()}</p> : null}
        <button
          type="button"
          class="caliper-panel__submit"
          disabled={store.isSubmitting() || store.isSent()}
          onClick={() => void store.submit()}
        >
          {submitLabel(store, progress.answered)}
        </button>
        {progress.answered < progress.total ? (
          <p class="caliper-panel__submit-hint">
            {progress.total - progress.answered} unanswered will be sent as skipped.
          </p>
        ) : null}
      </div>
    </div>
  );
};
