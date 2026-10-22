import { ApiError } from './api';

/**
 * Retry policy for idempotent reads (GET) only. Never used for POST /v1/claims, which has its own
 * same-key replay logic in claimFlow.ts.
 */
export const GET_BACKOFF_MS = [400, 1000]; // 2 retries -> at most 3 attempts
export const MAX_RETRY_AFTER_MS = 10_000; // never retry sooner than the server asks; if it asks for more, surface the error

/** Delay before retry number `attempt` (0-based) for this error, or null when it must not be retried. */
export function retryDelayMs(e: unknown, attempt: number): number | null {
  if (!(e instanceof ApiError) || attempt >= GET_BACKOFF_MS.length) return null;
  if (e.status === 429) {
    const wait = e.retryAfterMs ?? GET_BACKOFF_MS[attempt];
    return wait <= MAX_RETRY_AFTER_MS ? wait : null;
  }
  // Transient: no HTTP response (network error), 5xx (500/502/503/504). 4xx such as 400/401/404 are final.
  if (e.status === 0 || e.status >= 500) return GET_BACKOFF_MS[attempt];
  return null;
}

export async function withGetRetry<T>(
  fn: () => Promise<T>,
  sleep: (ms: number) => Promise<void> = (ms) => new Promise((r) => setTimeout(r, ms)),
): Promise<T> {
  for (let attempt = 0; ; attempt++) {
    try {
      return await fn();
    } catch (e) {
      const delay = retryDelayMs(e, attempt);
      if (delay === null) throw e;
      await sleep(delay);
    }
  }
}
