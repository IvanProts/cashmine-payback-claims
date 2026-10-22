import { useCallback, useEffect, useRef, useState } from 'react';
import { ActivityItem, mergeActivity } from './lib/activity';
import { getActivity } from './lib/api';

/** Read-only history with cursor pagination. Independent of balances and claims. */
export function useActivity(token: string) {
  const [items, setItems] = useState<ActivityItem[]>([]);
  const [nextCursor, setNextCursor] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null); // first page / refresh failed
  const [moreError, setMoreError] = useState<Error | null>(null); // a later page failed; loaded items stay visible
  const seq = useRef(0); // a refresh supersedes any in-flight request

  const load = useCallback(async () => {
    const id = ++seq.current;
    setLoading(true);
    setLoadingMore(false);
    setError(null);
    setMoreError(null);
    try {
      const page = await getActivity(token);
      if (id !== seq.current) return;
      setItems(page.items);
      setNextCursor(page.nextCursor);
    } catch (e) {
      if (id === seq.current) setError(e as Error);
    } finally {
      if (id === seq.current) setLoading(false);
    }
  }, [token]);

  const loadMore = useCallback(async () => {
    if (!nextCursor || loading || loadingMore) return;
    const id = seq.current;
    setLoadingMore(true);
    setMoreError(null);
    try {
      const page = await getActivity(token, { cursor: nextCursor });
      if (id !== seq.current) return;
      setItems((prev) => mergeActivity(prev, page.items));
      setNextCursor(page.nextCursor);
    } catch (e) {
      if (id === seq.current) setMoreError(e as Error);
    } finally {
      if (id === seq.current) setLoadingMore(false);
    }
  }, [token, nextCursor, loading, loadingMore]);

  useEffect(() => {
    load();
    return () => {
      seq.current++;
    };
  }, [load]);

  return { items, hasMore: nextCursor !== null, loading, loadingMore, error, moreError, reload: load, loadMore };
}
