import { describe, expect, it } from 'vitest';
import { amountAfterSettlement, amountWhenNothingClaimable, claimability, describeFailure, isNewSettlement, optionsFor } from '../claimForm';

describe('claimability (empty state instead of validation errors)', () => {
  it('nothing available', () => {
    expect(claimability('0', '0.0005')).toEqual({ canClaim: false, reason: 'NONE_AVAILABLE' });
    expect(claimability('0.000000', '0.0005')).toEqual({ canClaim: false, reason: 'NONE_AVAILABLE' });
  });
  it('below the minimum claim amount', () => {
    expect(claimability('0.0004', '0.0005')).toEqual({ canClaim: false, reason: 'BELOW_MINIMUM' });
    expect(claimability('0.00049999', '0.0005')).toEqual({ canClaim: false, reason: 'BELOW_MINIMUM' });
  });
  it('exactly the minimum, or more, is claimable', () => {
    expect(claimability('0.0005', '0.0005')).toEqual({ canClaim: true });
    expect(claimability('820.413207', '0.01')).toEqual({ canClaim: true });
  });
  it('a zero minimum still needs a positive balance', () => {
    expect(claimability('0', '0')).toEqual({ canClaim: false, reason: 'NONE_AVAILABLE' });
    expect(claimability('0.000001', '0')).toEqual({ canClaim: true });
  });
});

describe('form state after a claim settles', () => {
  it('completed: clears the amount (it was consumed), so no stale "exceeds available" error', () => {
    expect(amountAfterSettlement('completed', '0.00246567')).toBe('');
  });
  it('failed: keeps the amount so the user can retry', () => {
    expect(amountAfterSettlement('failed', '0.00246567')).toBe('0.00246567');
  });
  it('reacts once per settled claim, not on every render or refresh', () => {
    expect(isNewSettlement(null, 'clm_1')).toBe(true);
    expect(isNewSettlement('clm_1', 'clm_1')).toBe(false); // balance refreshes re-render with the same settled claim
    expect(isNewSettlement('clm_1', 'clm_2')).toBe(true);
    expect(isNewSettlement('clm_1', null)).toBe(false); // dismissing the card does not touch the form
    expect(isNewSettlement(null, null)).toBe(false);
  });
});

describe('asset switching', () => {
  const eth = { asset: 'ETH', fee: '0.0012' };
  it('options for another asset are ignored (no cross-asset min/fee/validation)', () => {
    expect(optionsFor(eth, 'BTC')).toBeNull();
    expect(optionsFor(eth, null)).toBeNull();
    expect(optionsFor(null, 'ETH')).toBeNull();
  });
  it('matching options are used', () => {
    expect(optionsFor(eth, 'ETH')).toBe(eth);
  });
});

describe('describeFailure', () => {
  it('does not repeat the "returned to your balance" sentence the server already sent (screenshot case)', () => {
    const s = describeFailure('The destination rejected the transfer. The amount was returned to your balance.');
    expect(s).toBe('The destination rejected the transfer. The amount was returned to your balance.');
    expect(s).not.toMatch(/\.\./);
    expect(s.match(/balance/g)).toHaveLength(1);
  });
  it('adds the generic line when the reason does not say it', () => {
    expect(describeFailure('Destination rejected the transfer')).toBe(
      'Destination rejected the transfer. The amount returns to your available balance.',
    );
    expect(describeFailure('Destination rejected the transfer.')).toBe(
      'Destination rejected the transfer. The amount returns to your available balance.',
    );
  });
  it('falls back to the generic line without a reason', () => {
    for (const r of [null, undefined, '', '   ', '..']) {
      expect(describeFailure(r)).toBe('The amount returns to your available balance.');
    }
  });
});

describe('amount while nothing is claimable', () => {
  it('is cleared normally, so no stale value or error resurfaces when the balance returns', () => {
    expect(amountWhenNothingClaimable('0.00246567', false)).toBe('');
  });
  it('is kept after a failed claim (snapshot may still show 0 while the funds are returning)', () => {
    expect(amountWhenNothingClaimable('0.00246567', true)).toBe('0.00246567');
  });
});

describe('screenshot scenarios end to end (pure decisions)', () => {
  it('Max-claim everything and it completes: amount cleared, balance 0 -> empty state, no validation error', () => {
    expect(amountAfterSettlement('completed', '0.00246567')).toBe('');
    expect(claimability('0', '0.0005')).toEqual({ canClaim: false, reason: 'NONE_AVAILABLE' });
  });
  it('Max-claim everything and it fails: amount kept while the snapshot still says 0, form returns with the amount', () => {
    let amount = amountAfterSettlement('failed', '0.00246567');
    expect(claimability('0', '0.0005').canClaim).toBe(false);
    amount = amountWhenNothingClaimable(amount, true); // hidden, still held
    expect(amount).toBe('0.00246567');
    expect(claimability('0.00246567', '0.0005').canClaim).toBe(true); // funds back: form shows the kept amount again
  });
});
