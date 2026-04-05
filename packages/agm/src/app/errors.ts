/**
 * AGM error taxonomy: RetryableError vs FailFastError.
 *
 * - RetryableError: transient failures that may succeed on retry
 *   (network timeout, connection refused, HTTP 5xx)
 * - FailFastError: permanent failures that will never succeed with same inputs
 *   (auth failure with invalid credentials, HTTP 4xx, not found)
 *
 * Thrown by low-level operations; caught and classified by call sites.
 */

export class RetryableError extends Error {
  readonly retryable = true as const;
  constructor(message: string) {
    super(message);
    this.name = 'RetryableError';
  }
}

export class FailFastError extends Error {
  readonly retryable = false as const;
  constructor(message: string) {
    super(message);
    this.name = 'FailFastError';
  }
}

export function isRetryable(e: unknown): e is RetryableError {
  return e instanceof RetryableError;
}

export function isFailFast(e: unknown): e is FailFastError {
  return e instanceof FailFastError;
}
