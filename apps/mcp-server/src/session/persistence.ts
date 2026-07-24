import {mkdirSync, readFileSync, writeFileSync} from 'node:fs';
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
