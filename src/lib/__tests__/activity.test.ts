import { afterEach, describe, expect, it, vi } from 'vitest';
import { formatSignedAmount, mergeActivity, parseActivityPage } from '../activity';
import { getActivity } from '../api';

const item = (o: Record<string, unknown> = {}) => ({
  id: 'act_1', type: 'accrual', asset: 'USDT', amount: '9.81', status: 'confirmed',
  exchange: 'Binance', createdAt: '2026-10-20T08:01:15.000Z', relatedId: null, ...o,
});

describe('parseActivityPage', () => {
  it('parses the documented shape', () => {
    const p = parseActivityPage({ items: [item()], nextCursor: 'abc' });
    expect(p.items[0]).toMatchObject({ id: 'act_1', type: 'accrual', amount: '9.81', exchange: 'Binance', relatedId: null });
    expect(p.nextCursor).toBe('abc');
  });
  it('accepts signed amounts (negative for reversals and claims) and null exchange on claims', () => {
    const p = parseActivityPage({
      items: [
        item({ id: 'a', type: 'reversal', amount: '-5.2', relatedId: 'act_1' }),
        item({ id: 'b', type: 'claim', amount: '-0.5', status: 'pending', exchange: null, relatedId: 'clm_1' }),
      ],
      nextCursor: null,
    });
    expect(p.items.map((i) => i.amount)).toEqual(['-5.2', '-0.5']);
    expect(p.items[1].exchange).toBeNull();
    expect(p.items[1].relatedId).toBe('clm_1');
    expect(p.nextCursor).toBeNull(); // last page
  });
  it('rejects JSON-number amounts, malformed amounts and bad shapes', () => {
    expect(() => parseActivityPage({ items: [item({ amount: 9.81 })], nextCursor: null })).toThrow();
    expect(() => parseActivityPage({ items: [item({ amount: '1e-3' })], nextCursor: null })).toThrow();
    expect(() => parseActivityPage({ items: [item({ amount: '' })], nextCursor: null })).toThrow();
    expect(() => parseActivityPage({ items: 'x', nextCursor: null })).toThrow();
    expect(() => parseActivityPage({ items: [], nextCursor: 5 })).toThrow();
    expect(() => parseActivityPage(null)).toThrow();
  });
  it('keeps unknown types/statuses instead of failing (shown generically)', () => {
    expect(parseActivityPage({ items: [item({ type: 'bonus', status: 'weird' })], nextCursor: null }).items[0].type).toBe('bonus');
  });
  it('treats an empty page as valid (empty state)', () => {
    expect(parseActivityPage({ items: [], nextCursor: null })).toEqual({ items: [], nextCursor: null });
  });
});

describe('mergeActivity', () => {
  const mk = (id: string) => parseActivityPage({ items: [item({ id })], nextCursor: null }).items[0];
  it('appends new items in order and drops duplicates from overlapping pages', () => {
    const merged = mergeActivity([mk('a'), mk('b')], [mk('b'), mk('c')]);
    expect(merged.map((i) => i.id)).toEqual(['a', 'b', 'c']);
  });
  it('does not mutate its inputs', () => {
    const base = [mk('a')];
    mergeActivity(base, [mk('b')]);
    expect(base).toHaveLength(1);
  });
});

describe('formatSignedAmount', () => {
  it('adds an explicit sign and keeps exact decimals', () => {
    expect(formatSignedAmount('9.81')).toEqual({ text: '+9.81', sign: 'positive' });
    expect(formatSignedAmount('-0.0012')).toEqual({ text: '−0.0012', sign: 'negative' });
    expect(formatSignedAmount('-100000000000000000000.000000000000000001').text).toBe('−100000000000000000000.000000000000000001');
    expect(formatSignedAmount('0')).toEqual({ text: '0', sign: 'zero' });
    expect(formatSignedAmount('-0.000')).toEqual({ text: '0', sign: 'zero' });
  });
});

describe('getActivity (stubbed fetch)', () => {
  afterEach(() => vi.unstubAllGlobals());
  const json = (status: number, body: unknown) =>
    new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
  const stub = (responses: Response[]) => {
    const fn = vi.fn(async (_url: string) => responses.shift()!);
    vi.stubGlobal('fetch', fn);
    return fn;
  };

  it('requests the first page with limit=20 and no cursor', async () => {
    const f = stub([json(200, { items: [item()], nextCursor: 'next' })]);
    const p = await getActivity('t');
    expect(f.mock.calls[0][0]).toMatch(/\/v1\/activity\?limit=20$/);
    expect(p.nextCursor).toBe('next');
  });
  it('passes nextCursor back as an encoded cursor param', async () => {
    const f = stub([json(200, { items: [], nextCursor: null })]);
    await getActivity('t', { cursor: 'a+b/c=&x' });
    expect(f.mock.calls[0][0]).toMatch(/\/v1\/activity\?limit=20&cursor=a%2Bb%2Fc%3D%26x$/);
  });
  it('retries a transient 503 like any GET', async () => {
    const f = stub([json(503, { error: { code: 'SERVER', message: 'x' } }), json(200, { items: [], nextCursor: null })]);
    await expect(getActivity('t')).resolves.toEqual({ items: [], nextCursor: null });
    expect(f).toHaveBeenCalledTimes(2);
  });
});
