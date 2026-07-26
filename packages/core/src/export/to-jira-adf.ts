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

export interface MediaRef {
  id: string;
  collection?: string;
}

const ordinal = (index: number): string => String(index + 1).padStart(2, '0');

const slug = (annotation: CaliperAnnotation): string => {
  const base = (annotation.target.componentName ?? annotation.target.tagName).toLowerCase();
  return base.replace(/[^a-z0-9]+/g, '-').replace(/(^-|-$)/g, '').slice(0, 24) || 'element';
};

export const screenshotFilename = (index: number, annotation: CaliperAnnotation): string =>
  `caliper-${ordinal(index)}-${slug(annotation)}.png`;

const text = (value: string, marks?: {type: string}[]): AdfNode => ({
  type: 'text',
  text: value,
  ...(marks ? {marks} : {}),
});

const label = (annotation: CaliperAnnotation): string =>
  `[${annotation.severity}] ${annotation.target.componentName ?? annotation.target.tagName}: `;

const mediaSingle = (ref: MediaRef): AdfNode => ({
  type: 'mediaSingle',
  attrs: {layout: 'align-start'},
  content: [{type: 'media', attrs: {type: 'file', id: ref.id, collection: ref.collection ?? ''}}],
});

const bullet = (annotation: CaliperAnnotation, index: number, media?: Record<number, MediaRef>): AdfNode => {
  const content: AdfNode[] = [
    {
      type: 'paragraph',
      content: [
        text(`#${ordinal(index)} ${label(annotation)}`),
        text(annotation.comment),
        {type: 'hardBreak'},
        text(annotation.target.selector, [{type: 'code'}]),
      ],
    },
  ];

  const ref = media?.[index];
  if (ref) content.push(mediaSingle(ref));

  return {type: 'listItem', content};
};

export const sessionToJiraComment = (
  session: CaliperSession,
  media?: Record<number, MediaRef>,
): AdfDoc => {
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
      {type: 'bulletList', content: session.annotations.map((annotation, index) => bullet(annotation, index, media))},
    ],
  };
};
