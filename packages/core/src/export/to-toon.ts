import type {CaliperAnnotation, CaliperSession} from '../schema/annotation.schema';

const ID_LENGTH = 8;
const ABSENT = '-';

const cell = (value: string | null | undefined): string => {
  const flat = (value ?? ABSENT).replace(/\s+/g, ' ').trim();
  if (!flat) return ABSENT;
  if (!/[",]/.test(flat)) return flat;
  return `"${flat.replace(/"/g, '""')}"`;
};

const shortId = (id: string): string => id.slice(0, ID_LENGTH);

const table = (name: string, columns: readonly string[], rows: readonly string[][]): string => {
  if (rows.length === 0) return `${name}[0]: none`;

  const header = `${name}[${rows.length}]{${columns.join(',')}}:`;
  const body = rows.map((row) => `  ${row.join(',')}`);

  return [header, ...body].join('\n');
};

const annotationRow = (annotation: CaliperAnnotation): string[] => [
  shortId(annotation.id),
  annotation.severity,
  annotation.author,
  cell(annotation.verdict),
  cell(annotation.target.componentName),
  annotation.target.selectorConfidence,
  cell(annotation.target.selector),
  cell(annotation.page.url),
  cell(annotation.comment),
];

const styleRows = (annotation: CaliperAnnotation): string[][] =>
  Object.entries(annotation.target.styles).map(([property, style]) => [
    shortId(annotation.id),
    property,
    cell(style.value),
    cell(style.token),
    cell(style.tokenMatch),
  ]);

export const toToon = (session: CaliperSession): string => {
  const head = [
    'session{id,schemaVersion,caliperVersion,count}:',
    `  ${shortId(session.id)},${session.schemaVersion},${session.caliperVersion},${session.annotations.length}`,
  ].join('\n');

  const annotations = table(
    'annotations',
    ['id', 'severity', 'author', 'verdict', 'component', 'confidence', 'selector', 'url', 'comment'],
    session.annotations.map(annotationRow),
  );

  const styles = table(
    'styles',
    ['annotation', 'property', 'value', 'token', 'match'],
    session.annotations.flatMap(styleRows),
  );

  return [head, annotations, styles].join('\n\n');
};
