export interface ParsedTask {
  key: string;
  url: string | null;
}

const ISSUE_KEY = /[A-Z][A-Z0-9]+-\d+/i;
const BARE_KEY = /^[A-Z][A-Z0-9]+-\d+$/i;
const BROWSE_PATH = /\/browse\/([A-Z][A-Z0-9]+-\d+)/i;

const fromUrl = (input: string): ParsedTask | null => {
  let parsed: URL;
  try {
    parsed = new URL(input);
  } catch {
    return null;
  }

  const fromPath = BROWSE_PATH.exec(parsed.pathname)?.[1];
  if (fromPath) return {key: fromPath.toUpperCase(), url: input};

  const selected = parsed.searchParams.get('selectedIssue');
  if (selected && BARE_KEY.test(selected)) return {key: selected.toUpperCase(), url: input};

  const fromRest = ISSUE_KEY.exec(parsed.pathname)?.[0];
  return fromRest ? {key: fromRest.toUpperCase(), url: input} : null;
};

export const parseTask = (input: string): ParsedTask | null => {
  const trimmed = input.trim();
  if (!trimmed) return null;

  if (BARE_KEY.test(trimmed)) return {key: trimmed.toUpperCase(), url: null};

  return fromUrl(trimmed);
};
