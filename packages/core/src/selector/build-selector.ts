import type {SelectorConfidence, SelectorStrategy} from '../schema/annotation.schema';
import {isGeneratedId} from './is-generated-id';

export interface SelectorResult {
  selector: string;
  strategy: SelectorStrategy;
  confidence: SelectorConfidence;
}

const TESTID_ATTRIBUTES = ['data-testid', 'data-test', 'data-qa'] as const;
const UTILITY_CLASS_PATTERN = /^(ng-|mat-|cdk-|is-|has-)|\d{3,}/;

const isCustomElement = (element: Element): boolean => element.tagName.includes('-');

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

const nearestCustomAncestor = (element: Element): Element | null => {
  let current = element.parentElement;
  while (current) {
    if (isCustomElement(current)) return current;
    current = current.parentElement;
  }
  return null;
};

const nthPath = (element: Element): string => {
  const parts: string[] = [];
  let current: Element | null = element;
  while (current && current !== document.body) {
    const parent: Element | null = current.parentElement;
    if (!parent) break;
    const index = Array.from(parent.children).indexOf(current) + 1;
    parts.unshift(`${current.tagName.toLowerCase()}:nth-child(${index})`);
    current = parent;
  }
  return parts.join(' > ');
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

  const ancestor = nearestCustomAncestor(element);
  if (ancestor) {
    const selector = `${ancestor.tagName.toLowerCase()} ${localPart(element)}`;
    if (document.querySelectorAll(selector).length === 1) {
      return {selector, strategy: 'component-path', confidence: 'medium'};
    }
  }

  if (
    isCustomElement(element) &&
    document.querySelectorAll(element.tagName.toLowerCase()).length === 1
  ) {
    return {
      selector: element.tagName.toLowerCase(),
      strategy: 'component-path',
      confidence: 'medium',
    };
  }

  return {selector: nthPath(element), strategy: 'nth-path', confidence: 'low'};
};
