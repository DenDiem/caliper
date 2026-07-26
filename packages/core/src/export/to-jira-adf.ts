import type {CaliperAnnotation, CaliperSession} from '../schema/annotation.schema';

export interface AdfNode {
  type: string;
  attrs?: Record<string, unknown>;
  content?: AdfNode[];
  text?: string;
  marks?: {type: string}[];
}

export interface AdfDoc {
  type: 'doc';
  version: 1;
  content: AdfNode[];
}

const text = (value: string, marks?: {type: string}[]): AdfNode => ({
  type: 'text',
  text: value,
  ...(marks ? {marks} : {}),
});

const label = (annotation: CaliperAnnotation): string =>
  `[${annotation.severity}] ${annotation.target.componentName ?? annotation.target.tagName}: `;

const bullet = (annotation: CaliperAnnotation): AdfNode => ({
  type: 'listItem',
  content: [
    {
      type: 'paragraph',
      content: [
        text(label(annotation)),
        text(annotation.comment),
        {type: 'hardBreak'},
        text(annotation.target.selector, [{type: 'code'}]),
      ],
    },
  ],
});

export const sessionToJiraComment = (session: CaliperSession): AdfDoc => {
  const count = session.annotations.length;

  return {
    type: 'doc',
    version: 1,
    content: [
      {
        type: 'heading',
        attrs: {level: 3},
        content: [text(`Caliper QA — ${count} defect${count === 1 ? '' : 's'}`)],
      },
      {type: 'bulletList', content: session.annotations.map(bullet)},
    ],
  };
};
