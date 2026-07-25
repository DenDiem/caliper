const PANEL_WIDTH_FALLBACK_PX = 320;
const DOCK_TRANSITION = 'margin-right 0.2s ease';

export interface DockController {
  update(): void;
}

export interface DockOptions {
  target: HTMLElement;
  isCollapsed: () => boolean;
  getPanelElement: () => HTMLElement | null;
}

// Docks the proxied app the way browser devtools dock: the panel stays `position: fixed` in its own
// gap, and only the app's root gets pushed over via `margin-right`, so it never sits on top of app
// content. A ResizeObserver on the panel (not just the collapse toggle) covers `max-width: 90vw`
// kicking in on narrow viewports.
export const startDock = ({target, isCollapsed, getPanelElement}: DockOptions): DockController => {
  target.style.transition = DOCK_TRANSITION;

  const apply = (): void => {
    if (isCollapsed()) {
      target.style.marginRight = '';
      return;
    }
    const panel = getPanelElement();
    target.style.marginRight = `${panel ? panel.offsetWidth : PANEL_WIDTH_FALLBACK_PX}px`;
  };

  let observedPanel: HTMLElement | null = null;
  const resizeObserver = new ResizeObserver(apply);

  const syncObservedPanel = (): void => {
    const panel = isCollapsed() ? null : getPanelElement();
    if (panel === observedPanel) return;
    if (observedPanel) resizeObserver.unobserve(observedPanel);
    if (panel) resizeObserver.observe(panel);
    observedPanel = panel;
  };

  return {
    update: (): void => {
      syncObservedPanel();
      apply();
    },
  };
};
