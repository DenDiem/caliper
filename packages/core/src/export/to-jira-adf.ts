import type {CaliperAnnotation, CaliperSession} from '../schema/annotation.schema';
import type {CaliperTrace} from '../schema/trace.schema';
import {truncationNote} from './trace-toon';

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

const MS_PER_SECOND = 1000;

const plural = (count: number, noun: string): string =>
  `${count} ${noun}${count === 1 ? '' : 's'}`;

const heading = (session: CaliperSession): string => {
  const parts = [plural(session.annotations.length, 'defect')];
  if (session.traces.length > 0) parts.push(plural(session.traces.length, 'trace'));
  return `Caliper QA — ${parts.join(', ')}`;
};

// The video is the half of a trace made for whoever reads the ticket, so this is the one place its
// filename belongs — the agent-facing TOON deliberately never names it. Without this the attachments
// arrive silently and a trace-only session posts a comment claiming "0 defects" and nothing else.
const traceBullet = (trace: CaliperTrace): AdfNode => {
  const {steps, consoleErrors, failedRequests, stateActions} = trace.summary;
  const summary = [
    plural(steps, 'step'),
    plural(consoleErrors, 'console error'),
    plural(failedRequests, 'failed request'),
    plural(stateActions, 'state action'),
  ].join(', ');

  const lines: AdfNode[] = [
    text(`${trace.label} `),
    text(`(${(trace.durationMs / MS_PER_SECOND).toFixed(1)}s)`),
    {type: 'hardBreak'},
    text(summary),
  ];

  if (trace.files.video) {
    lines.push({type: 'hardBreak'}, text('video: '), text(trace.files.video, [{type: 'code'}]));
  }
  if (trace.truncated) {
    lines.push({type: 'hardBreak'}, text(`truncated: ${truncationNote(trace)}`));
  }

  return {type: 'listItem', content: [{type: 'paragraph', content: lines}]};
};

export const sessionToJiraComment = (
  session: CaliperSession,
  media?: Record<number, MediaRef>,
): AdfDoc => {
  const content: AdfNode[] = [
    {type: 'heading', attrs: {level: 3}, content: [text(heading(session))]},
  ];

  // An empty bulletList is not valid ADF, so each list is emitted only when it has an item.
  if (session.annotations.length > 0) {
    content.push({
      type: 'bulletList',
      content: session.annotations.map((annotation, index) => bullet(annotation, index, media)),
    });
  }

  if (session.traces.length > 0) {
    content.push(
      {type: 'heading', attrs: {level: 4}, content: [text('Recorded traces')]},
      {type: 'bulletList', content: session.traces.map(traceBullet)},
      {
        type: 'paragraph',
        content: [
          text('Attached for the agent: '),
          text('caliper pull ' + '<this issue>', [{type: 'code'}]),
          text(' reconstructs the whole session offline.'),
        ],
      },
    );
  }

  return {type: 'doc', version: 1, content};
};
