import type {CaliperSession, MediaRef} from '@caliper/core';
import {screenshotFilename, sessionToJiraComment} from '@caliper/core';
import {devSend} from './jira-dev';
import {
  listAttachmentNames,
  postComment,
  resolveMediaId,
  setDescription,
  updateComment,
  uploadAttachment,
} from './jira-client';
import {STORAGE} from './jira-config';
import {addSend, type SendRecord, type SendWarning} from './jira-history';
import {buildJiraManifest, traceFileEntries} from '../export/export-session';

// Jira decides whether an attachment gets a player or a download link from its content type, so an
// upload with no type at all is a video nobody can watch in the ticket.
const CONTENT_TYPES: Record<string, string> = {
  mp4: 'video/mp4',
  webm: 'video/webm',
  json: 'application/json',
  gz: 'application/gzip',
};

const contentType = (filename: string): string =>
  CONTENT_TYPES[filename.split('.').pop() ?? ''] ?? 'application/octet-stream';

export type JiraTarget = 'comment' | 'description';

export interface SendOptions {
  issueKey: string;
  target: JiraTarget;
  attachScreenshots: boolean;
  updateCommentId?: string | null;
  onProgress?: (done: number, total: number) => void;
}

// Jira Cloud rejects an attachment over its per-file limit (10 MB by default) with a 413. A trace video
// can reach that when the length limit is raised, and finding out mid-send used to abort the whole
// upload after some files had already landed — leaving orphans, no manifest and no comment.
const ATTACHMENT_LIMIT_BYTES = 10 * 1024 * 1024;



const toBlob = async (dataUrl: string): Promise<Blob> => (await fetch(dataUrl)).blob();

const manifestFilename = (session: CaliperSession): string => `caliper-${session.id.slice(0, 8)}.session.json`;

// Attaches the machine-readable session so a downstream agent can reconstruct the review offline via
// `caliper pull` — the generic Jira MCP reads the human comment but cannot pull binary attachments.
const uploadManifest = async (
  session: CaliperSession,
  issueKey: string,
  delivered: ReadonlySet<string>,
): Promise<void> => {
  const blob = new Blob([buildJiraManifest(session, delivered)], {type: 'application/json'});
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
// A trace file that is too large, or that Jira refuses, costs that file and nothing else: the trace
// itself, the marks and the comment still reach the ticket, and the manifest is built from what landed.
const uploadTraceFiles = async (
  session: CaliperSession,
  issueKey: string,
  warnings: SendWarning[],
): Promise<{delivered: Set<string>; videos: Record<number, MediaRef>}> => {
  const delivered = new Set<string>();
  const videos: Record<number, MediaRef> = {};

  // Only the video is worth a media id: it is the one trace file a person watches, and an id is what
  // lets the comment play it inline instead of offering a download.
  const videoTrace = new Map<string, number>();
  session.traces.forEach((trace, index) => {
    if (trace.files.video) videoTrace.set(trace.files.video, index);
  });

  for (const entry of await traceFileEntries(session)) {
    if (entry.bytes.byteLength > ATTACHMENT_LIMIT_BYTES) {
      warnings.push({filename: entry.filename, reason: 'too-large'});
      continue;
    }
    try {
      // Copied into a fresh view so its buffer is a plain ArrayBuffer — a Uint8Array over the generic
      // ArrayBufferLike (which fflate returns) is not a BlobPart.
      const attachmentId = await uploadAttachment(
        issueKey,
        entry.filename,
        new Blob([new Uint8Array(entry.bytes)], {type: contentType(entry.filename)}),
      );
      delivered.add(entry.filename);

      const index = videoTrace.get(entry.filename);
      if (index !== undefined) {
        const mediaId = await resolveMediaId(attachmentId).catch(() => null);
        if (mediaId) videos[index] = {id: mediaId};
      }
    } catch {
      warnings.push({filename: entry.filename, reason: 'upload-failed'});
    }
  }

  return {delivered, videos};
};

// An upload that resolved without throwing is not proof the file is on the issue, and a trace whose
// video quietly never arrived reads exactly like a trace that never had one. So the issue is asked
// what it actually holds, and anything missing is named in the comment instead of being lost.
// A failure to perform the check is not itself a reason to fail the send.
const confirmDelivered = async (
  issueKey: string,
  delivered: Set<string>,
  warnings: SendWarning[],
): Promise<void> => {
  if (delivered.size === 0) return;

  const onIssue = await listAttachmentNames(issueKey).catch(() => null);
  if (!onIssue) return;

  for (const filename of delivered) {
    if (!onIssue.has(filename)) {
      warnings.push({filename, reason: 'not-on-issue'});
      delivered.delete(filename);
    }
  }
};

export const sendSessionToJira = async (
  session: CaliperSession,
  options: SendOptions,
): Promise<SendRecord> => {
  if (import.meta.env.DEV) return devSend(session, options);
  const {issueKey, target, attachScreenshots, updateCommentId, onProgress} = options;

  const media = attachScreenshots ? await uploadScreenshots(session, issueKey, onProgress) : {};
  const warnings: SendWarning[] = [];
  const {delivered, videos} = await uploadTraceFiles(session, issueKey, warnings);
  // Before the manifest, so `caliper pull` is told about the files that are really there.
  await confirmDelivered(issueKey, delivered, warnings);
  await uploadManifest(session, issueKey, delivered);

  // A media id resolved at upload time is worthless if the file is not on the issue: embedding it
  // would put a broken player in the comment instead of the filename that says what is missing.
  session.traces.forEach((trace, index) => {
    const filename = trace.files.video;
    if (filename !== undefined && !delivered.has(filename)) delete videos[index];
  });
  const body = sessionToJiraComment(
    session,
    media,
    warnings.map((warning) => warning.filename),
    videos,
  );

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
    ...(warnings.length > 0 ? {warnings} : {}),
  };
  await addSend(record);
  await chrome.storage.local.set({[STORAGE.lastIssue]: issueKey});
  return record;
};
