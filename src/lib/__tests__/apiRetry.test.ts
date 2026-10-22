import { afterEach, describe, expect, it, vi } from 'vitest';
import { createClaim, getBalances, getClaimOptions } from '../api';

const json = (status: number, body: unknown, headers: Record<string, string> = {}) =>
  new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', ...headers } });
const opts = { asset: 'ETH', minAmount: '0.01', fee: '0.0012', destinations: [] };
const err503 = () => json(503, { error: { code: 'SERVER', message: 'Service temporarily unavailable' } });

function stubFetch(responses: Response[]) {
  const fn = vi.fn(async () => responses.shift()!);
  vi.stubGlobal('fetch', fn);
  return fn;
}
afterEach(() => vi.unstubAllGlobals());

describe('GET wiring (real api functions, stubbed fetch)', () => {
  it('claim options: a transient 503 is retried and the user never sees an error', async () => {
    const f = stubFetch([err503(), json(200, opts)]);
    await expect(getClaimOptions('t', 'ETH')).resolves.toMatchObject({ fee: '0.0012' });
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('claim options: after 3 failed attempts the error is surfaced (for the manual Retry button)', async () => {
    const f = stubFetch([err503(), err503(), err503(), json(200, opts)]);
    await expect(getClaimOptions('t', 'ETH')).rejects.toMatchObject({ status: 503, message: 'Service temporarily unavailable' });
    expect(f).toHaveBeenCalledTimes(3);
  });

  it('429 respects retryAfterMs from the body', async () => {
    const f = stubFetch([
      json(429, { error: { code: 'RATE_LIMITED', message: 'slow', retryAfterMs: 700 } }),
      json(200, { asOf: '2026-10-22T07:00:00.000Z', items: [] }),
    ]);
    const t0 = Date.now();
    await getBalances('t');
    expect(Date.now() - t0).toBeGreaterThanOrEqual(690);
    expect(f).toHaveBeenCalledTimes(2);
  });

  it('401 is not retried', async () => {
    const f = stubFetch([json(401, { error: { code: 'UNAUTHORIZED', message: 'bad' } }), json(200, opts)]);
    await expect(getClaimOptions('t', 'ETH')).rejects.toMatchObject({ status: 401 });
    expect(f).toHaveBeenCalledTimes(1);
  });
});

describe('POST /v1/claims is never retried by the API layer', () => {
  it('a 503 on createClaim is a single fetch (replay-by-key stays in claimFlow)', async () => {
    const f = stubFetch([err503(), json(201, {})]);
    await expect(createClaim('t', 'key', { asset: 'ETH', amount: '0.5', destinationId: 'd' })).rejects.toMatchObject({ status: 503 });
    expect(f).toHaveBeenCalledTimes(1);
  });
});
