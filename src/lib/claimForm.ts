import { D } from './money';

/** Pure decisions behind the claim form's state handling (kept out of the component so they are unit-tested). */

export type Claimability =
  | { canClaim: true }
  | { canClaim: false; reason: 'NONE_AVAILABLE' | 'BELOW_MINIMUM' };

/** Can the user claim anything at all right now? Nothing available, or less than the minimum, means the form is moot. */
export function claimability(available: string, minAmount: string): Claimability {
  const a = new D(available);
  if (!a.gt(0)) return { canClaim: false, reason: 'NONE_AVAILABLE' };
  if (a.lt(minAmount)) return { canClaim: false, reason: 'BELOW_MINIMUM' };
  return { canClaim: true };
}

/**
 * Amount field after a claim settles: a completed claim consumed the typed amount, so clear it; a failed claim
 * returned the funds, so keep what the user entered and let them retry (optionally with another destination).
 */
export function amountAfterSettlement(status: 'completed' | 'failed', current: string): string {
  return status === 'completed' ? '' : current;
}

/**
 * Amount while nothing is claimable (the form is hidden). Normally cleared so no stale value resurfaces later, but kept
 * after a FAILED claim: the funds are on their way back and the snapshot may briefly still show zero.
 */
export function amountWhenNothingClaimable(current: string, holdForRetry: boolean): string {
  return holdForRetry ? current : '';
}

/** Only react to a settlement once per claim (the settled claim card stays on screen afterwards). */
export function isNewSettlement(prevId: string | null, nextId: string | null): boolean {
  return nextId !== null && nextId !== prevId;
}

/** Options belong to one asset; ignore them in the render between an asset switch and the new options arriving. */
export function optionsFor<T extends { asset: string }>(options: T | null, asset: string | null): T | null {
  return options && asset !== null && options.asset === asset ? options : null;
}

const GENERIC_RETURN = 'The amount returns to your available balance.';

/** One sentence for a failed claim: the server's reason, plus our generic line only if the reason doesn't already say it. */
export function describeFailure(reason: string | null | undefined): string {
  const r = (reason ?? '').trim().replace(/[.\s]+$/, '');
  if (!r) return GENERIC_RETURN;
  const alreadySaysReturned = /\b(return(ed|s)?|refund(ed|s)?|credited|restored)\b/i.test(r) && /\b(balance|available|account|wallet)\b/i.test(r);
  return alreadySaysReturned ? `${r}.` : `${r}. ${GENERIC_RETURN}`;
}
