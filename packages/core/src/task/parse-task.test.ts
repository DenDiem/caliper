import {describe, expect, it} from 'vitest';
import {parseTask} from './parse-task';

describe('parseTask', () => {
  it('reads the key from a browse url', () => {
    expect(parseTask('https://acme.atlassian.net/browse/OM-4110')).toEqual({
      key: 'OM-4110',
      url: 'https://acme.atlassian.net/browse/OM-4110',
    });
  });

  it('reads the key from a board url carrying selectedIssue', () => {
    const url = 'https://acme.atlassian.net/jira/software/projects/OM/boards/12?selectedIssue=OM-77';
    expect(parseTask(url)?.key).toBe('OM-77');
  });

  it('keeps a self-hosted host', () => {
    expect(parseTask('https://jira.company.com/browse/ABC-1')).toEqual({
      key: 'ABC-1',
      url: 'https://jira.company.com/browse/ABC-1',
    });
  });

  it('trims surrounding whitespace', () => {
    expect(parseTask('  https://acme.atlassian.net/browse/OM-4110  ')?.key).toBe('OM-4110');
  });

  it('accepts a bare issue key without a url', () => {
    expect(parseTask('OM-4110')).toEqual({key: 'OM-4110', url: null});
  });

  it('uppercases a bare key typed in lower case', () => {
    expect(parseTask('om-4110')?.key).toBe('OM-4110');
  });

  it('returns null for something that is neither', () => {
    expect(parseTask('https://example.com/some/page')).toBeNull();
    expect(parseTask('just words')).toBeNull();
    expect(parseTask('')).toBeNull();
  });
});
