import {HYPHENATED_BUILTIN_TAGS} from './html-tags';

const VENDOR_PREFIXES: readonly string[] = [
  'ion-',
  'mat-',
  'mdc-',
  'cdk-',
  'mwc-',
  'md-',
  'sl-',
  'vaadin-',
  'fast-',
  'fluent-',
];

export const isCustomElementTag = (tag: string): boolean =>
  tag.includes('-') && !HYPHENATED_BUILTIN_TAGS.has(tag);

const hasVendorPrefix = (tag: string): boolean =>
  VENDOR_PREFIXES.some((prefix) => tag.startsWith(prefix));

const isRegisteredElement = (tag: string): boolean => {
  try {
    return globalThis.customElements?.get(tag) !== undefined;
  } catch {
    return false;
  }
};

export const isAppComponentTag = (tag: string): boolean =>
  isCustomElementTag(tag) && !hasVendorPrefix(tag) && !isRegisteredElement(tag);
