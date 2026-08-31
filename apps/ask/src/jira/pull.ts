import {mkdirSync, writeFileSync} from 'node:fs';
import {basename, join} from 'node:path';
import {caliperSessionSchema, toToon} from '@caliper/core';
import type {CaliperSession} from '@caliper/core';

const TOKEN_URL = 'https://id.atlassian.com/manage-profile/security/api-tokens';
const MANIFEST_PATTERN = /^caliper-.*\.session\.json$/;
const ID_SHORT = 8;

interface JiraCreds {
  site: string;
  email: string;
  token: string;
}

interface Attachment {
  id: string;
  filename: string;
  content: string;
  created: string;
}

const normalizeSite = (input: string): string => {
  const host = input.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return `https://${host.includes('.') ? host : `${host}.atlassian.net`}`;
};

const readCreds = (): JiraCreds => {
  const site = process.env.CALIPER_JIRA_SITE;
  const email = process.env.CALIPER_JIRA_EMAIL;
  const token = process.env.CALIPER_JIRA_TOKEN;

  const missing: string[] = [];
  if (!site) missing.push('CALIPER_JIRA_SITE');
  if (!email) missing.push('CALIPER_JIRA_EMAIL');
  if (!token) missing.push('CALIPER_JIRA_TOKEN');
  if (!site || !email || !token) {
    throw new Error(
      `Jira credentials missing: set ${missing.join(', ')}. ` +
        'CALIPER_JIRA_SITE is your team (e.g. your-team or your-team.atlassian.net), ' +
        `CALIPER_JIRA_EMAIL your Atlassian login email, and CALIPER_JIRA_TOKEN an API token from ${TOKEN_URL}.`,
    );
  }
  return {site: normalizeSite(site), email, token};
};

const authHeader = (creds: JiraCreds): string =>
  `Basic ${Buffer.from(`${creds.email}:${creds.token}`).toString('base64')}`;

// A Jira URL, a bare key, or noisy text containing one — all resolve to the uppercase issue key.
const resolveKey = (input: string): string => {
  const key = input.match(/([A-Za-z][A-Za-z0-9]+-\d+)/)?.[1];
  return key ? key.toUpperCase() : input.trim().toUpperCase();
};

const isAttachment = (value: unknown): value is Attachment =>
  typeof value === 'object' &&
  value !== null &&
  'id' in value &&
  'filename' in value &&
  typeof value.filename === 'string' &&
  'content' in value &&
  typeof value.content === 'string' &&
  'created' in value &&
  typeof value.created === 'string';

const extractAttachments = (body: unknown): Attachment[] => {
  if (typeof body !== 'object' || body === null || !('fields' in body)) return [];
  const fields = body.fields;
  if (typeof fields !== 'object' || fields === null || !('attachment' in fields)) return [];
  const attachment = fields.attachment;
  return Array.isArray(attachment) ? attachment.filter(isAttachment) : [];
};

const newest = (attachments: readonly Attachment[]): Attachment | undefined =>
  attachments.reduce<Attachment | undefined>(
    (latest, item) => (!latest || item.created > latest.created ? item : latest),
    undefined,
  );

const listAttachments = async (creds: JiraCreds, key: string): Promise<Attachment[]> => {
  const response = await fetch(`${creds.site}/rest/api/3/issue/${key}?fields=attachment`, {
    headers: {Authorization: authHeader(creds), Accept: 'application/json'},
  });
  if (response.status === 401 || response.status === 403) {
    throw new Error(
      `Jira rejected the credentials (${response.status}) — check CALIPER_JIRA_EMAIL and CALIPER_JIRA_TOKEN.`,
    );
  }
  if (response.status === 404) {
    throw new Error(`Jira issue ${key} not found (404) — check the key/URL and CALIPER_JIRA_SITE.`);
  }
  if (!response.ok) throw new Error(`Jira attachment lookup failed: ${response.status}`);
  return extractAttachments(await response.json());
};

