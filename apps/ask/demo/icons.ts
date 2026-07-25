export const chevronIcon = (direction: 'left' | 'right'): string => {
  const d = direction === 'left' ? 'M15 5l-7 7 7 7' : 'M9 5l7 7-7 7';
  return `<svg viewBox="0 0 24 24" width="20" height="20" aria-hidden="true"><path d="${d}" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>`;
};

export const fullscreenIcon = (): string =>
  '<svg viewBox="0 0 24 24" width="18" height="18" aria-hidden="true"><path d="M4 9V5a1 1 0 0 1 1-1h4M15 4h4a1 1 0 0 1 1 1v4M20 15v4a1 1 0 0 1-1 1h-4M9 20H5a1 1 0 0 1-1-1v-4" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export const infoIcon = (): string =>
  '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><circle cx="10" cy="10" r="8.5" fill="none" stroke="currentColor" stroke-width="1.5"/><line x1="10" y1="9" x2="10" y2="14" stroke="currentColor" stroke-width="1.5" stroke-linecap="round"/><circle cx="10" cy="6.2" r="1" fill="currentColor"/></svg>';

export const checkIcon = (): string =>
  '<svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><circle cx="10" cy="10" r="9" fill="currentColor"/><path d="M6 10.5l2.5 2.5L14 7.5" fill="none" stroke="white" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/></svg>';

export const phoneIcon = (): string =>
  '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M4 3h3l1.5 4-2 1.3a10 10 0 0 0 5.2 5.2l1.3-2 4 1.5v3a1 1 0 0 1-1.1 1A15 15 0 0 1 3 4.1 1 1 0 0 1 4 3z" fill="currentColor"/></svg>';

export const chatIcon = (): string =>
  '<svg viewBox="0 0 20 20" width="16" height="16" aria-hidden="true"><path d="M3 4h14a1 1 0 0 1 1 1v8a1 1 0 0 1-1 1H8l-4 3v-3H3a1 1 0 0 1-1-1V5a1 1 0 0 1 1-1z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/></svg>';

export const eyeIcon = (): string =>
  '<svg viewBox="0 0 20 20" width="14" height="14" aria-hidden="true"><path d="M1 10s3.5-6 9-6 9 6 9 6-3.5 6-9 6-9-6-9-6z" fill="none" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round"/><circle cx="10" cy="10" r="2.6" fill="currentColor"/></svg>';

export const cameraIcon = (): string =>
  '<svg viewBox="0 0 48 48" width="42" height="42" aria-hidden="true"><rect x="6" y="14" width="36" height="24" rx="4" fill="none" stroke="currentColor" stroke-width="2"/><circle cx="24" cy="26" r="7" fill="none" stroke="currentColor" stroke-width="2"/><rect x="17" y="9" width="14" height="6" rx="2" fill="currentColor"/></svg>';
