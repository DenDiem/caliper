import type {ComponentSource} from '../schema/annotation.schema';
import {HYPHENATED_BUILTIN_TAGS} from './html-tags';

export interface ComponentInfo {
  name: string | null;
  source: ComponentSource;
}

const isCustomElementTag = (tag: string): boolean =>
  tag.includes('-') && !HYPHENATED_BUILTIN_TAGS.has(tag);

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

export const resolveComponent = (element: Element): ComponentInfo => {
  const fromNg = readNgComponentName(element);
  if (fromNg) return {name: fromNg, source: 'ng-devmode'};

  const tag = element.tagName.toLowerCase();
  if (isCustomElementTag(tag)) return {name: tag, source: 'tag-heuristic'};

  return {name: null, source: null};
};

export const buildComponentChain = (element: Element): string[] => {
  const chain: string[] = [];
  let current: Element | null = element;
  while (current) {
    const tag = current.tagName.toLowerCase();
    if (isCustomElementTag(tag)) chain.push(tag);
    current = current.parentElement;
  }
  return chain;
};
