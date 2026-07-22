import {isAppComponentTag} from '../component/is-app-component';
import type {SelectorConfidence, SelectorStrategy} from '../schema/annotation.schema';
import {isGeneratedId} from './is-generated-id';

export interface SelectorResult {
  selector: string;
  strategy: SelectorStrategy;
  confidence: SelectorConfidence;
}

const TESTID_ATTRIBUTES = ['data-testid', 'data-test', 'data-qa'] as const;
const UTILITY_CLASS_PATTERN = /^(ng-|mat-|cdk-|is-|has-)|\d{3,}/;

const stableClass = (element: Element): string | null => {
  for (const className of Array.from(element.classList)) {
    if (!UTILITY_CLASS_PATTERN.test(className)) return className;
  }
  return null;
};

const localPart = (element: Element): string => {
  const tag = element.tagName.toLowerCase();
  const className = stableClass(element);
  return className ? `${tag}.${className}` : tag;
};

const isUnique = (selector: string): boolean => {
  try {
    return document.querySelectorAll(selector).length === 1;
  } catch {
    return false;
  }
};

const nthOfType = (element: Element): string => {
  const parent = element.parentElement;
  if (!parent) return '';

  const siblings = Array.from(parent.children).filter(
    (child) => child.tagName === element.tagName,
  );
  if (siblings.length < 2) return '';

  return `:nth-of-type(${siblings.indexOf(element) + 1})`;
};

const MAX_ANCHOR_DEPTH = 8;

const anchorPart = (element: Element): string | null => {
  const tag = element.tagName.toLowerCase();

  if (element.id && !isGeneratedId(element.id)) return `#${element.id}`;

  const className = stableClass(element);
  if (className) return `${tag}.${className}`;

  return isAppComponentTag(tag) ? tag : null;
};

interface Anchor {
  element: Element;
  part: string;
}

const anchors = (element: Element): Anchor[] => {
  const found: Anchor[] = [];
  let current = element.parentElement;

  while (current && current !== document.body && found.length < MAX_ANCHOR_DEPTH) {
    const part = anchorPart(current);
    if (part) found.push({element: current, part});
    current = current.parentElement;
  }

  return found;
};

const nthPathWithin = (element: Element, root: Element | null): string => {
  const stop: Node = root ?? document.body;
  const parts: string[] = [];
  let current: Element | null = element;

  while (current && current !== stop) {
    const parent: Element | null = current.parentElement;
    if (!parent) break;
    const index = Array.from(parent.children).indexOf(current) + 1;
    parts.unshift(`${current.tagName.toLowerCase()}:nth-child(${index})`);
    current = parent;
  }

  if (!root) return parts.join(' > ');

  return [`${root.tagName.toLowerCase()}${nthOfType(root)}`, ...parts].join(' > ');
};

export const buildSelector = (element: Element): SelectorResult => {
  for (const attribute of TESTID_ATTRIBUTES) {
    const value = element.getAttribute(attribute);
    if (value) {
      return {selector: `[${attribute}="${value}"]`, strategy: 'testid', confidence: 'high'};
    }
  }

  if (element.id && !isGeneratedId(element.id)) {
    return {selector: `#${element.id}`, strategy: 'id', confidence: 'high'};
  }

  const local = localPart(element);
  const found = anchors(element);

  for (const anchor of found) {
    const selector = `${anchor.part} ${local}`;
    if (isUnique(selector)) return {selector, strategy: 'component-path', confidence: 'medium'};
  }

  const ordinal = nthOfType(element);

  for (const anchor of found) {
    for (const part of [anchor.part, `${anchor.part}${nthOfType(anchor.element)}`]) {
      const selector = `${part} ${local}${ordinal}`;
      if (isUnique(selector)) return {selector, strategy: 'component-path', confidence: 'medium'};
    }
  }

  if (isAppComponentTag(element.tagName.toLowerCase()) && isUnique(local)) {
    return {selector: local, strategy: 'component-path', confidence: 'medium'};
  }

  const root = found[0]?.element ?? null;
  return {selector: nthPathWithin(element, root), strategy: 'nth-path', confidence: 'low'};
};
