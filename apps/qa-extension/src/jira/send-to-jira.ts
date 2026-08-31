import type {CaliperSession, MediaRef} from '@caliper/core';
import {screenshotFilename, sessionToJiraComment} from '@caliper/core';
import {devSend} from './jira-dev';
import {postComment, resolveMediaId, setDescription, updateComment, uploadAttachment} from './jira-client';
import {STORAGE} from './jira-config';
import {addSend, type SendRecord} from './jira-history';
import {buildJiraManifest, traceFileEntries} from '../export/export-session';

export type JiraTarget = 'comment' | 'description';

export interface SendOptions {
  issueKey: string;
  target: JiraTarget;
  attachScreenshots: boolean;
  updateCommentId?: string | null;
  onProgress?: (done: number, total: number) => void;
}

const toBlob = async (dataUrl: string): Promise<Blob> => (await fetch(dataUrl)).blob();

const manifestFilename = (session: CaliperSession): string => `caliper-${session.id.slice(0, 8)}.session.json`;

// Attaches the machine-readable session so a downstream agent can reconstruct the review offline via
// `caliper pull` — the generic Jira MCP reads the human comment but cannot pull binary attachments.
const uploadManifest = async (session: CaliperSession, issueKey: string): Promise<void> => {
  const blob = new Blob([buildJiraManifest(session)], {type: 'application/json'});
  await uploadAttachment(issueKey, manifestFilename(session), blob);
};

const uploadScreenshots = async (
  session: CaliperSession,
  issueKey: string,
  onProgress?: (done: number, total: number) => void,
): Promise<Record<number, MediaRef>> => {
  const pending = session.annotations.flatMap((annotation, index) => {
    const id = annotation.screenshotId;
    const dataUrl = id ? session.assets[id] : undefined;
    return id && dataUrl ? [{index, annotation, dataUrl}] : [];
  });

  const media: Record<number, MediaRef> = {};
  let done = 0;
  onProgress?.(0, pending.length);

  for (const item of pending) {
    const attachmentId = await uploadAttachment(
      issueKey,
      screenshotFilename(item.index, item.annotation),
      await toBlob(item.dataUrl),
    );
    const mediaId = await resolveMediaId(attachmentId).catch(() => null);
    if (mediaId) media[item.index] = {id: mediaId};
    onProgress?.(++done, pending.length);
  }

  return media;
};

// Trace files ride alongside the manifest as ordinary attachments; the manifest names them, so
// `caliper pull` resolves each one back by filename the same way it already does for screenshots.
const uploadTraceFiles = async (session: CaliperSession, issueKey: string): Promise<void> => {
  for (const entry of await traceFileEntries(session)) {
    // Copied into a fresh view so its buffer is a plain ArrayBuffer — a Uint8Array over the generic
    // ArrayBufferLike (which fflate returns) is not a BlobPart.
    await uploadAttachment(issueKey, entry.filename, new Blob([new Uint8Array(entry.bytes)]));
  }
};

export const sendSessionToJira = async (
  session: CaliperSession,
  options: SendOptions,
): Promise<SendRecord> => {
  if (import.meta.env.DEV) return devSend(session, options);
  const {issueKey, target, attachScreenshots, updateCommentId, onProgress} = options;

  const media = attachScreenshots ? await uploadScreenshots(session, issueKey, onProgress) : {};
  await uploadTraceFiles(session, issueKey);
  await uploadManifest(session, issueKey);
  const body = sessionToJiraComment(session, media);

  let commentId: string | null = null;
  if (target === 'description') {
    await setDescription(issueKey, body);
  } else if (updateCommentId) {
    await updateComment(issueKey, updateCommentId, body);
    commentId = updateCommentId;
  } else {
    commentId = await postComment(issueKey, body);
  }

  const record: SendRecord = {
    sessionId: session.id,
    issueKey,
    target,
    commentId,
    at: new Date().toISOString(),
  };
  await addSend(record);
  await chrome.storage.local.set({[STORAGE.lastIssue]: issueKey});
  return record;
};
