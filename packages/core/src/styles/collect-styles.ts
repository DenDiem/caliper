import {STYLE_ALLOWLIST} from './style-allowlist';

export const collectStyles = (element: Element): Record<string, string> => {
  const computed = getComputedStyle(element);
  const styles: Record<string, string> = {};

  for (const property of STYLE_ALLOWLIST) {
    const value = computed.getPropertyValue(property).trim();
    if (value) styles[property] = value;
  }

  return styles;
};
