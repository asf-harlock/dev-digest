import type { CiErrorCode } from '@devdigest/shared';
import { AppError, ExternalServiceError } from '../../platform/errors.js';
import { CI_ERROR, CI_ERROR_MESSAGE, CI_ERROR_STATUS, HTTP_NOT_FOUND } from './constants.js';
import { truncateGithubError } from './helpers.js';

/** An `AppError` for one of the CI error codes (status and text come from `constants.ts`). */
export function ciError(code: CiErrorCode, details?: unknown): AppError {
  return new AppError(code, CI_ERROR_MESSAGE[code], CI_ERROR_STATUS[code], details);
}

/**
 * Normalise a failure of a GitHub call: classified `AppError`s from the adapter
 * pass through; anything else becomes a 502 whose text is scrubbed of tokens and
 * truncated, so no credential reaches a response (NFR-12).
 */
export function githubFailure(err: unknown, secrets: readonly string[]): AppError {
  if (err instanceof AppError) return err;
  const message = err instanceof Error ? err.message : String(err);
  return new ExternalServiceError(truncateGithubError(message, secrets));
}

/** `details.reset_at` of a `rate_limited` error, when the adapter knew it. */
export function resetAtOf(err: AppError): string | undefined {
  const details = err.details;
  if (typeof details === 'object' && details !== null) {
    const value = (details as { reset_at?: unknown }).reset_at;
    if (typeof value === 'string') return value;
  }
  return undefined;
}

/** True for a `github_permission` the adapter raised for an HTTP 404 (`details.status`). */
export function isGithubNotFound(err: AppError): boolean {
  const details = err.details;
  return (
    typeof details === 'object' &&
    details !== null &&
    (details as { status?: unknown }).status === HTTP_NOT_FOUND
  );
}

/** Fixed-text failure for an unexpected error while ingesting; no upstream text, no token. */
export function ingestFailed(): AppError {
  return ciError(CI_ERROR.ingestFailed);
}
