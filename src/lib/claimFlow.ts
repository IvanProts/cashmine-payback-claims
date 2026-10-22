import { ApiError, Claim, ClaimBody } from './api';

/**
 * A claim attempt is persisted BEFORE the first POST (key + exact body) so that after a timeout,
 * crash or reload we can only ever replay the identical request with the identical Idempotency-Key.
 * The server then returns the original claim instead of creating a second one.
 *
 *  sending  -> POST in flight (or interrupted by a reload)
 *  unknown  -> bounded retries exhausted without a definitive answer; outcome unknown, replay is safe
 *  tracking -> server returned the claim (pending); GET /claims/{id} is authoritative for its status
 *  done     -> claim is completed/failed; kept until the user dismisses it
 */
export type AttemptPhase = 'sending' | 'unknown' | 'tracking' | 'done';

export interface ClaimAttempt {
  key: string;
  tokenTag: string;
  body: ClaimBody;
  createdAt: string;
  phase: AttemptPhase;
  claim?: Claim;
}

export interface FlowDeps {
  createClaim: (token: string, key: string, body: ClaimBody) => Promise<{ claim: Claim; replayed: boolean }>;
  getClaim: (token: string, id: string) => Promise<Claim>;
  sleep: (ms: number) => Promise<void>;
  save: (attempt: ClaimAttempt | null) => void;
}

export const MAX_UNKNOWN_RETRIES = 3; // replays after an unknown outcome: 1 initial + 3 = 4 POSTs, same key
export const MAX_RATE_LIMIT_WAITS = 5;
export const BACKOFF_MS = [1000, 2000, 4000];

export function newAttempt(body: ClaimBody, tag: string, key: string, now = new Date()): ClaimAttempt {
  return { key, tokenTag: tag, body, createdAt: now.toISOString(), phase: 'sending' };
}

export const isTerminal = (c: Claim) => c.status === 'completed' || c.status === 'failed';
export const isLocked = (a: ClaimAttempt | null) => !!a && a.phase !== 'done';

export interface SendResult {
  attempt: ClaimAttempt | null; // null when the server definitively rejected the request
  rejection?: ApiError;
}

/**
 * Send (or replay) the attempt's POST. Always the same key and body.
 * - 2xx: claim created or original returned -> tracking
 * - 400/401/404/409: definitive rejection, nothing was created -> attempt cleared
 * - 429: not processed; wait Retry-After (bounded) and resend
 * - network error / client timeout / 5xx / 504 / unparsable 2xx: outcome unknown -> bounded retries, then 'unknown'
 */
export async function sendAttempt(token: string, attempt: ClaimAttempt, deps: FlowDeps): Promise<SendResult> {
  let unknownRetries = 0;
  let rateLimitWaits = 0;
  for (;;) {
    try {
      const { claim } = await deps.createClaim(token, attempt.key, attempt.body);
      const next: ClaimAttempt = { ...attempt, phase: isTerminal(claim) ? 'done' : 'tracking', claim };
      deps.save(next);
      return { attempt: next };
    } catch (e) {
      if (e instanceof ApiError && e.status === 429) {
        if (rateLimitWaits++ >= MAX_RATE_LIMIT_WAITS) break;
        await deps.sleep(Math.min(Math.max(e.retryAfterMs ?? 2000, 500), 30000));
        continue;
      }
      const unknown = !(e instanceof ApiError) || e.outcomeUnknown;
      if (!unknown) {
        deps.save(null);
        return { attempt: null, rejection: e as ApiError };
      }
      if (unknownRetries >= MAX_UNKNOWN_RETRIES) break;
      await deps.sleep(BACKOFF_MS[unknownRetries++]);
    }
  }
  const unknownAttempt: ClaimAttempt = { ...attempt, phase: 'unknown' };
  deps.save(unknownAttempt);
  return { attempt: unknownAttempt };
}

export interface TrackOptions {
  shouldStop: () => boolean;
  onUpdate: (a: ClaimAttempt) => void;
  onPollError?: (e: Error | null) => void; // null clears a previous poll error
  intervalMs?: number;
}

/** Poll GET /claims/{id} (authoritative) until completed/failed. Transient errors never end tracking. */
export async function trackAttempt(token: string, attempt: ClaimAttempt, deps: FlowDeps, opts: TrackOptions) {
  if (!attempt.claim) return attempt;
  let current = attempt;
  const started = Date.now();
  while (!opts.shouldStop()) {
    const slow = Date.now() - started > 60000;
    await deps.sleep(opts.intervalMs ?? (slow ? 5000 : 2000));
    if (opts.shouldStop()) break;
    try {
      const claim = await deps.getClaim(token, current.claim!.id);
      current = { ...current, claim, phase: isTerminal(claim) ? 'done' : 'tracking' };
      deps.save(current);
      opts.onUpdate(current);
      opts.onPollError?.(null);
      if (current.phase === 'done') return current;
    } catch (e) {
      opts.onPollError?.(e as Error);
      if (e instanceof ApiError && e.status === 401) return current; // cannot continue without a valid token
      if (e instanceof ApiError && e.status === 429) await deps.sleep(Math.min(e.retryAfterMs ?? 2000, 30000));
    }
  }
  return current;
}

/** RFC 4122 v4 id for the Idempotency-Key; crypto.randomUUID needs a secure context, so keep a fallback. */
export function uuid(): string {
  const c = globalThis.crypto;
  if (typeof c.randomUUID === 'function') return c.randomUUID();
  const b = c.getRandomValues(new Uint8Array(16));
  b[6] = (b[6] & 0x0f) | 0x40;
  b[8] = (b[8] & 0x3f) | 0x80;
  const h = Array.from(b, (x) => x.toString(16).padStart(2, '0')).join('');
  return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
}
