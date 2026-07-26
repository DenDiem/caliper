import type {CaliperSession} from '@caliper/core';
import {sessionToJiraComment} from '@caliper/core';
import {postComment, setDescription, uploadAttachment} from './jira-client';
import {STORAGE} from './jira-config';

export type JiraTarget = 'comment' | 'description';

export interface SendOptions {
  issueKey: string;
  target: JiraTarget;
  attachScreenshots: boolean;
  onProgress?: (done: number, total: number) => void;
}

const toBlob = async (dataUrl: string): Promise<Blob> => (await fetch(dataUrl)).blob();

const screenshots = (session: CaliperSession): {id: string; dataUrl: string}[] =>
  session.annotations.flatMap((annotation) => {
    const id = annotation.screenshotId;
    const dataUrl = id ? session.assets[id] : undefined;
    return id && dataUrl ? [{id, dataUrl}] : [];
  });

export const sendSessionToJira = async (session: CaliperSession, options: SendOptions): Promise<void> => {
  const {issueKey, target, attachScreenshots, onProgress} = options;

  if (attachScreenshots) {
    const pending = screenshots(session);
    let done = 0;
    onProgress?.(0, pending.length);
    for (const shot of pending) {
      await uploadAttachment(issueKey, `${shot.id}.png`, await toBlob(shot.dataUrl));
      onProgress?.(++done, pending.length);
    }
  }

  const body = sessionToJiraComment(session);
  if (target === 'description') await setDescription(issueKey, body);
  else await postComment(issueKey, body);

  await chrome.storage.local.set({[STORAGE.lastIssue]: issueKey});
};
