import { describe, expect, it } from 'vitest';
import { apiUnavailable, McpToolError, notFound, rateLimited, toToolErrorResult } from './errors.js';

describe('McpToolError', () => {
  it('carries the code and message', () => {
    const err = new McpToolError('bad_request', 'nope');
    expect(err.code).toBe('bad_request');
    expect(err.message).toBe('nope');
    expect(err).toBeInstanceOf(Error);
  });
});

describe('helper constructors', () => {
  it('apiUnavailable names the url and the fix', () => {
    const err = apiUnavailable('http://localhost:3001');
    expect(err.code).toBe('api_unavailable');
    expect(err.message).toBe(
      'DevDigest API is unreachable at http://localhost:3001. Run ./scripts/dev.sh, then retry.',
    );
  });

  it('notFound passes the message through verbatim', () => {
    const err = notFound("Repo 'x' not found. Add it in the web UI, then retry.");
    expect(err.code).toBe('not_found');
    expect(err.message).toBe("Repo 'x' not found. Add it in the web UI, then retry.");
  });

  it('rateLimited has a fixed message', () => {
    const err = rateLimited();
    expect(err.code).toBe('rate_limited');
    expect(err.message).toBe('Review runs are capped at 10/minute. Wait and retry.');
  });
});

describe('toToolErrorResult', () => {
  it('renders an McpToolError as `${code}: ${message}` with isError:true', () => {
    const result = toToolErrorResult(notFound("Agent 'x' not found."));
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: 'text', text: "not_found: Agent 'x' not found." }]);
  });

  it('never leaks a stack trace or the raw message of an unrecognized error', () => {
    const secret = new Error('super secret internal detail, connection string, etc.');
    const result = toToolErrorResult(secret);
    expect(result.isError).toBe(true);
    const text = (result.content as { type: string; text: string }[])[0]?.text ?? '';
    expect(text).toBe('internal: Internal error');
    expect(text).not.toContain('secret');
    expect(text).not.toContain(secret.stack ?? '\u0000impossible\u0000');
  });

  it('handles a thrown non-Error value the same way', () => {
    const result = toToolErrorResult('just a string, not even an Error');
    expect(result.isError).toBe(true);
    expect(result.content).toEqual([{ type: 'text', text: 'internal: Internal error' }]);
  });
});
