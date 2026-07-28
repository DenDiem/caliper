import type {JiraTarget} from './send-to-jira';
import {STORAGE} from './jira-config';

export interface SendRecord {
  sessionId: string;
  issueKey: string;
  target: JiraTarget;
  commentId: string | null;
  at: string;
}

const isSendRecord = (value: unknown): value is SendRecord =>
  typeof value === 'object' &&
  value !== null &&
  'sessionId' in value &&
  typeof value.sessionId === 'string' &&
  'issueKey' in value &&
  typeof value.issueKey === 'string';

const readAll = async (): Promise<SendRecord[]> => {
  const value = (await chrome.storage.local.get(STORAGE.sends))[STORAGE.sends];
  return Array.isArray(value) ? value.filter(isSendRecord) : [];
};

export const getSends = async (sessionId: string): Promise<SendRecord[]> =>
  (await readAll()).filter((record) => record.sessionId === sessionId);

export const addSend = async (record: SendRecord): Promise<void> => {
  const all = await readAll();
  await chrome.storage.local.set({[STORAGE.sends]: [...all, record]});
};

export const findCommentSend = async (
  sessionId: string,
  issueKey: string,
): Promise<SendRecord | undefined> => {
  const matching = (await getSends(sessionId)).filter(
    (record) => record.issueKey === issueKey && record.target === 'comment' && record.commentId !== null,
  );
  return matching.at(-1);
};
