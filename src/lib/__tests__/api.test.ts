import { describe, expect, it } from 'vitest';
import { ApiError, parseBalances, parseClaim, parseClaimOptions } from '../api';

const item = { asset: 'USDT', decimals: 6, available: '820.413207', pending: '50.12', claiming: '0', usdPrice: '1.0002' };

describe('response parsing', () => {
  it('parses a valid balances response', () => {
    const b = parseBalances({ asOf: '2026-10-20T08:01:15.000Z', items: [item] });
    expect(b.items[0].available).toBe('820.413207');
  });
  it('rejects JSON-number amounts', () => {
    expect(() => parseBalances({ asOf: 'x', items: [{ ...item, available: 820.41 }] })).toThrow();
  });
  it('rejects malformed shapes', () => {
    expect(() => parseBalances(null)).toThrow();
    expect(() => parseBalances({ asOf: 'x', items: [{ ...item, decimals: '6' }] })).toThrow();
  });
  it('parses claim options and claims', () => {
    expect(parseClaimOptions({ asset: 'ETH', minAmount: '0.01', fee: '0.0012', destinations: [] }).fee).toBe('0.0012');
    const claim = {
      id: 'clm_1', asset: 'ETH', amount: '0.5', fee: '0.0012', receiveAmount: '0.4988',
      destinationId: 'd', status: 'pending', failureReason: null, createdAt: 'a', updatedAt: 'b',
    };
    expect(parseClaim(claim).status).toBe('pending');
    expect(() => parseClaim({ ...claim, status: 'weird' })).toThrow();
    expect(() => parseClaim({ ...claim, fee: 0.0012 })).toThrow();
  });
});

describe('ApiError', () => {
  it('marks only no-response and 5xx as unknown outcome', () => {
    expect(new ApiError(0, 'NETWORK', 'x').outcomeUnknown).toBe(true);
    expect(new ApiError(504, 'TIMEOUT', 'x').outcomeUnknown).toBe(true);
    expect(new ApiError(503, 'SERVER', 'x').outcomeUnknown).toBe(true);
    for (const s of [400, 401, 404, 409, 429]) expect(new ApiError(s, 'X', 'x').outcomeUnknown).toBe(false);
  });
});
