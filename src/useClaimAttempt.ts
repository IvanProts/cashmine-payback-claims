import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError, ClaimBody, createClaim, getClaim } from './lib/api';
import { ClaimAttempt, FlowDeps, isLocked, newAttempt, sendAttempt, trackAttempt, uuid } from './lib/claimFlow';
import { clearJson, loadJson, saveJson, tokenTag } from './lib/storage';

const deps: FlowDeps = {
  createClaim,
  getClaim,
  sleep: (ms) => new Promise((r) => setTimeout(r, ms)),
  save: (a) => (a ? saveJson(a) : clearJson()),
};

/**
 * Owns the single in-flight claim attempt: persists it, sends/replays it with the same key,
 * tracks it via GET /claims/{id}, and resumes after a reload. Balances are never touched here.
 */
export function useClaimAttempt(token: string, onChanged: () => void) {
  const tag = tokenTag(token);
  const [attempt, setAttempt] = useState<ClaimAttempt | null>(null);
  const [rejection, setRejection] = useState<ApiError | null>(null);
  const [pollError, setPollError] = useState<Error | null>(null);
  const [busy, setBusy] = useState(false);
  const running = useRef(false); // synchronous guard against double submit / double resume
  const alive = useRef(true);
  const onChangedRef = useRef(onChanged);
  onChangedRef.current = onChanged;

  const drive = useCallback(
    async (a: ClaimAttempt) => {
      if (running.current) return;
      running.current = true;
      setBusy(true);
      try {
        let current: ClaimAttempt | null = a;
        if (current.phase === 'sending' || current.phase === 'unknown') {
          setAttempt({ ...current, phase: 'sending' });
          const res = await sendAttempt(token, current, deps);
          if (!alive.current) return;
          setRejection(res.rejection ?? null);
          current = res.attempt;
          setAttempt(current);
          onChangedRef.current();
        }
        if (current && current.phase === 'tracking') {
          const final = await trackAttempt(token, current, deps, {
            shouldStop: () => !alive.current,
            onUpdate: (u) => alive.current && setAttempt(u),
            onPollError: (e) => alive.current && setPollError(e),
          });
          if (alive.current) setAttempt(final);
        }
        if (alive.current) onChangedRef.current();
      } finally {
        running.current = false;
        if (alive.current) setBusy(false);
      }
    },
    [token],
  );

  // Resume a persisted attempt (belonging to this token) after a reload.
  useEffect(() => {
    alive.current = true;
    const saved = loadJson<ClaimAttempt>();
    if (saved && saved.tokenTag === tag) {
      setAttempt(saved);
      if (saved.phase !== 'done') drive(saved);
    }
    return () => {
      alive.current = false;
    };
  }, [tag, drive]);

  const start = useCallback(
    (body: ClaimBody) => {
      if (running.current || isLocked(attempt)) return;
      setRejection(null);
      const a = newAttempt(body, tag, uuid());
      deps.save(a); // persist key + exact body BEFORE sending
      drive(a);
    },
    [attempt, tag, drive],
  );

  /** User-triggered re-check of an 'unknown' attempt: replays the identical request (same key, same body). */
  const recheck = useCallback(() => {
    if (attempt && attempt.phase === 'unknown') drive(attempt);
  }, [attempt, drive]);

  const dismiss = useCallback(() => {
    if (attempt?.phase === 'done') {
      clearJson();
      setAttempt(null);
    }
  }, [attempt]);

  return { attempt, rejection, pollError, busy, locked: isLocked(attempt), start, recheck, dismiss };
}
