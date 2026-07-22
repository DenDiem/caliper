import {STYLE_ALLOWLIST} from './style-allowlist';
import {
  BORDER_COLOR_PROPERTIES,
  BORDER_WIDTH_PROPERTIES,
  INHERITED_PROPERTIES,
  LAYOUT_ONLY_PROPERTIES,
  isLayoutContainer,
  isNoise,
} from './style-noise';

const hasVisibleBorder = (computed: CSSStyleDeclaration): boolean =>
  BORDER_WIDTH_PROPERTIES.some((property) => {
    const width = computed.getPropertyValue(property).trim();
    return width !== '' && width !== '0px';
  });

export const collectStyles = (element: Element): Record<string, string> => {
  const computed = getComputedStyle(element);
  const inherited = element.parentElement ? getComputedStyle(element.parentElement) : null;

  const layoutContainer = isLayoutContainer(computed.getPropertyValue('display'));
  const bordered = hasVisibleBorder(computed);
  const styles: Record<string, string> = {};

  for (const property of STYLE_ALLOWLIST) {
    if (!layoutContainer && LAYOUT_ONLY_PROPERTIES.has(property)) continue;
    if (!bordered && BORDER_COLOR_PROPERTIES.has(property)) continue;

    const value = computed.getPropertyValue(property).trim();
    if (!value) continue;
    if (isNoise(property, value)) continue;

    if (
      INHERITED_PROPERTIES.has(property) &&
      inherited?.getPropertyValue(property).trim() === value
    ) {
      continue;
    }

    styles[property] = value;
  }

  return styles;
};
