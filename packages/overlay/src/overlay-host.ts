const DEFAULT_HOST_ID = 'caliper-overlay-host';

export interface OverlayHost {
  root: ShadowRoot;
  setHidden(hidden: boolean): void;
  // Re-assert the host at the very top of the browser top layer. An app popover (Popover API) opened
  // after us would otherwise paint over our highlight — no z-index beats the top layer. Called when a
  // highlight/mark is about to show so it always sits above whatever the app just opened.
  raise(): void;
  destroy(): void;
}

// A plain z-index (even the max) still loses to the browser top layer, so an app dropdown rendered
// there (native <dialog>/popover) hides our highlight. Promoting the host to a manual popover puts it
// in the top layer too; re-showing it (raise) bumps it back above app popovers opened after us.
const HOST_STYLE =
  'position:fixed;inset:0;margin:0;border:0;padding:0;width:auto;height:auto;max-width:none;' +
  'max-height:none;overflow:visible;background:transparent;z-index:2147483647;pointer-events:none';

export const createOverlayHost = (styles: string, hostId: string = DEFAULT_HOST_ID): OverlayHost => {
  document.getElementById(hostId)?.remove();

  const host = document.createElement('div');
  host.id = hostId;
  host.setAttribute('data-caliper-overlay', '');
  host.style.cssText = HOST_STYLE;

  const topLayer = typeof host.showPopover === 'function';
  if (topLayer) host.setAttribute('popover', 'manual');

  document.documentElement.append(host);

  const show = (): void => {
    try {
      host.showPopover();
    } catch {
      // Already open, disconnected, or unsupported — the max z-index still applies as a fallback.
    }
  };

  if (topLayer) show();

  const root = host.attachShadow({mode: 'open'});
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(styles);
  root.adoptedStyleSheets = [sheet];

  return {
    root,
    // Hide for a clean capture (visibility, not removal) so the overlay's own marks are never baked
    // into the screenshot and the element doesn't reflow between being marked and being captured.
    setHidden: (hidden: boolean) => {
      host.style.visibility = hidden ? 'hidden' : '';
    },
    raise: () => {
      if (!topLayer) return;
      try {
        if (host.matches(':popover-open')) host.hidePopover();
      } catch {
        // no-op — fall through to re-show
      }
      show();
    },
    destroy: () => {
      try {
        if (topLayer && host.matches(':popover-open')) host.hidePopover();
      } catch {
        // no-op — removal drops it from the top layer anyway
      }
      host.remove();
    },
  };
};
