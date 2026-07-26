import type {CaliperSession, MediaRef} from '@caliper/core';
import {screenshotFilename, sessionToJiraComment} from '@caliper/core';
import {postComment, resolveMediaId, setDescription, updateComment, uploadAttachment} from './jira-client';
import {STORAGE} from './jira-config';
import {addSend, type SendRecord} from './jira-history';

export type JiraTarget = 'comment' | 'description';

export interface SendOptions {
  issueKey: string;
  target: JiraTarget;
  attachScreenshots: boolean;
  updateCommentId?: string | null;
  onProgress?: (done: number, total: number) => void;
}

const toBlob = async (dataUrl: string): Promise<Blob> => (await fetch(dataUrl)).blob();

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

export const sendSessionToJira = async (
  session: CaliperSession,
  options: SendOptions,
): Promise<SendRecord> => {
  const {issueKey, target, attachScreenshots, updateCommentId, onProgress} = options;

  const media = attachScreenshots ? await uploadScreenshots(session, issueKey, onProgress) : {};
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
