import type {AdfDoc} from '@caliper/core';
import {apiBase, authHeader} from './jira-auth';
import {devSearchIssues} from './jira-dev';

export interface IssueHit {
  key: string;
  summary: string;
}

interface PickerResponse {
  sections?: {issues?: {key: string; summaryText: string}[]}[];
}

export const resolveIssueKey = (input: string): string => {
  const match = input.match(/([A-Za-z][A-Za-z0-9]+-\d+)/);
  return match ? match[1].toUpperCase() : input.trim().toUpperCase();
};

export const searchIssues = async (query: string): Promise<IssueHit[]> => {
  if (import.meta.env.DEV) return devSearchIssues(query);
  const url = `${await apiBase()}/issue/picker?query=${encodeURIComponent(query)}`;
  const response = await fetch(url, {headers: {Authorization: await authHeader(), Accept: 'application/json'}});
  if (!response.ok) throw new Error(`issue picker failed: ${response.status}`);

  const data: PickerResponse = await response.json();
  return (data.sections ?? [])
    .flatMap((section) => section.issues ?? [])
    .map((issue) => ({key: issue.key, summary: issue.summaryText}));
};

export const uploadAttachment = async (issueKey: string, filename: string, blob: Blob): Promise<string> => {
  const form = new FormData();
  form.append('file', blob, filename);

  const response = await fetch(`${await apiBase()}/issue/${issueKey}/attachments`, {
    method: 'POST',
    headers: {Authorization: await authHeader(), 'X-Atlassian-Token': 'no-check'},
    body: form,
  });
  if (!response.ok) throw new Error(`attachment upload failed: ${response.status}`);

  const attached: {id: string}[] = await response.json();
  const id = attached[0]?.id;
  if (!id) throw new Error('attachment upload returned no id');
  return id;
};

// Read back what the issue actually holds. Every upload here is a fetch whose failure modes are not
// all exceptions -- an attachment can be accepted and still not end up on the issue -- and a file that
// silently never arrived is the worst outcome for a bug report, because the reader has no way to know
// something is missing.
export const listAttachmentNames = async (issueKey: string): Promise<Set<string>> => {
  const response = await fetch(`${await apiBase()}/issue/${issueKey}?fields=attachment`, {
    headers: {Authorization: await authHeader(), Accept: 'application/json'},
  });
  if (!response.ok) throw new Error(`could not read attachments: ${response.status}`);

  const issue: {fields?: {attachment?: {filename?: string}[]}} = await response.json();
  const names = (issue.fields?.attachment ?? []).flatMap((item) =>
    item.filename === undefined ? [] : [item.filename],
  );
  return new Set(names);
};

export const resolveMediaId = async (attachmentId: string): Promise<string | null> => {
  const response = await fetch(`${await apiBase()}/attachment/content/${attachmentId}`, {
    headers: {Authorization: await authHeader(), Range: 'bytes=0-0'},
  });
  const match = response.url.match(/\/file\/([^/?]+)\/binary/);
  return match ? match[1] : null;
};

export const postComment = async (issueKey: string, body: AdfDoc): Promise<string> => {
  const response = await fetch(`${await apiBase()}/issue/${issueKey}/comment`, {
    method: 'POST',
    headers: {Authorization: await authHeader(), 'Content-Type': 'application/json', Accept: 'application/json'},
    body: JSON.stringify({body}),
  });
  if (!response.ok) throw new Error(`comment failed: ${response.status}`);

  const created: {id: string} = await response.json();
  return created.id;
};

export const updateComment = async (issueKey: string, commentId: string, body: AdfDoc): Promise<void> => {
  const response = await fetch(`${await apiBase()}/issue/${issueKey}/comment/${commentId}`, {
    method: 'PUT',
    headers: {Authorization: await authHeader(), 'Content-Type': 'application/json', Accept: 'application/json'},
    body: JSON.stringify({body}),
  });
  if (!response.ok) throw new Error(`comment update failed: ${response.status}`);
};

export const setDescription = async (issueKey: string, body: AdfDoc): Promise<void> => {
  const response = await fetch(`${await apiBase()}/issue/${issueKey}`, {
    method: 'PUT',
    headers: {Authorization: await authHeader(), 'Content-Type': 'application/json', Accept: 'application/json'},
    body: JSON.stringify({fields: {description: body}}),
  });
  if (!response.ok) throw new Error(`set description failed: ${response.status}`);
};
