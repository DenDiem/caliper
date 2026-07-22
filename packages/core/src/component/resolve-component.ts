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
    return typeof name === 'string' && name.length > 0 ? name : null;
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
