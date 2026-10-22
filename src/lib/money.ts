import Decimal from 'decimal.js';

// Isolated Decimal constructor: 40 significant digits is far beyond any asset's `decimals`,
// so +, - and * on amounts are exact. ROUND_DOWN only matters for explicit display rounding.
export const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_DOWN });
export type Dec = Decimal;

// API format: digits, optional dot + digits, no leading zeros. ".5", "1.", "05", "1e-3" are invalid.
const USER_AMOUNT_RE = /^(0|[1-9]\d*)(\.\d+)?$/;
// Server data is trusted less strictly (we only need it to be a plain non-negative decimal string).
const SERVER_DECIMAL_RE = /^\d+(\.\d+)?$/;

export function parseServerDecimal(value: unknown, label = 'value'): Dec {
  if (typeof value !== 'string' || !SERVER_DECIMAL_RE.test(value)) {
    throw new Error(`Invalid decimal string for ${label}`);
  }
  return new D(value);
}

/** Canonical plain-notation string (never exponent form, no trailing zeros). */
export function plain(value: Dec | string): string {
  return new D(value).toFixed();
}

export type AmountError = 'EMPTY' | 'FORMAT' | 'PRECISION' | 'BELOW_MIN' | 'ABOVE_AVAILABLE';

export type AmountCheck =
  | { ok: true; amount: Dec; text: string }
  | { ok: false; error: AmountError; message: string };

export interface AmountRules {
  decimals: number;
  minAmount: string;
  available: string;
}

/** Mirrors the documented API rules: format, <= decimals places, minAmount <= amount <= available. */
export function validateAmount(input: string, rules: AmountRules): AmountCheck {
  const text = input.trim();
  if (text === '') return { ok: false, error: 'EMPTY', message: 'Enter an amount' };
  if (!USER_AMOUNT_RE.test(text)) {
    return {
      ok: false,
      error: 'FORMAT',
      message: 'Use digits with an optional dot, e.g. 0.5 or 12 (no leading zeros, no ".5", "1." or exponents)',
    };
  }
  const fraction = text.split('.')[1] ?? '';
  if (fraction.length > rules.decimals) {
    return { ok: false, error: 'PRECISION', message: `At most ${rules.decimals} decimal places allowed` };
  }
  const amount = new D(text);
  if (amount.lt(rules.minAmount)) {
    return { ok: false, error: 'BELOW_MIN', message: `Minimum amount is ${plain(rules.minAmount)}` };
  }
  if (amount.gt(rules.available)) {
    return { ok: false, error: 'ABOVE_AVAILABLE', message: `Exceeds available balance (${plain(rules.available)})` };
  }
  return { ok: true, amount, text };
}

export interface ClaimPreview {
  fee: Dec;
  receive: Dec;
}

/** The fee is taken from the claimed amount: user receives amount - fee. Exact decimal subtraction. */
export function claimPreview(amount: Dec, fee: string): ClaimPreview {
  const feeDec = new D(fee);
  return { fee: feeDec, receive: amount.minus(feeDec) };
}

export interface BalanceLike {
  available: string;
  usdPrice: string;
}

export function usdValue(amount: string, usdPrice: string): Dec {
  return new D(amount).times(usdPrice);
}

/** Total USD value of the claimable (`available`) balances. */
export function totalUsd(items: BalanceLike[]): Dec {
  return items.reduce<Dec>((sum, i) => sum.plus(usdValue(i.available, i.usdPrice)), new D(0));
}

/** Display-only rounding to cents (half-up) with thousands separators. Never fed back into maths. */
export function formatUsd(value: Dec): string {
  const fixed = new D(value).toFixed(2, Decimal.ROUND_HALF_UP);
  const [int, frac] = fixed.split('.');
  return `$${int.replace(/\B(?=(\d{3})+(?!\d))/g, ',')}.${frac}`;
}