const fetchContent = async (creds: JiraCreds, url: string): Promise<Response> => {
  const response = await fetch(url, {headers: {Authorization: authHeader(creds)}});
  if (!response.ok) throw new Error(`attachment download failed: ${response.status}`);
  return response;
};

// Downloads the PNGs the manifest references, writes them under .caliper/<id8>/, and rewrites each
// annotation's screenshot to that local path so the emitted TOON points at a file the agent can open.
// Attachments accumulate across sends and never version, so a filename is resolved to its newest upload.
const materializeScreenshots = async (
  session: CaliperSession,
  attachments: readonly Attachment[],
  creds: JiraCreds,
): Promise<void> => {
  const short = session.id.slice(0, ID_SHORT);
  const dir = join(process.cwd(), '.caliper', short);
  let created = false;

  for (const annotation of session.annotations) {
    const filename = annotation.screenshot;
    if (!filename) continue;

    const match = newest(attachments.filter((item) => item.filename === filename));
    if (!match) {
      delete annotation.screenshot;
      continue;
    }

    const safe = basename(filename);
    const response = await fetchContent(creds, match.content);
    if (!created) {
      mkdirSync(dir, {recursive: true});
      created = true;
    }
    writeFileSync(join(dir, safe), Buffer.from(await response.arrayBuffer()));
    annotation.screenshot = `.caliper/${short}/${safe}`;
  }
};

// Every trace artifact the manifest names is fetched into .caliper/<id8>/ and the manifest rewritten to
// those local paths, so `caliper trace <path>` works straight from the summary the agent just read.
const materializeTraces = async (
  session: CaliperSession,
  attachments: readonly Attachment[],
  creds: JiraCreds,
): Promise<void> => {
  if (session.traces.length === 0) return;

  const short = session.id.slice(0, ID_SHORT);
  const dir = join(process.cwd(), '.caliper', short);
  mkdirSync(dir, {recursive: true});

  for (const trace of session.traces) {
    for (const key of ['trace', 'replay', 'video'] as const) {
      const filename = trace.files[key];
      if (!filename) continue;

      const match = newest(attachments.filter((item) => item.filename === filename));
      if (!match) {
        // The detail file is the trace; without it the entry still reports its summary, and dropping the
        // name would leave the agent no way to say what is missing.
        if (key !== 'trace') delete trace.files[key];
        continue;
      }

      // The name comes from a manifest on the ticket, so it is untrusted: without this a crafted
      // `../../` filename would be written anywhere under the working directory.
      const safe = basename(filename);
      const response = await fetchContent(creds, match.content);
      writeFileSync(join(dir, safe), Buffer.from(await response.arrayBuffer()));
      trace.files[key] = `.caliper/${short}/${safe}`;
    }
  }
};

const composition = (session: CaliperSession): string => {
  const marks = session.annotations.length;
  const traces = session.traces.length;
  return [
    `${marks} mark${marks === 1 ? '' : 's'}`,
    `${traces} trace${traces === 1 ? '' : 's'}`,
  ].join(', ');
};

export const pullSession = async (input: string): Promise<string> => {
  const creds = readCreds();
  const key = resolveKey(input);
  const attachments = await listAttachments(creds, key);

  const manifest = newest(attachments.filter((item) => MANIFEST_PATTERN.test(item.filename)));
  if (!manifest) {
    throw new Error(
      `No Caliper session found on ${key}: expected a caliper-*.session.json attachment ` +
        '(added when QA uses "Send to Jira" from the Caliper QA extension, for marks or bug traces). ' +
        'This ticket has none.',
    );
  }

  const raw = await (await fetchContent(creds, manifest.content)).text();
  const session = caliperSessionSchema.parse(JSON.parse(raw));
  await materializeScreenshots(session, attachments, creds);
  await materializeTraces(session, attachments, creds);

  return [`${key}: ${composition(session)}`, '', toToon(session)].join('\n');
};
