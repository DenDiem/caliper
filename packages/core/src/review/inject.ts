const MARKER = 'data-caliper';

export const injectScriptTag = (html: string, scriptSrc: string): string => {
  if (html.includes(MARKER)) return html;

  const tag = `<script ${MARKER} src="${scriptSrc}"></script>`;
  const headClose = /<\/head>/i;
  const bodyClose = /<\/body>/i;

  if (headClose.test(html)) return html.replace(headClose, `${tag}</head>`);
  if (bodyClose.test(html)) return html.replace(bodyClose, `${tag}</body>`);
  return html + tag;
};
