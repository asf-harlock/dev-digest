/**
 * The MCP-facing error taxonomy. Every tool handler funnels its failures
 * through `toToolErrorResult` so a client never sees a stack trace or an
 * internal message — only a stable code + a short, actionable sentence.
 */
import type { CallToolResult } from '@modelcontextprotocol/sdk/types.js';

export type McpErrorCode =
  | 'api_unavailable'
  | 'not_found'
  | 'rate_limited'
  | 'timeout'
  | 'bad_request'
  | 'not_implemented'
  | 'internal';

export class McpToolError extends Error {
  readonly code: McpErrorCode;

  constructor(code: McpErrorCode, message: string) {
    super(message);
    this.name = 'McpToolError';
    this.code = code;
  }
}

export function apiUnavailable(url: string): McpToolError {
  return new McpToolError(
    'api_unavailable',
    `DevDigest API is unreachable at ${url}. Run ./scripts/dev.sh, then retry.`,
  );
}

export function notFound(message: string): McpToolError {
  return new McpToolError('not_found', message);
}

export function rateLimited(): McpToolError {
  return new McpToolError('rate_limited', 'Review runs are capped at 10/minute. Wait and retry.');
}

/**
 * Converts any thrown value into a `CallToolResult` with `isError: true`.
 * Never leaks a stack trace or an unrecognized error's raw message — only
 * `McpToolError`s carry a message safe to show a client.
 */
export function toToolErrorResult(err: unknown): CallToolResult {
  const { code, message } = toCodeAndMessage(err);
  return {
    isError: true,
    content: [{ type: 'text', text: `${code}: ${message}` }],
  };
}

function toCodeAndMessage(err: unknown): { code: McpErrorCode; message: string } {
  if (err instanceof McpToolError) {
    return { code: err.code, message: err.message };
  }
  return { code: 'internal', message: 'Internal error' };
}
