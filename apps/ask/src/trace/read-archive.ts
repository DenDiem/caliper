import {mkdirSync, readFileSync, readdirSync, statSync, writeFileSync} from 'node:fs';
import {join} from 'node:path';
import {caliperSessionSchema, toToon} from '@caliper/core';
import type {CaliperSession} from '@caliper/core';
import {unzipSync} from 'fflate';

const SESSION_FILE = /(^|\/)(caliper-.*\.)?session\.json$/;
const SKIP = new Set(['session.json', 'session.toon']);
const ID_SHORT = 8;

const decode = (bytes: Uint8Array): string => new TextDecoder().decode(bytes);

const basename = (name: string): string => name.split('/').pop() ?? name;

interface Archive {
  files: Record<string, Uint8Array>;
  sessionKey: string;
}

const missing = (path: string, where: string): Error =>
  new Error(
    `No Caliper session in ${path}: expected a session.json ${where}. ` +
      'Ask QA to re-export with Download from the Caliper QA panel, or point caliper read at the ' +
      'zip itself.',
  );

const fromZip = (path: string): Archive => {
  const files = unzipSync(new Uint8Array(readFileSync(path)));
  const sessionKey = Object.keys(files).find((name) => SESSION_FILE.test(name));
  if (!sessionKey) throw missing(path, 'inside the archive');
  return {files, sessionKey};
};

const fromDirectory = (path: string): Archive => {
  const files: Record<string, Uint8Array> = {};
  for (const name of readdirSync(path)) {
    const full = join(path, name);
    if (statSync(full).isFile()) files[name] = new Uint8Array(readFileSync(full));
  }
  const sessionKey = Object.keys(files).find((name) => SESSION_FILE.test(name));
  if (!sessionKey) throw missing(path, 'in that folder');
  return {files, sessionKey};
};

// Trace artifacts are written out beside the screenshots so `caliper trace` has a real path to open —
// the same place `caliper pull` leaves them, so both entry points read identically from here on.
const materializeTraces = (session: CaliperSession, files: Record<string, Uint8Array>): void => {
  if (session.traces.length === 0) return;

  const short = session.id.slice(0, ID_SHORT);
  const outDir = join(process.cwd(), '.caliper', short);
  mkdirSync(outDir, {recursive: true});

  for (const [name, bytes] of Object.entries(files)) {
    const base = basename(name);
    if (SKIP.has(base)) continue;
    writeFileSync(join(outDir, base), bytes);
  }

  for (const trace of session.traces) {
    trace.files.trace = `.caliper/${short}/${trace.files.trace}`;
    if (trace.files.replay) trace.files.replay = `.caliper/${short}/${trace.files.replay}`;
    if (trace.files.video) trace.files.video = `.caliper/${short}/${trace.files.video}`;
  }
};

// The offline half of the two delivery paths: QA hands the archive over directly, and the agent reads
// it through the same TOON entry point `caliper pull` produces from a ticket.
export const readArchive = async (path: string): Promise<string> => {
  const archive = statSync(path).isDirectory() ? fromDirectory(path) : fromZip(path);
  const manifest = archive.files[archive.sessionKey];
  if (!manifest) throw missing(path, 'that could be read back');

  const raw: unknown = JSON.parse(decode(manifest));
  const session = caliperSessionSchema.parse(raw);

  materializeTraces(session, archive.files);

  return toToon(session);
};
