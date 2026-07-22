import {HYPHENATED_BUILTIN_TAGS} from './html-tags';

export const isCustomElementTag = (tag: string): boolean =>
  tag.includes('-') && !HYPHENATED_BUILTIN_TAGS.has(tag);

const isRegisteredElement = (tag: string): boolean =>
  typeof customElements !== 'undefined' && customElements.get(tag) !== undefined;

export const isAppComponentTag = (tag: string): boolean =>
  isCustomElementTag(tag) && !isRegisteredElement(tag);
