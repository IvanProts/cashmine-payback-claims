import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, Balances, getBalances } from './lib/api';

/** Server-authoritative balances. Never mutated locally; only replaced by a fresh GET /v1/balances. */
export function useBalances(token: string, autoRefreshMs: number | null) {
  const [data, setData] = useState<Balances | null>(null);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  // Client time at which the request that produced `data` was started (used by the sync policy).
  const [okStartedAt, setOkStartedAt] = useState<number | null>(null);
  const seq = useRef(0);

  const refresh = useCallback(async () => {
    const id = ++seq.current;
    const startedAt = Date.now();
    setRefreshing(true);
    try {
      const b = await getBalances(token);
      if (id === seq.current) {
        setData(b);
        setOkStartedAt(startedAt);
        setError(null);
      }
    } catch (e) {
      if (id === seq.current) setError(e as Error);
    } finally {
      if (id === seq.current) {
        setLoading(false);
        setRefreshing(false);
      }
    }
  }, [token]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    if (!autoRefreshMs) return;
    const t = setInterval(refresh, autoRefreshMs);
    return () => clearInterval(t);
  }, [refresh, autoRefreshMs]);

  return { data, error, loading, refreshing, okStartedAt, refresh };
}
