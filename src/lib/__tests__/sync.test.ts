import { describe, expect, it } from 'vitest';
import { Claim } from '../api';
import { loadGate, saveGate } from '../storage';
import { ensureGate, isExpired, isReconciled, makeGate, MAX_GATE_AGE_MS, restoreGate, StoredGate } from '../sync';

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

describe('persisted gate across reloads', () => {
  const settledAt = T('07:00:12');
  const open = (): StoredGate => ({ ...makeGate(claim, '2026-10-22T07:00:05.000Z', settledAt), tokenTag: 'tagA', closed: false });

  it('round-trips through storage (timestamps/ids only, no balances)', () => {
    saveGate(open());
    const back = loadGate<StoredGate>()!;
    expect(back).toEqual(open());
    expect(Object.keys(back).sort()).toEqual(['claimId', 'closed', 'minAsOf', 'observedAt', 'tokenTag']);
  });

  it('reload during syncing: the gate is restored and still blocks', () => {
    saveGate(open());
    expect(restoreGate(loadGate<StoredGate>(), 'tagA')).not.toBeNull();
  });

  it('reload keeps the original strict threshold instead of rebuilding a weaker one', () => {
    const stored = open();
    // After reload no snapshot is loaded yet (currentAsOf = null) and the clock moved on.
    const again = ensureGate(stored, 'tagA', claim, null, settledAt + 60_000);
    expect(again).toBe(stored);
    expect(again.minAsOf).toBe(T('07:00:10'));
  });

  it('after reload: a 503 refresh, then a stale cached snapshot, never reconcile; a newer snapshot does', () => {
    const g = restoreGate(open(), 'tagA')!;
    const reloadAt = settledAt + 30_000;
    // refresh #1 failed with 503 -> hook has no successful fetch yet
    expect(isReconciled(g, { okStartedAt: null, asOf: null })).toBe(false);
    // refresh #2 succeeded but the server still serves the pre-settlement snapshot
    expect(isReconciled(g, { okStartedAt: reloadAt, asOf: '2026-10-22T07:00:05.000Z' })).toBe(false);
    // refresh #3 returns a snapshot newer than the settlement
    expect(isReconciled(g, { okStartedAt: reloadAt + 5_000, asOf: '2026-10-22T07:00:40.000Z' })).toBe(true);
  });

  it('once reconciled and closed, a reload neither restores nor re-opens it', () => {
    const closed: StoredGate = { ...open(), closed: true };
    expect(restoreGate(closed, 'tagA')).toBeNull();
    expect(ensureGate(closed, 'tagA', claim, null, settledAt + 60_000)).toBe(closed);
  });

  it('a different token never inherits the gate; it gets its own for its own claim', () => {
    const stored = open();
    expect(restoreGate(stored, 'tagB')).toBeNull();
    const other = ensureGate(stored, 'tagB', { ...claim, id: 'clm_9' }, null, settledAt);
    expect(other).not.toBe(stored);
    expect(other.tokenTag).toBe('tagB');
    expect(other.closed).toBe(false);
    // even the same claim id under another token is not reused
    expect(ensureGate(stored, 'tagB', claim, null, settledAt).tokenTag).toBe('tagB');
  });

  it('releases a gate that can never be satisfied after MAX_GATE_AGE_MS', () => {
    const g = open();
    expect(isExpired(g, g.observedAt + MAX_GATE_AGE_MS)).toBe(false);
    expect(isExpired(g, g.observedAt + MAX_GATE_AGE_MS + 1)).toBe(true);
  });
});
