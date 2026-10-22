import { describe, expect, it } from 'vitest';
import { ApiError } from '../api';
import { GET_BACKOFF_MS, MAX_RETRY_AFTER_MS, retryDelayMs, withGetRetry } from '../retry';

function run(outcomes: Array<unknown>) {
  const queue = [...outcomes];
  const sleeps: number[] = [];
  let calls = 0;
  const p = withGetRetry(
    async () => {
      calls++;
      const next = queue.shift();
      if (next instanceof Error) throw next;
      return next;
    },
    async (ms) => void sleeps.push(ms),
  );
  return { p, sleeps, calls: () => calls };
}
const err = (status: number, retryAfterMs?: number) => new ApiError(status, 'X', 'm', undefined, retryAfterMs);

describe('GET retry', () => {
  it('returns immediately on success without sleeping', async () => {
    const r = run(['ok']);
    expect(await r.p).toBe('ok');
    expect(r.sleeps).toEqual([]);
    expect(r.calls()).toBe(1);
  });

  it('retries a 503 with short backoff and then succeeds (no error shown)', async () => {
    const r = run([err(503), 'ok']);
    expect(await r.p).toBe('ok');
    expect(r.sleeps).toEqual([GET_BACKOFF_MS[0]]);
    expect(r.calls()).toBe(2);
  });

  it('gives up after 3 attempts total and throws the last error so the UI can offer a manual retry', async () => {
    const r = run([err(503), err(503), err(503), 'never']);
    await expect(r.p).rejects.toMatchObject({ status: 503 });
    expect(r.calls()).toBe(3);
    expect(r.sleeps).toEqual(GET_BACKOFF_MS);
  });

  it.each([500, 502, 504, 0])('treats %i as transient', async (status) => {
    const r = run([err(status), 'ok']);
    expect(await r.p).toBe('ok');
    expect(r.calls()).toBe(2);
  });

  it.each([400, 401, 404, 409])('does not retry %i', async (status) => {
    const r = run([err(status), 'ok']);
    await expect(r.p).rejects.toMatchObject({ status });
    expect(r.calls()).toBe(1);
    expect(r.sleeps).toEqual([]);
  });

  it('429 waits exactly retryAfterMs (not the short backoff), then retries', async () => {
    const r = run([err(429, 2300), 'ok']);
    expect(await r.p).toBe('ok');
    expect(r.sleeps).toEqual([2300]);
  });

  it('429 without retryAfterMs falls back to the backoff', () => {
    expect(retryDelayMs(err(429), 0)).toBe(GET_BACKOFF_MS[0]);
  });

  it('429 asking for longer than the cap is surfaced instead of retried early', async () => {
    const r = run([err(429, MAX_RETRY_AFTER_MS + 1), 'ok']);
    await expect(r.p).rejects.toMatchObject({ status: 429 });
    expect(r.calls()).toBe(1);
  });

  it('does not retry non-API errors (e.g. malformed response handled by the caller)', async () => {
    const r = run([new Error('Unexpected claim options response'), 'ok']);
    await expect(r.p).rejects.toThrow('Unexpected');
    expect(r.calls()).toBe(1);
  });
});
