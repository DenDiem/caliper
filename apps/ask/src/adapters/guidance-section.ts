import {existsSync, mkdirSync, readFileSync, rmSync} from 'node:fs';
import {dirname} from 'node:path';
import {writeFileAtomic} from './atomic-write';

// Every agent that is not Claude Code reads its standing instructions from a markdown file it shares
// with the rest of the project — AGENTS.md, a Cursor rule, copilot-instructions.md, GEMINI.md. Caliper
// owns a delimited section inside that file and never the file itself, so a project's own instructions
// survive an install, an update and an uninstall untouched.
const SECTION_START = '<!-- caliper:start -->';
const SECTION_END = '<!-- caliper:end -->';
const SECTION_PATTERN = /<!-- caliper:start -->[\s\S]*?<!-- caliper:end -->/u;

export const wrapSection = (body: string): string =>
  [SECTION_START, body.trim(), SECTION_END].join('\n');

const trimTrailingBlank = (value: string): string => value.replace(/\n{3,}$/u, '\n\n').trimEnd();

export const upsertSection = (existing: string, section: string): string => {
  if (SECTION_PATTERN.test(existing)) {
    return `${trimTrailingBlank(existing.replace(SECTION_PATTERN, section))}\n`;
  }
  const before = trimTrailingBlank(existing);
  return before.length > 0 ? `${before}\n\n${section}\n` : `${section}\n`;
};

export const removeSection = (existing: string): string => {
  if (!SECTION_PATTERN.test(existing)) return existing;
  const stripped = trimTrailingBlank(existing.replace(SECTION_PATTERN, ''));
  return stripped.length > 0 ? `${stripped}\n` : '';
};

// Refuses to leave the file empty: a blank AGENTS.md is worse than an absent one, because a read
// returns nothing with no signal that anything was meant to be there.
export const writeGuidance = (path: string, section: string, label: string): void => {
  mkdirSync(dirname(path), {recursive: true});
  const existing = existsSync(path) ? readFileSync(path, 'utf8') : '';
  const next = upsertSection(existing, section);

  if (next.trim().length === 0 || !next.includes(SECTION_START)) {
    console.log(`  ${label} -> skipped: refused to blank ${path}`);
    return;
  }
  writeFileAtomic(path, next);
  console.log(`  ${label} -> ${path}`);
};

// A file named after Caliper is Caliper's: it is written whole rather than as a section inside someone
// else's document. This is not cosmetic — a Cursor .mdc only has frontmatter if the frontmatter is the
// very first thing in the file, and wrapping it in section markers silently stops the rule applying.
export const writeOwnedGuidance = (path: string, content: string, label: string): void => {
  mkdirSync(dirname(path), {recursive: true});
  writeFileAtomic(path, content.endsWith('\n') ? content : `${content}\n`);
  console.log(`  ${label} -> ${path}`);
};

export const dropOwnedGuidance = (path: string, label: string): void => {
  if (!existsSync(path)) return;
  rmSync(path, {force: true});
  console.log(`  removed ${label} -> ${path}`);
};

export const dropGuidance = (path: string, label: string): void => {
  if (!existsSync(path)) return;

  const existing = readFileSync(path, 'utf8');
  const next = removeSection(existing);
  if (next === existing) return;

  // When Caliper's section was the whole file, the file was Caliper's — leaving a zero-byte one behind
  // is the same trap the write path refuses: a read returns nothing, with no signal why.
  if (next.trim().length === 0) {
    rmSync(path, {force: true});
    console.log(`  removed ${label} -> ${path}`);
    return;
  }

  writeFileAtomic(path, next);
  console.log(`  removed ${label} -> ${path}`);
};
