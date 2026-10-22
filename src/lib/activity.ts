import { D, plain } from './money';

export type ActivityType = 'accrual' | 'reversal' | 'claim';

export interface ActivityItem {
  id: string;
  type: ActivityType | string; // unknown types are kept and shown generically
  asset: string;
  amount: string; // signed decimal string: negative for reversals and claims
  status: string; // accrual pending|confirmed, reversal confirmed, claim pending|completed|failed
  exchange: string | null;
  createdAt: string;
  relatedId: string | null;
}

export interface ActivityPage {
  items: ActivityItem[];
  nextCursor: string | null; // null on the last page
}

const SIGNED_DECIMAL_RE = /^[+-]?\d+(\.\d+)?$/;

export function parseActivityPage(raw: any): ActivityPage {
  if (!raw || !Array.isArray(raw.items)) throw new Error('Unexpected activity response');
  if (raw.nextCursor !== null && typeof raw.nextCursor !== 'string') throw new Error('Unexpected activity cursor');
  return {
    items: raw.items.map((i: any): ActivityItem => {
      if (
        typeof i?.id !== 'string' ||
        typeof i.type !== 'string' ||
        typeof i.asset !== 'string' ||
        typeof i.status !== 'string' ||
        typeof i.createdAt !== 'string' ||
        typeof i.amount !== 'string' || // amounts are strings, never JSON numbers
        !SIGNED_DECIMAL_RE.test(i.amount)
      ) {
        throw new Error('Unexpected activity item');
      }
      return {
        id: i.id,
        type: i.type,
        asset: i.asset,
        amount: i.amount,
        status: i.status,
        exchange: typeof i.exchange === 'string' ? i.exchange : null,
        createdAt: i.createdAt,
        relatedId: typeof i.relatedId === 'string' ? i.relatedId : null,
      };
    }),
    nextCursor: raw.nextCursor ?? null,
  };
}

/** Append a newly loaded page, dropping items already shown (pages can overlap if history changes). */
export function mergeActivity(existing: ActivityItem[], incoming: ActivityItem[]): ActivityItem[] {
  const seen = new Set(existing.map((i) => i.id));
  return [...existing, ...incoming.filter((i) => !seen.has(i.id))];
}

/** Explicit-sign display of a signed amount: "+9.81", "−5", "0". Exact decimal formatting, no floats. */
export function formatSignedAmount(amount: string): { text: string; sign: 'positive' | 'negative' | 'zero' } {
  const d = new D(amount);
  if (d.isZero()) return { text: '0', sign: 'zero' };
  return d.isNegative()
    ? { text: `−${plain(d.abs())}`, sign: 'negative' }
    : { text: `+${plain(d)}`, sign: 'positive' };
}
