const ZERO_LENGTH = ['0px'];

export const NOISE_VALUES: Readonly<Record<string, readonly string[]>> = {
  'align-items': ['normal'],
  'background-color': ['rgba(0, 0, 0, 0)', 'transparent'],
  'border-bottom-width': ZERO_LENGTH,
  'border-left-width': ZERO_LENGTH,
  'border-radius': ZERO_LENGTH,
  'border-right-width': ZERO_LENGTH,
  'border-top-width': ZERO_LENGTH,
  'box-shadow': ['none'],
  'column-gap': ['normal'],
  'flex-direction': ['row'],
  'flex-wrap': ['nowrap'],
  'font-style': ['normal'],
  gap: ['normal'],
  'grid-template-columns': ['none'],
  'justify-content': ['normal'],
  'letter-spacing': ['normal'],
  'line-height': ['normal'],
  'margin-bottom': ZERO_LENGTH,
  'margin-left': ZERO_LENGTH,
  'margin-right': ZERO_LENGTH,
  'margin-top': ZERO_LENGTH,
  'max-width': ['none'],
  'min-height': ['auto', '0px'],
  opacity: ['1'],
  overflow: ['visible'],
  'padding-bottom': ZERO_LENGTH,
  'padding-left': ZERO_LENGTH,
  'padding-right': ZERO_LENGTH,
  'padding-top': ZERO_LENGTH,
  position: ['static'],
  'row-gap': ['normal'],
  'text-align': ['start'],
  'text-decoration-line': ['none'],
  'text-transform': ['none'],
  transform: ['none'],
  'white-space': ['normal'],
  'z-index': ['auto'],
};

export const LAYOUT_ONLY_PROPERTIES: ReadonlySet<string> = new Set([
  'align-items',
  'column-gap',
  'flex-direction',
  'flex-wrap',
  'gap',
  'grid-template-columns',
  'justify-content',
  'row-gap',
]);

const LAYOUT_DISPLAY_VALUES = ['flex', 'grid'];

export const isLayoutContainer = (display: string): boolean =>
  LAYOUT_DISPLAY_VALUES.some((value) => display.includes(value));

export const isNoise = (property: string, value: string): boolean =>
  NOISE_VALUES[property]?.includes(value) ?? false;
