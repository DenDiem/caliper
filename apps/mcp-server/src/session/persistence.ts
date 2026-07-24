import {mkdirSync, readdirSync, readFileSync, statSync, unlinkSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import type {ReviewSessionState} from '@caliper/core';

const dir = () => {
  const path = join(tmpdir(), 'caliper-review');
  mkdirSync(path, {recursive: true});
  return path;
};

export const persist = (session: ReviewSessionState): void => {
  writeFileSync(join(dir(), `${session.id}.json`), JSON.stringify(session), 'utf8');
};

export const load = (id: string): ReviewSessionState | null => {
  try {
    return JSON.parse(readFileSync(join(dir(), `${id}.json`), 'utf8'));
  } catch {
    return null;
  }
};

export const pruneStaleSessions = (maxAgeMs: number): void => {
  let entries: string[];
  try {
    entries = readdirSync(dir());
  } catch {
    return;
  }

  const cutoff = Date.now() - maxAgeMs;
  for (const entry of entries) {
    if (!entry.endsWith('.json')) continue;
    const path = join(dir(), entry);
    try {
      if (statSync(path).mtimeMs < cutoff) unlinkSync(path);
    } catch {
      continue;
    }
  }
};
