import {describe, expect, it} from 'vitest';
import {describeStep} from './steps';

const selectorOf = (element: Element): string => element.tagName.toLowerCase();

describe('describeStep', () => {
  it('describes a click with its selector and trimmed label', () => {
    document.body.innerHTML = '<button>  Save order  </button>';
    const button = document.querySelector('button')!;
    const event = new MouseEvent('click', {bubbles: true});
    Object.defineProperty(event, 'target', {value: button});

    expect(describeStep(event, 1200, selectorOf)).toEqual({
      t: 1200,
      kind: 'click',
      selector: 'button',
      text: 'Save order',
    });
  });

  it('records that an input changed without recording what was typed', () => {
    document.body.innerHTML = '<input value="hunter2" />';
    const input = document.querySelector('input')!;
    const event = new Event('input', {bubbles: true});
    Object.defineProperty(event, 'target', {value: input});

    expect(describeStep(event, 900, selectorOf)).toEqual({
      t: 900,
      kind: 'input',
      selector: 'input',
      text: '7 chars',
    });
  });

  it('keeps only the navigational and submitting keys', () => {
    document.body.innerHTML = '<input />';
    const input = document.querySelector('input')!;
    const enter = new KeyboardEvent('keydown', {key: 'Enter', bubbles: true});
    Object.defineProperty(enter, 'target', {value: input});
    const letter = new KeyboardEvent('keydown', {key: 'a', bubbles: true});
    Object.defineProperty(letter, 'target', {value: input});

    expect(describeStep(enter, 10, selectorOf)).toMatchObject({kind: 'key', text: 'Enter'});
    expect(describeStep(letter, 20, selectorOf)).toBeNull();
  });

  it('ignores an event whose target is not an element', () => {
    const event = new Event('click');
    Object.defineProperty(event, 'target', {value: null});
    expect(describeStep(event, 0, selectorOf)).toBeNull();
  });

  it('ignores an unhandled event type', () => {
    document.body.innerHTML = '<div></div>';
    const event = new Event('mouseover', {bubbles: true});
    Object.defineProperty(event, 'target', {value: document.querySelector('div')});
    expect(describeStep(event, 0, selectorOf)).toBeNull();
  });
});
