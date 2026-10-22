# Engineering notes

## Decisions

**Balance after a claim (decision recorded in ai-logs): server-authoritative, with separate pending state.**
Balances are only ever replaced by a fresh `GET /v1/balances`; they are never mutated locally. A "Claim" card shows
the in-flight/finished claim next to them. Rationale: snapshots are recomputed every 15 s, so an optimistic number can be
overwritten by a stale snapshot, and an unknown outcome (timeout) would leave us unable to say whether to roll back.
Trade-off: after submit the balance can look stale for up to ~15 s; the UI says so, polls balances every 5 s while a
claim is unresolved, and refreshes again when the claim settles and ~16 s later (next snapshot).
`asOf` alone is **not** treated as proof that a claim is reflected; `GET /claims/{id}` is the only source of claim status.

**Stale-snapshot policy (after a claim settles).** `GET /claims/{id}` confirms the claim; the balances snapshot can still
lag (or refresh can fail, e.g. 503). When a claim becomes completed/failed we open a *sync gate* (`src/lib/sync.ts`). It
closes only when a **successful** balances fetch that **started after** we observed the settlement returns an `asOf`
newer than both the claim's `updatedAt` and the snapshot we were showing. Until then: the claim card says "Balances:
syncing" (separately from the confirmed claim status), the balances card flags figures as possibly outdated, balances are
polled every 5 s (so a failed refresh retries on its own), and **only new claim submissions** (Review/Confirm) are paused;
browsing, refresh, editing the amount and token changes stay enabled. No amount is computed or overwritten locally.
The gate is persisted in `localStorage` (`cashmine.syncGate`: claim id, two timestamps, token tag, closed flag; never
balances), so a reload or dismissing the claim card cannot bypass it, and a reconciled gate is stored as closed so it is not
re-opened. It is scoped to the token (`Main` is keyed by the token tag, so a token change starts clean and never inherits
another account's gate). Safeguard: a gate still open after 5 minutes is released so a threshold that can never be met
(e.g. clock oddities) cannot block claims forever. The server still checks `available` live on every POST.

**Money.** All amounts are strings end to end; arithmetic uses `decimal.js` (isolated constructor, 40 digits) – no
`Number` for money. Fee is a flat per-asset amount from `claim-options`; received = amount − fee (exact subtraction, so
no rounding rule is needed). Amounts are sent as the validated user text (never `toString()`-ed, no exponents).
Display rounding (USD to cents, half-up) is display-only and never fed back into calculations.

**Validation = exactly the documented API rules**: format `^(0|[1-9]\d*)(\.\d+)?$`, ≤ `decimals` decimal places,
`minAmount <= amount <= available`. The decimal-place check counts characters of the typed string (`"0.50"` has 2).
`available` is taken from the latest snapshot, but the server checks live, so a server `400 VALIDATION` is shown verbatim.

**Product safeguards that are NOT API rules** (documented so they are not mistaken for API validation):
1. Non-blocking warning if `amount − fee <= 0` (user would receive nothing). It does not block submission.
2. Only one claim attempt may be unresolved at a time (submit is disabled while sending/unknown/pending).
3. Balances are re-fetched when the user presses "Review claim" and the confirm screen re-validates.
4. Whitespace around the amount is trimmed before validation.

**Unknown outcomes / idempotency.** The docs guarantee that repeating a POST with the same `Idempotency-Key` and body
returns the original claim and never creates a second one. So:
- The attempt `{key (UUID), exact body}` is saved to `localStorage` **before** the first POST.
- On timeout / network error / 5xx / 504 / unparsable response, the identical request (same key, same body) is replayed
  with bounded retries (1 + 3 sends, 1 s / 2 s / 4 s backoff). A 429 waits `retryAfterMs`/`Retry-After` (≤30 s, ≤5 waits).
- If retries are exhausted the state is "unknown": the UI makes no assumption, blocks new claims, and offers
  "Check again" (same key, same body). A new key is never generated for the same attempt.
- 400/401/404/409 are definitive rejections (nothing created): the attempt is cleared and the error shown.
- After a reload an unresolved attempt is resumed automatically (same mechanism) and tracking continues.
- Status: poll `GET /claims/{id}` every 2 s (5 s after 60 s) until `completed`/`failed`; transient poll errors never stop it.
- The stored attempt is tagged with a non-cryptographic hash of the token so it is only resumed with the same token.

**Architecture.** Small: pure logic in `src/lib` (unit-tested without React), two hooks, four screens. No state library,
no router, no UI kit. Token is kept in `localStorage` (browser-only app); it is never logged or placed in URLs.

## Verification performed
- 56 unit tests (parsing, validation, fee, totals, claim-flow retry/replay/tracking, sync gate) – `npm test`.
- Manual browser runs at 390 px against the real API for token entry and 401 handling, and against the local mock for the
  balance → validation → confirm → submit → pending → completed/failed flow, lost response (504 after creation, replayed
  by key → exactly one claim), all-504 unknown state + "Check again", and reload-resume.
- Final production verification against the real API with a real token: see README / submission notes.

## AI collaboration
Built with Claude Code (Claude Sonnet 5.5) as a single main agent, no subagents. The human set requirements and made the
decisions (chose the server-authoritative approach; corrected me to follow the documented validation rules exactly, to
keep the token out of the chat/code, to bound retries with an identical key, not to infer reflection from `asOf`, and to
deploy via Netlify Drop). AI wrote the code and tests; the human reviews, enters the token and deploys. Transcripts:
`ai-logs/` (secrets redacted).

## Limitations / assumptions
- Docs give no rounding rule, no total-USD definition and no idempotency-key lifetime. Assumed: total = Σ available ×
  usdPrice, rounded half-up to cents for display; keys are replayed promptly. If a key had expired server-side, a very
  late replay could create the claim the user already confirmed once; this cannot be detected client-side.
- No endpoint lists claims, so an unknown outcome can only be reconciled by key replay (not by search).
- Validation uses the latest snapshot for `available`; a stale snapshot can briefly block/allow differently than the server.
- Token lives in `localStorage` (readable by any script on the origin); acceptable for this test app, not for production.
- Single claim at a time; no Activity history; no automated UI/e2e tests (logic is unit-tested, UI verified manually).
- The bundler/package versions are those scaffolded by `create-expo-app` (Expo SDK 58).
