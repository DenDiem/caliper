const IGNORED_TAGS: ReadonlySet<string> = new Set(['html', 'body']);

export const elementAt = (doc: Document, x: number, y: number): Element | null => {
  const found = doc.elementFromPoint(x, y);
  if (!found) return null;
  if (IGNORED_TAGS.has(found.tagName.toLowerCase())) return null;
  return found;
};
