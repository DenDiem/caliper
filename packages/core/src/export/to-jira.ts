import type {CaliperAnnotation, CaliperSession} from '../schema/annotation.schema';

const cell = (value: string | null | undefined): string =>
  (value ?? '—').replace(/\s+/g, ' ').replace(/\|/g, '\\|').trim() || '—';

const row = (annotation: CaliperAnnotation, position: number): string => {
  const brittle = annotation.target.selectorConfidence === 'low' ? ' (!) brittle' : '';
  const token = Object.entries(annotation.target.styles).find(([, style]) => style.token);

  const columns = [
    String(position + 1),
    annotation.severity.toUpperCase(),
    cell(annotation.target.componentName ?? annotation.target.tagName),
    `{{${cell(annotation.target.selector)}}}${brittle}`,
    cell(annotation.comment),
    token ? `{{${token[0]}}} → {{${token[1].token}}}` : '—',
  ];

  return `|${columns.join('|')}|`;
};

const pages = (annotations: readonly CaliperAnnotation[]): string[] => [
  ...new Set(annotations.map((annotation) => annotation.page.url)),
];

export const toJiraComment = (session: CaliperSession): string => {
  const {annotations} = session;

  if (annotations.length === 0) return 'h3. Caliper — no defects recorded';

  const heading = `h3. Caliper — ${annotations.length} defect${annotations.length === 1 ? '' : 's'}`;

  const table = [
    '||#||Severity||Component||Selector||What is wrong||Design token||',
    ...annotations.map(row),
  ].join('\n');

  const tested = pages(annotations)
    .map((url) => `* ${url}`)
    .join('\n');

  const sections = [heading, table, `*Pages tested*\n${tested}`];

  const shots = annotations.filter(
    (annotation) => annotation.screenshotId && session.assets[annotation.screenshotId],
  ).length;

  if (shots > 0) {
    sections.push(
      `_${shots} screenshot${shots === 1 ? '' : 's'} attached separately — download the session zip from Caliper._`,
    );
  }

  return sections.join('\n\n');
};
