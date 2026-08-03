import type {ComponentSource} from '../schema/annotation.schema';
import {isAppComponentTag, isCustomElementTag} from './is-app-component';

export interface ComponentInfo {
  name: string | null;
  source: ComponentSource;
}

const readNgComponentName = (element: Element): string | null => {
  const ng: unknown = Reflect.get(globalThis, 'ng');
  if (!ng || typeof ng !== 'object') return null;
  const getOwningComponent: unknown = Reflect.get(ng, 'getOwningComponent');
  if (typeof getOwningComponent !== 'function') return null;
  try {
    const instance: unknown = getOwningComponent.call(ng, element);
    if (!instance || typeof instance !== 'object') return null;
    const name: unknown = instance.constructor?.name;
    if (typeof name !== 'string') return null;
    // Angular dev builds mangle the class to `_StatCardComponent`; the mark should read the source name.
    const cleaned = name.replace(/^_+/, '');
    return cleaned.length > 0 ? cleaned : null;
  } catch {
    return null;
  }
};

const nearestTag = (element: Element, accept: (tag: string) => boolean): string | null => {
  let current: Element | null = element;
  while (current) {
    const tag = current.tagName.toLowerCase();
    if (accept(tag)) return tag;
    current = current.parentElement;
  }
  return null;
};

export const resolveComponent = (element: Element): ComponentInfo => {
  const fromNg = readNgComponentName(element);
  if (fromNg) return {name: fromNg, source: 'ng-devmode'};

  const ownTag = element.tagName.toLowerCase();
  const appComponent = nearestTag(element, isAppComponentTag);
  if (appComponent) return {name: appComponent, source: 'tag-heuristic'};

  if (isCustomElementTag(ownTag)) return {name: ownTag, source: 'tag-heuristic'};

  return {name: null, source: null};
};

// The nearest app-component element (self or ancestor) that owns the picked element. The visible-box
// CSS a mark means — margin, position, alignment — usually lives on this host, not the inner wrapper,
// so extract-context collects its styles separately when the host is a different element than the target.
export const resolveComponentHost = (element: Element): Element | null => {
  let current: Element | null = element;
  while (current) {
    if (isAppComponentTag(current.tagName.toLowerCase())) return current;
    current = current.parentElement;
  }
  return null;
};

export const buildComponentChain = (element: Element): string[] => {
  const chain: string[] = [];
  let current: Element | null = element;
  while (current) {
    const tag = current.tagName.toLowerCase();
    if (isAppComponentTag(tag)) chain.push(tag);
    current = current.parentElement;
  }
  return chain;
};
