import {STYLE_ALLOWLIST} from './style-allowlist';
import {LAYOUT_ONLY_PROPERTIES, isLayoutContainer, isNoise} from './style-noise';

export const collectStyles = (element: Element): Record<string, string> => {
  const computed = getComputedStyle(element);
  const layoutContainer = isLayoutContainer(computed.getPropertyValue('display'));
  const styles: Record<string, string> = {};

  for (const property of STYLE_ALLOWLIST) {
    if (!layoutContainer && LAYOUT_ONLY_PROPERTIES.has(property)) continue;

    const value = computed.getPropertyValue(property).trim();
    if (!value) continue;
    if (isNoise(property, value)) continue;

    styles[property] = value;
  }

  return styles;
};
