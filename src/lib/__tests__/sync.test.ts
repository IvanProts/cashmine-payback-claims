import { describe, expect, it } from 'vitest';
import { Claim } from '../api';
import { isReconciled, makeGate } from '../sync';

const claim = { id: 'clm_1', updatedAt: '2026-10-22T07:00:10.000Z' } as Claim;
const T = (s: string) => Date.parse(`2026-10-22T${s}.000Z`);

describe('balance sync gate', () => {
  const gate = makeGate(claim, '2026-10-22T07:00:05.000Z', T('07:00:12'));

  it('uses the newer of claim.updatedAt and the snapshot already shown', () => {
    expect(gate.minAsOf).toBe(T('07:00:10'));
    expect(makeGate(claim, '2026-10-22T07:00:20.000Z', 0).minAsOf).toBe(T('07:00:20'));
    expect(makeGate(claim, null, 0).minAsOf).toBe(T('07:00:10'));
  });

  it('is not reconciled without a successful fetch (e.g. refresh returned 503)', () => {
    expect(isReconciled(gate, { okStartedAt: null, asOf: null })).toBe(false);
  });

  it('is not reconciled by the old snapshot, even if re-fetched later', () => {
    expect(isReconciled(gate, { okStartedAt: T('07:00:13'), asOf: '2026-10-22T07:00:05.000Z' })).toBe(false);
    expect(isReconciled(gate, { okStartedAt: T('07:00:13'), asOf: '2026-10-22T07:00:10.000Z' })).toBe(false);
  });

  it('is not reconciled by a fetch that started before the settlement was observed', () => {
    expect(isReconciled(gate, { okStartedAt: T('07:00:11'), asOf: '2026-10-22T07:00:15.000Z' })).toBe(false);
  });

  it('is reconciled by a later successful fetch with a newer snapshot', () => {
    expect(isReconciled(gate, { okStartedAt: T('07:00:13'), asOf: '2026-10-22T07:00:15.000Z' })).toBe(true);
  });

  it('treats an unparsable asOf as not reconciled', () => {
    expect(isReconciled(gate, { okStartedAt: T('07:00:13'), asOf: 'garbage' })).toBe(false);
  });
});
