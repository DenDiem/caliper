import {STORAGE} from './jira-config';

export interface JiraCredentials {
  siteUrl: string;
  email: string;
  apiToken: string;
}

export interface JiraConnection {
  siteUrl: string;
  displayName: string;
}

export class JiraNotConnectedError extends Error {}

interface Myself {
  accountId: string;
  displayName: string;
}

const normalizeSite = (input: string): string => {
  const host = input.trim().replace(/^https?:\/\//, '').replace(/\/.*$/, '');
  return `https://${host.includes('.') ? host : `${host}.atlassian.net`}`;
};

const basic = (email: string, apiToken: string): string => `Basic ${btoa(`${email}:${apiToken}`)}`;

const isJiraCredentials = (value: unknown): value is JiraCredentials =>
  typeof value === 'object' &&
  value !== null &&
  'siteUrl' in value &&
  typeof value.siteUrl === 'string' &&
  'email' in value &&
  typeof value.email === 'string' &&
  'apiToken' in value &&
  typeof value.apiToken === 'string';

const isJiraConnection = (value: unknown): value is JiraConnection =>
  typeof value === 'object' &&
  value !== null &&
  'siteUrl' in value &&
  typeof value.siteUrl === 'string' &&
  'displayName' in value &&
  typeof value.displayName === 'string';

export const getCredentials = async (): Promise<JiraCredentials | null> => {
  const value = (await chrome.storage.local.get(STORAGE.credentials))[STORAGE.credentials];
  return isJiraCredentials(value) ? value : null;
};

export const getConnection = async (): Promise<JiraConnection | null> => {
  const value = (await chrome.storage.local.get(STORAGE.connection))[STORAGE.connection];
  return isJiraConnection(value) ? value : null;
};

export const clearCredentials = (): Promise<void> =>
  chrome.storage.local.remove([STORAGE.credentials, STORAGE.connection, STORAGE.lastIssue]);

export const authHeader = async (): Promise<string> => {
  const credentials = await getCredentials();
  if (!credentials) throw new JiraNotConnectedError('Jira is not connected');
  return basic(credentials.email, credentials.apiToken);
};

export const apiBase = async (): Promise<string> => {
  const credentials = await getCredentials();
  if (!credentials) throw new JiraNotConnectedError('Jira is not connected');
  return `${credentials.siteUrl}/rest/api/3`;
};

export const issueUrl = async (issueKey: string): Promise<string | null> => {
  const connection = await getConnection();
  return connection ? `${connection.siteUrl}/browse/${issueKey}` : null;
};

export const saveCredentials = async (input: JiraCredentials): Promise<JiraConnection> => {
  const credentials: JiraCredentials = {...input, siteUrl: normalizeSite(input.siteUrl)};

  const response = await fetch(`${credentials.siteUrl}/rest/api/3/myself`, {
    headers: {Authorization: basic(credentials.email, credentials.apiToken), Accept: 'application/json'},
  });
  if (!response.ok) {
    throw new Error(`Could not verify credentials (${response.status}) — check site, email and token`);
  }

  const me: Myself = await response.json();
  const connection: JiraConnection = {siteUrl: credentials.siteUrl, displayName: me.displayName};
  await chrome.storage.local.set({[STORAGE.credentials]: credentials, [STORAGE.connection]: connection});
  return connection;
};
