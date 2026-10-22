import { describe, expect, it, vi } from 'vitest';
import { ApiError, Claim, ClaimBody } from '../api';
import { ClaimAttempt, FlowDeps, MAX_UNKNOWN_RETRIES, newAttempt, sendAttempt, trackAttempt } from '../claimFlow';

const body: ClaimBody = { asset: 'ETH', amount: '0.5', destinationId: 'dest_wallet' };
const claim = (status: Claim['status'] = 'pending'): Claim => ({
  id: 'clm_1', asset: 'ETH', amount: '0.5', fee: '0.0012', receiveAmount: '0.4988',
  destinationId: 'dest_wallet', status, failureReason: status === 'failed' ? 'boom' : null, createdAt: 'a', updatedAt: 'b',
});

function setup(outcomes: Array<Claim | Error>) {
  const calls: Array<{ key: string; body: ClaimBody }> = [];
  const sleeps: number[] = [];
  const saved: Array<ClaimAttempt | null> = [];
  const queue = [...outcomes];
  const deps: FlowDeps = {
    createClaim: async (_t, key, b) => {
      calls.push({ key, body: b });
      const next = queue.shift();
      if (!next) throw new Error('no more outcomes');
      if (next instanceof Error) throw next;
      return { claim: next, replayed: calls.length > 1 };
    },
    getClaim: vi.fn(),
    sleep: async (ms) => void sleeps.push(ms),
    save: (a) => void saved.push(a),
  };
  return { deps, calls, sleeps, saved };
}
const attempt = () => newAttempt(body, 'tag', 'key-123');

describe('sendAttempt', () => {
  it('moves to tracking on success and persists the claim', async () => {
    const { deps, calls, saved } = setup([claim()]);
    const r = await sendAttempt('t', attempt(), deps);
    expect(r.attempt?.phase).toBe('tracking');
    expect(calls).toHaveLength(1);
    expect(saved.at(-1)?.claim?.id).toBe('clm_1');
  });

  it('replays the SAME key and body after a 504, never a new key', async () => {
    const { deps, calls } = setup([new ApiError(504, 'TIMEOUT', 't'), new ApiError(0, 'NETWORK', 'n'), claim()]);
    const r = await sendAttempt('t', attempt(), deps);
    expect(r.attempt?.phase).toBe('tracking');
    expect(calls).toHaveLength(3);
    expect(new Set(calls.map((c) => c.key))).toEqual(new Set(['key-123']));
    expect(calls.every((c) => c.body === body)).toBe(true);
  });

  it('bounds retries and ends as "unknown" (still same key), without claiming success or failure', async () => {
    const { deps, calls, sleeps, saved } = setup(Array.from({ length: 10 }, () => new ApiError(503, 'SERVER', 's')));
    const r = await sendAttempt('t', attempt(), deps);
    expect(r.attempt?.phase).toBe('unknown');
    expect(r.rejection).toBeUndefined();
    expect(calls).toHaveLength(1 + MAX_UNKNOWN_RETRIES);
    expect(sleeps).toEqual([1000, 2000, 4000]);
    expect(saved.at(-1)?.key).toBe('key-123');
    expect(saved.at(-1)?.phase).toBe('unknown');
  });

  it('treats definitive rejections as final: no retry, attempt cleared', async () => {
    for (const status of [400, 401, 404, 409]) {
      const { deps, calls, saved } = setup([new ApiError(status, 'X', 'nope', 'amount')]);
      const r = await sendAttempt('t', attempt(), deps);
      expect(r.attempt).toBeNull();
      expect(r.rejection?.status).toBe(status);
      expect(calls).toHaveLength(1);
      expect(saved.at(-1)).toBeNull();
    }
  });

  it('waits Retry-After on 429 then resends the same request', async () => {
    const { deps, calls, sleeps } = setup([new ApiError(429, 'RATE_LIMITED', 'slow', undefined, 2300), claim()]);
    const r = await sendAttempt('t', attempt(), deps);
    expect(r.attempt?.phase).toBe('tracking');
    expect(sleeps).toEqual([2300]);
    expect(calls.map((c) => c.key)).toEqual(['key-123', 'key-123']);
  });

  it('treats an unparsable success response as unknown outcome (the claim may exist)', async () => {
    const { deps, calls } = setup([new Error('Unexpected claim response') as any, claim()]);
    const r = await sendAttempt('t', attempt(), deps);
    expect(r.attempt?.phase).toBe('tracking');
    expect(calls).toHaveLength(2);
  });

  it('a replayed original claim that is already terminal goes straight to done', async () => {
    const { deps } = setup([claim('completed')]);
    expect((await sendAttempt('t', attempt(), deps)).attempt?.phase).toBe('done');
  });
});

describe('trackAttempt', () => {
  const tracking = (): ClaimAttempt => ({ ...attempt(), phase: 'tracking', claim: claim() });

  it('polls GET /claims/{id} until a terminal status, tolerating transient errors', async () => {
    const { deps } = setup([]);
    const seq: Array<Claim | ApiError> = [claim(), new ApiError(503, 'SERVER', 's'), claim('completed')];
    let n = 0;
    deps.getClaim = async () => {
      const v = seq[n++];
      if (v instanceof ApiError) throw v;
      return v;
    };
    const updates: string[] = [];
    const final = await trackAttempt('t', tracking(), deps, {
      shouldStop: () => false,
      onUpdate: (a) => updates.push(a.claim!.status),
    });
    expect(final.phase).toBe('done');
    expect(final.claim?.status).toBe('completed');
    expect(updates).toEqual(['pending', 'completed']);
  });

  it('reports a failed claim with its reason', async () => {
    const { deps } = setup([]);
    deps.getClaim = async () => claim('failed');
    const final = await trackAttempt('t', tracking(), deps, { shouldStop: () => false, onUpdate: () => {} });
    expect(final.claim?.failureReason).toBe('boom');
  });

  it('stops when asked and does not mark done', async () => {
    const { deps } = setup([]);
    let stop = false;
    deps.getClaim = async () => {
      stop = true;
      return claim();
    };
    const final = await trackAttempt('t', tracking(), deps, { shouldStop: () => stop, onUpdate: () => {} });
    expect(final.phase).toBe('tracking');
  });
});
