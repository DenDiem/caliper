import type {ComponentInfo} from '../component/resolve-component';
import {buildComponentChain, resolveComponent} from '../component/resolve-component';
import type {ElementContext} from '../schema/annotation.schema';
import {buildSelector} from '../selector/build-selector';
import {collectStyles} from '../styles/collect-styles';
import type {TokenMap} from '../tokens/match-token';
import {toStyleValues} from '../tokens/match-token';

const MAX_TEXT_LENGTH = 120;
const IDENTIFYING_ATTRIBUTE_PREFIXES = ['data-', 'aria-'];
const IDENTIFYING_ATTRIBUTES = ['id', 'class', 'role', 'href', 'type', 'name', 'placeholder'];

const isIdentifying = (name: string): boolean =>
  IDENTIFYING_ATTRIBUTES.includes(name) ||
  IDENTIFYING_ATTRIBUTE_PREFIXES.some((prefix) => name.startsWith(prefix));

const collectAttributes = (element: Element): Record<string, string> => {
  const attributes: Record<string, string> = {};
  for (const attribute of Array.from(element.attributes)) {
    if (isIdentifying(attribute.name)) attributes[attribute.name] = attribute.value;
  }
  return attributes;
};

const resolveOwningComponent = (element: Element, chain: readonly string[]): ComponentInfo => {
  const direct = resolveComponent(element);
  if (direct.name) return direct;

  const nearest = chain[0];
  return nearest ? {name: nearest, source: 'tag-heuristic'} : direct;
};

export const extractContext = (element: Element, tokens: TokenMap): ElementContext => {
  const {selector, strategy, confidence} = buildSelector(element);
  const componentChain = buildComponentChain(element);
  const {name, source} = resolveOwningComponent(element, componentChain);
  const rect = element.getBoundingClientRect();

  return {
    selector,
    selectorStrategy: strategy,
    selectorConfidence: confidence,
    tagName: element.tagName.toLowerCase(),
    componentName: name,
    componentSource: source,
    componentChain,
    text: (element.textContent ?? '').trim().slice(0, MAX_TEXT_LENGTH),
    attributes: collectAttributes(element),
    box: {
      x: Math.round(rect.x),
      y: Math.round(rect.y),
      width: Math.round(rect.width),
      height: Math.round(rect.height),
    },
    styles: toStyleValues(collectStyles(element), tokens),
  };
};
