import type {CaliperSession} from '@caliper/core';
import type {IssueHit} from './jira-client';
import {STORAGE} from './jira-config';
import {addSend, type SendRecord} from './jira-history';
import type {SendOptions} from './send-to-jira';

// Dev-only Jira fakes so the whole send flow (connected panel, issue picker, progress, sent) can be
// clicked through without real credentials or network. Every entry point is guarded by
// `import.meta.env.DEV`, so a production build (`wxt build`) inlines it to false and tree-shakes all
// of this away.

const FAKE_CONNECTION = {siteUrl: 'https://acme-qa.atlassian.net', displayName: 'QA Tester (dev)'};
const FAKE_CREDENTIALS = {
  siteUrl: 'https://acme-qa.atlassian.net',
  email: 'qa@acme.dev',
  apiToken: 'dev-token',
};

const FAKE_ISSUES: readonly IssueHit[] = [
  {key: 'OM-3044', summary: 'Menu page — spacing and token drift'},
  {key: 'OM-3051', summary: 'Order form: severity colours are off'},
  {key: 'OM-2988', summary: 'Delivery map gesture handling'},
  {key: 'OM-3120', summary: 'Side panel — export buttons misaligned'},
];

const delay = (ms: number): Promise<void> => new Promise((resolve) => setTimeout(resolve, ms));

export const seedDevJira = async (): Promise<void> => {
  if (!import.meta.env.DEV) return;
  const existing = await chrome.storage.local.get(STORAGE.connection);
  if (existing[STORAGE.connection]) return;
  await chrome.storage.local.set({
    [STORAGE.connection]: FAKE_CONNECTION,
    [STORAGE.credentials]: FAKE_CREDENTIALS,
  });
};

export const devSearchIssues = (query: string): IssueHit[] => {
  const needle = query.trim().toUpperCase();
  return FAKE_ISSUES.filter(
    (issue) => issue.key.includes(needle) || issue.summary.toUpperCase().includes(needle),
  ).slice(0, 6);
};

export const devSend = async (session: CaliperSession, options: SendOptions): Promise<SendRecord> => {
  const total = session.annotations.filter(
    (annotation) => annotation.screenshotId && session.assets[annotation.screenshotId] !== undefined,
  ).length;

  if (options.attachScreenshots) {
    for (let done = 0; done <= total; done += 1) {
      options.onProgress?.(done, total);
      await delay(220);
    }
  }
  await delay(400);

  const record: SendRecord = {
    sessionId: session.id,
    issueKey: options.issueKey,
    target: options.target,
    commentId: options.updateCommentId ?? 'dev-comment-1',
    at: new Date().toISOString(),
  };
  await addSend(record);
  await chrome.storage.local.set({[STORAGE.lastIssue]: options.issueKey});
  return record;
};
