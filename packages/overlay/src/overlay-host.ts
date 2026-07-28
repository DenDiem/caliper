const DEFAULT_HOST_ID = 'caliper-overlay-host';

export interface OverlayHost {
  root: ShadowRoot;
  destroy(): void;
}

export const createOverlayHost = (styles: string, hostId: string = DEFAULT_HOST_ID): OverlayHost => {
  document.getElementById(hostId)?.remove();

  const host = document.createElement('div');
  host.id = hostId;
  host.setAttribute('data-caliper-overlay', '');
  host.style.position = 'fixed';
  host.style.inset = '0';
  host.style.zIndex = '2147483647';
  host.style.pointerEvents = 'none';
  document.documentElement.append(host);

  const root = host.attachShadow({mode: 'open'});
  const sheet = new CSSStyleSheet();
  sheet.replaceSync(styles);
  root.adoptedStyleSheets = [sheet];

  return {
    root,
    destroy: () => host.remove(),
  };
};
