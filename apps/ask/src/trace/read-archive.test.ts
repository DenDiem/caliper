import {mkdtempSync, writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {afterEach, beforeEach, describe, expect, it} from 'vitest';
import {strToU8, zipSync} from 'fflate';
import {readArchive} from './read-archive';

const session = {
  schemaVersion: 2,
  id: 'a3f0c1d2-0000-4000-8000-000000000001',
  createdAt: '2026-08-31T10:00:00.000Z',
  caliperVersion: '0.1.0',
  annotations: [],
  assets: {},
  traces: [
    {
      id: 'a3f0c1d2-0000-4000-8000-000000000001',
      label: 'Save fails on second submit',
      startedAt: '2026-08-31T10:00:00.000Z',
      durationMs: 24_400,
      truncated: false,
      page: {url: 'https://app.test/orders', title: 'Orders', viewport: {width: 1440, height: 900, dpr: 2}},
      sources: {network: 'cdp', console: 'cdp', state: 'devtools-bridge'},
      summary: {steps: 7, consoleErrors: 2, failedRequests: 1, stateActions: 12},
      files: {trace: 'caliper-a3f0c1d2.trace.json'},
    },
  ],
};

// readArchive writes trace files under the process cwd; each test gets its own so the repo stays clean.
let cwd: string;

beforeEach(() => {
  cwd = process.cwd();
  process.chdir(mkdtempSync(join(tmpdir(), 'caliper-cwd-')));
});

afterEach(() => {
  process.chdir(cwd);
});

describe('readArchive', () => {
  it('reads a session out of a zip and prints its TOON', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'caliper-'));
    const archive = zipSync({
      'caliper-a3f0c1d2/session.json': strToU8(JSON.stringify(session)),
      'caliper-a3f0c1d2/caliper-a3f0c1d2.trace.json': strToU8('{"traceId":"x"}'),
    });
    const zipPath = join(dir, 'caliper.zip');
    writeFileSync(zipPath, archive);

    const output = await readArchive(zipPath);

    expect(output).toContain('traces[1]:');
    expect(output).toContain('Save fails on second submit');
    expect(output).toContain('.caliper/a3f0c1d2/caliper-a3f0c1d2.trace.json');
  });

  it('reads an unpacked folder', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'caliper-'));
    writeFileSync(join(dir, 'session.json'), JSON.stringify(session));

    expect(await readArchive(dir)).toContain('traces[1]:');
  });

  it('explains itself when there is no session file', async () => {
    const dir = mkdtempSync(join(tmpdir(), 'caliper-'));
    await expect(readArchive(dir)).rejects.toThrow(/No Caliper session/);
  });
});
