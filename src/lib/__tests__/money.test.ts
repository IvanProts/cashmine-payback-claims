import { describe, expect, it } from 'vitest';
import { claimPreview, D, formatUsd, parseServerDecimal, plain, totalUsd, usdValue, validateAmount } from '../money';

const rules = { decimals: 6, minAmount: '0.01', available: '820.413207' };
const check = (v: string, r = rules) => validateAmount(v, r);

describe('parsing', () => {
  it('accepts plain decimal strings from the server', () => {
    expect(parseServerDecimal('820.413207').toFixed()).toBe('820.413207');
    expect(parseServerDecimal('0').toFixed()).toBe('0');
  });
  it('rejects JSON numbers, exponents, signs and malformed strings', () => {
    for (const bad of [1.5, null, undefined, '1e-3', '-1', '.5', '1.', '', 'abc']) {
      expect(() => parseServerDecimal(bad)).toThrow();
    }
  });
  it('plain() never produces exponent notation or trailing zeros', () => {
    expect(plain('0.0000001')).toBe('0.0000001');
    expect(plain('1.500')).toBe('1.5');
    expect(plain('100000000000000000000')).toBe('100000000000000000000');
    expect(plain(new D('1e-9'))).toBe('0.000000001');
  });
});

describe('validateAmount (documented API rules)', () => {
  it('accepts valid amounts including the exact bounds', () => {
    for (const v of ['0.5', '12', '0.01', '820.413207', '1.123456']) expect(check(v).ok).toBe(true);
  });
  it.each(['.5', '1.', '05', '1e-3', '-1', '1,5', '0x10', '1 5', '00.5', '+1'])('rejects format: %s', (v) => {
    const r = check(v);
    expect(r.ok === false && r.error).toBe('FORMAT');
  });
  it('rejects empty input', () => {
    const r = check('   ');
    expect(r.ok === false && r.error).toBe('EMPTY');
  });
  it('rejects more than `decimals` decimal places', () => {
    expect(check('1.1234567').ok).toBe(false);
    expect(check('1.1234567', { ...rules, decimals: 8 }).ok).toBe(true);
    const r = check('1.5', { ...rules, decimals: 0 });
    expect(r.ok === false && r.error).toBe('PRECISION');
  });
  it('enforces minAmount <= amount <= available', () => {
    const lo = check('0.009999');
    expect(lo.ok === false && lo.error).toBe('BELOW_MIN');
    const hi = check('820.413208');
    expect(hi.ok === false && hi.error).toBe('ABOVE_AVAILABLE');
    expect(check('0').ok).toBe(false);
  });
  it('does not require amount > fee (not an API rule)', () => {
    expect(validateAmount('0.01', { decimals: 6, minAmount: '0.01', available: '5' }).ok).toBe(true);
  });
  it('trims surrounding whitespace and returns the exact text to send', () => {
    const r = check(' 0.50 ');
    expect(r.ok && r.text).toBe('0.50');
  });
});

describe('fee calculation', () => {
  it('is exact where floats are not (0.3 - 0.1)', () => {
    expect(plain(claimPreview(new D('0.3'), '0.1').receive)).toBe('0.2');
    expect(0.3 - 0.1).not.toBe(0.2); // the float trap we avoid
  });
  it('matches the documented example: 0.5 - 0.0012 = 0.4988', () => {
    const p = claimPreview(new D('0.5'), '0.0012');
    expect(plain(p.fee)).toBe('0.0012');
    expect(plain(p.receive)).toBe('0.4988');
  });
  it('keeps 18-decimal precision', () => {
    expect(plain(claimPreview(new D('1.000000000000000001'), '0.000000000000000002').receive)).toBe('0.999999999999999999');
  });
  it('reports a non-positive result so the UI can warn', () => {
    expect(claimPreview(new D('0.001'), '0.0012').receive.lte(0)).toBe(true);
  });
});

describe('totals', () => {
  it('computes USD value exactly', () => {
    expect(plain(usdValue('820.413207', '1.0002'))).toBe('820.5772896414');
    expect(plain(usdValue('0.1', '0.2'))).toBe('0.02');
  });
  it('sums available balances without float drift', () => {
    const items = [
      { available: '0.1', usdPrice: '1' },
      { available: '0.2', usdPrice: '1' },
    ];
    expect(plain(totalUsd(items))).toBe('0.3');
  });
  it('totals mixed assets', () => {
    const total = totalUsd([
      { available: '820.413207', usdPrice: '1.0002' },
      { available: '0.5', usdPrice: '64000.5' },
      { available: '0', usdPrice: '3000' },
    ]);
    expect(plain(total)).toBe('32820.8272896414');
    expect(formatUsd(total)).toBe('$32,820.83');
  });
  it('returns zero for no assets', () => {
    expect(formatUsd(totalUsd([]))).toBe('$0.00');
  });
  it('formats USD half-up with separators', () => {
    expect(formatUsd(new D('1234.565'))).toBe('$1,234.57');
    expect(formatUsd(new D('0.004'))).toBe('$0.00');
    expect(formatUsd(new D('1000000'))).toBe('$1,000,000.00');
  });
});
