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
