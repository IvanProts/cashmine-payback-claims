import { ActivityPage, parseActivityPage } from './activity';
import { parseServerDecimal } from './money';
import { withGetRetry } from './retry';

// Public, non-secret config. Overridable for local mock-server testing only.
export const API_BASE = process.env.EXPO_PUBLIC_API_BASE ?? 'https://task-api.cashmine.io';
const REQUEST_TIMEOUT_MS = 20000;

export interface BalanceItem {
  asset: string;
  decimals: number;
  available: string;
  pending: string;
  claiming: string;
  usdPrice: string;
}
export interface Balances {
  asOf: string;
  items: BalanceItem[];
}
export interface ClaimOptions {
  asset: string;
  minAmount: string;
  fee: string;
  destinations: { id: string; label: string }[];
}
export interface ClaimBody {
  asset: string;
  amount: string;
  destinationId: string;
}
export type ClaimStatus = 'pending' | 'completed' | 'failed';
export interface Claim {
  id: string;
  asset: string;
  amount: string;
  fee: string;
  receiveAmount: string;
  destinationId: string;
  status: ClaimStatus;
  failureReason: string | null;
  createdAt: string;
  updatedAt: string;
}

export class ApiError extends Error {
  constructor(
    public status: number, // 0 = no HTTP response (network failure / client timeout)
    public code: string,
    message: string,
    public field?: string,
    public retryAfterMs?: number,
  ) {
    super(message);
  }
  /** The request may or may not have been processed (safe to re-send only with the same idempotency key). */
  get outcomeUnknown(): boolean {
    return this.status === 0 || this.status >= 500;
  }
}

async function request<T>(
  method: 'GET' | 'POST',
  path: string,
  token: string,
  opts: { body?: unknown; headers?: Record<string, string> } = {},
): Promise<{ status: number; data: T }> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, {
      method,
      signal: controller.signal,
      headers: {
        Authorization: `Bearer ${token}`,
        ...(opts.body !== undefined ? { 'Content-Type': 'application/json' } : {}),
        ...opts.headers,
      },
      body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    });
  } catch (e) {
    const aborted = e instanceof Error && e.name === 'AbortError';
    throw new ApiError(0, aborted ? 'CLIENT_TIMEOUT' : 'NETWORK', aborted ? 'Request timed out' : 'Network error');
  } finally {
    clearTimeout(timer);
  }

  let json: any = null;
  try {
    json = await res.json();
  } catch {
    json = null;
  }
  if (!res.ok) {
    const err = json?.error ?? {};
    const headerRetry = Number(res.headers.get('Retry-After'));
    const retryAfterMs =
      typeof err.retryAfterMs === 'number' ? err.retryAfterMs : headerRetry > 0 ? headerRetry * 1000 : undefined;
    throw new ApiError(
      res.status,
      err.code ?? (res.status === 504 ? 'TIMEOUT' : 'SERVER'),
      err.message ?? `Request failed (${res.status})`,
      err.field,
      retryAfterMs,
    );
  }
  return { status: res.status, data: json as T };
}

// --- response parsing: reject anything that is not a decimal string (never JSON numbers) ---

export function parseBalances(raw: any): Balances {
  if (!raw || typeof raw.asOf !== 'string' || !Array.isArray(raw.items)) throw new Error('Unexpected balances response');
  return {
    asOf: raw.asOf,
    items: raw.items.map((i: any): BalanceItem => {
      if (typeof i?.asset !== 'string' || !Number.isInteger(i.decimals)) throw new Error('Unexpected balance item');
      for (const k of ['available', 'pending', 'claiming', 'usdPrice']) parseServerDecimal(i[k], `${i.asset}.${k}`);
      return {
        asset: i.asset,
        decimals: i.decimals,
        available: i.available,
        pending: i.pending,
        claiming: i.claiming,
        usdPrice: i.usdPrice,
      };
    }),
  };
}

export function parseClaimOptions(raw: any): ClaimOptions {
  if (!raw || typeof raw.asset !== 'string' || !Array.isArray(raw.destinations)) {
    throw new Error('Unexpected claim options response');
  }
  parseServerDecimal(raw.minAmount, 'minAmount');
  parseServerDecimal(raw.fee, 'fee');
  return { asset: raw.asset, minAmount: raw.minAmount, fee: raw.fee, destinations: raw.destinations };
}

export function parseClaim(raw: any): Claim {
  if (!raw || typeof raw.id !== 'string' || !['pending', 'completed', 'failed'].includes(raw.status)) {
    throw new Error('Unexpected claim response');
  }
  for (const k of ['amount', 'fee', 'receiveAmount']) parseServerDecimal(raw[k], k);
  return raw as Claim;
}

// --- endpoints ---

// Reads are retried a couple of times on transient errors (see retry.ts); POST /v1/claims is deliberately not.
const get = <T>(path: string, token: string) => withGetRetry(() => request<T>('GET', path, token));

export async function getBalances(token: string): Promise<Balances> {
  return parseBalances((await get('/v1/balances', token)).data);
}

export async function getClaimOptions(token: string, asset: string): Promise<ClaimOptions> {
  return parseClaimOptions((await get(`/v1/claim-options?asset=${encodeURIComponent(asset)}`, token)).data);
}

export const ACTIVITY_PAGE_SIZE = 20; // API maximum

/** One page of history, newest first. Pass the previous page's `nextCursor` (opaque) to continue. */
export async function getActivity(token: string, opts: { cursor?: string | null } = {}): Promise<ActivityPage> {
  const q = `limit=${ACTIVITY_PAGE_SIZE}${opts.cursor ? `&cursor=${encodeURIComponent(opts.cursor)}` : ''}`;
  return parseActivityPage((await get(`/v1/activity?${q}`, token)).data);
}

export async function createClaim(token: string, idempotencyKey: string, body: ClaimBody) {
  const res = await request('POST', '/v1/claims', token, { body, headers: { 'Idempotency-Key': idempotencyKey } });
  return { claim: parseClaim(res.data), replayed: res.status === 200 };
}

export async function getClaim(token: string, id: string): Promise<Claim> {
  return parseClaim((await get(`/v1/claims/${encodeURIComponent(id)}`, token)).data);
}
