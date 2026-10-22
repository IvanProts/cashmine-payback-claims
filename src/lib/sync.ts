import { Claim } from './api';

/**
 * Balance-sync policy. A claim's status (GET /claims/{id}) is authoritative for the claim, but the balances
 * snapshot may still be older than the settlement. After a claim reaches a terminal state we therefore keep a
 * "gate" until a snapshot that is provably newer than the settlement has been read from the server.
 * No amount is ever computed or overwritten locally; the gate only drives messaging and blocks NEW claims.
 */
export interface SyncGate {
  claimId: string;
  observedAt: number; // client time (ms) when we first saw the terminal status
  minAsOf: number; // snapshot must be newer than this (server time, ms)
}

export function makeGate(claim: Claim, currentAsOf: string | null, now: number): SyncGate {
  const t = (s: string | null | undefined) => {
    const v = s ? Date.parse(s) : NaN;
    return Number.isNaN(v) ? 0 : v;
  };
  // Newer than both the claim's last server update and the snapshot we were already showing.
  return { claimId: claim.id, observedAt: now, minAsOf: Math.max(t(claim.updatedAt), t(currentAsOf)) };
}

/**
 * Reconciled once a SUCCESSFUL balances fetch that started after we observed the settlement returned a snapshot
 * whose `asOf` is newer than the gate's threshold. Failed fetches (e.g. 503) never reconcile.
 */
export function isReconciled(gate: SyncGate, snap: { okStartedAt: number | null; asOf: string | null }): boolean {
  if (snap.okStartedAt === null || !snap.asOf) return false;
  const asOf = Date.parse(snap.asOf);
  if (Number.isNaN(asOf)) return false;
  return snap.okStartedAt >= gate.observedAt && asOf > gate.minAsOf;
}

/** Persisted form of the gate: timestamps and ids only (never balances), scoped to one token. */
export interface StoredGate extends SyncGate {
  tokenTag: string;
  closed: boolean;
}

// Liveness safeguard: snapshots refresh every ~15 s, so a gate that is still open after this long means the
// threshold can never be met (e.g. clock oddities); release it instead of blocking claims forever.
export const MAX_GATE_AGE_MS = 5 * 60 * 1000;

export const isExpired = (gate: SyncGate, now: number) => now - gate.observedAt > MAX_GATE_AGE_MS;

/** After a reload: the persisted gate is still in force only if it is open and belongs to this token. */
export function restoreGate(stored: StoredGate | null, tag: string): StoredGate | null {
  return stored && stored.tokenTag === tag && !stored.closed ? stored : null;
}

/**
 * Gate for a settled claim. A persisted gate for the same claim and token wins (open or closed), so a reload keeps
 * the original, stricter threshold and never re-opens a gate that was already reconciled.
 */
export function ensureGate(
  stored: StoredGate | null,
  tag: string,
  claim: Claim,
  currentAsOf: string | null,
  now: number,
): StoredGate {
  if (stored && stored.tokenTag === tag && stored.claimId === claim.id) return stored;
  return { ...makeGate(claim, currentAsOf, now), tokenTag: tag, closed: false };
}
