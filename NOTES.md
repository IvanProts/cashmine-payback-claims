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

**Claim form state (decisions in `src/lib/claimForm.ts`, unit-tested).** After a claim *completes* the typed amount is
cleared (it was consumed), so it can't be re-validated against the new, lower balance; the completed claim card stays. After a
*failed* claim the amount and destination are kept so the user can retry (destination can be changed); the amount is held
even if the snapshot still shows 0 until the funds return, and released as soon as the user edits it or switches asset. If
nothing is claimable (available is 0 or below `minAmount`) the form is replaced by an explanatory empty state (with pending /
claiming context) and Review is disabled instead of showing validation errors. Switching asset clears the amount and ignores
options that belong to the previous asset. "Use max" is disabled while balances are syncing (the snapshot may be stale). The
failure line shows the server's `failureReason` once, adding our "returns to your available balance" sentence only if the
reason does not already say so. These are UI-state rules only; API calls and claim/idempotency logic are unchanged.

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

**Reads vs. the claim POST.** `GET` requests (balances, claim options, claim status) retry transient failures in the API
layer (`src/lib/retry.ts`): network errors and 500/502/503/504 get up to 2 retries (0.4 s, 1 s); a 429 waits exactly the
server's `retryAfterMs` / `Retry-After` (never sooner; if it asks for more than 10 s the error is surfaced instead);
400/401/404/409 are never retried. Only after the retries fail does the UI show the error with a manual Retry. `POST
/v1/claims` is deliberately NOT retried here: its only safe retry is the same-key replay in `claimFlow.ts`.
(Found while investigating a first-open "Service temporarily unavailable": one request per screen open, no duplicates; the
cause was a single transient 503 with no retry. The options loader also now ignores stale responses after an asset switch.)

**Activity (read-only).** `GET /v1/activity?limit=20&cursor=…` (limit 1–20; `nextCursor` is an opaque string, null on the
last page), newest first. We always request 20, pass `nextCursor` back URL-encoded, append pages with de-duplication by id
and show "Load more" only while `nextCursor` is non-null. Activity amounts are *signed* strings (negative for reversals and
claims), so they use their own strict signed-decimal parser (`src/lib/activity.ts`) instead of loosening the unsigned one
used for balances; display is exact (`Decimal`), with an explicit sign. Unknown types/statuses are shown generically. It is
independent of balances and claims: a failed later page keeps the loaded rows and offers Retry; a refresh supersedes any
in-flight page request. The list reloads when the tab is opened or "Refresh" is pressed (it is not live-updated).

**Architecture.** Small: pure logic in `src/lib` (unit-tested without React), three data hooks (balances, claim attempt, activity), five screens/views (token, balances, claim, claim status, activity). No state library,
no router, no UI kit. Token is kept in `localStorage` (browser-only app); it is never logged or placed in URLs.

## Verification performed
- 103 unit tests (parsing, validation, fee, totals, claim-flow retry/replay/tracking, sync gate) – `npm test`.
- Manual browser runs at 390 px against the real API for token entry and 401 handling, and against the local mock for the
  balance → validation → confirm → submit → pending → completed/failed flow, lost response (504 after creation, replayed
  by key → exactly one claim), all-504 unknown state + "Check again", and reload-resume.
- Real-token testing on the live deployment was done by the author with their own token; the assistant never had access
  to it (it was never pasted into the conversation, code, logs or build). Real claims against the API (one completed, one
  failed) exposed two UI-state bugs (stale amount after completion, repeated failure text), fixed with tests in the last commit.
- The final bundle served by the live URL is the one built from the final commit's app code (checked by bundle hash).

## AI collaboration
**Setup.** One main agent (Claude Code, Claude Sonnet 5.5), no subagents. The AI wrote code, tests, mocks and docs; the
human set requirements, made the decisions below, deployed (Netlify Drop) and tests the live app with their own token. Full redacted
transcripts are in `ai-logs/` (see `ai-logs/README.md`); the examples below point to where to find them.

**Example 1: AI proposes options, human decides (post-claim balance).** Before any claim code, I asked for at least two
approaches. The AI laid out (A) optimistic balance update vs (B) server-authoritative balances plus a separate pending-claim
state, with trade-offs for duplicate-claim risk, rollback after failure/timeout and user trust, and recommended B because
snapshots lag up to 15 s and an unknown outcome makes rollback undecidable. The human confirmed B and tightened it with
corrections that changed the implementation: follow the documented validation rules exactly (no silent `amount > fee`
rule; extras are listed as product safeguards above), bound retries and always reuse the same idempotency key + body,
treat `GET /claims/{id}` as authoritative and never infer reflection from `asOf` alone, and keep the token out of the chat.
(ai-logs: "Decision: balance after claim submission", then "Decision confirmed: B".)

**Example 2: AI mistake caught by verification, not by the unit tests.** After a user report of a first-open "Service
temporarily unavailable" on the claim screen, the AI diagnosed the cause (one request per open, no duplicates; GETs had no
retry) and added a retry layer with 429 `retryAfterMs` support; 71 tests passed. A browser run against the mock still showed a
single request: the AI's edit script had updated the screen but never wrote `api.ts`, so the new retry module was tested in
isolation but not wired in. The AI found this by checking the served bundle and the request log, fixed it, and added tests that
go through the real `getClaimOptions`/`getBalances`/`createClaim` with a stubbed `fetch` (including "POST is never retried").
Lesson recorded: assert wiring, and verify behaviour in the running app, not only unit tests.

**Example 3: human review finds gaps in AI output (stale balances).** The human noticed a claim showing "Completed" while a
stale snapshot still showed it under "Claiming" (with the balance refresh returning 503). The AI designed a balance-sync gate
(pause only *new* claims until a successful fetch returns a snapshot newer than the settlement). The human then spotted that
the gate lived only in memory, so a reload would bypass it. The AI persisted it (timestamps/ids only, tagged per token,
stored as closed once reconciled, 5-minute safety release) and added tests for reload during syncing, a 503 refresh, a stale
cached snapshot, successful reconciliation and token change; the reload path was re-checked in the browser.

**Also used AI for:** a local mock API (`scripts/mock-api.mjs`) to rehearse failure modes the real API can only produce
occasionally (504 after the claim was created, permanent 504, 503/429 on reads, failed claims, paginated activity); a UI
redesign (presentation only); and the redaction script for these logs (`scripts/export-ai-log.py`).

**What I verified myself rather than trusting AI output:** the API facts (re-read from the docs before the Activity work:
cursor format, signed amounts), the idempotency behaviour (one claim after a lost response), the 390 px layout, and the live
deployment.

## Limitations / assumptions
- Docs give no rounding rule, no total-USD definition and no idempotency-key lifetime. Assumed: total = Σ available ×
  usdPrice, rounded half-up to cents for display; keys are replayed promptly. If a key had expired server-side, a very
  late replay could create the claim the user already confirmed once; this cannot be detected client-side.
- No endpoint lists claims, so an unknown outcome can only be reconciled by key replay (not by search).
- Validation uses the latest snapshot for `available`; a stale snapshot can briefly block/allow differently than the server.
- Token lives in `localStorage` (readable by any script on the origin); acceptable for this test app, not for production.
- The claim form is in-memory UI state: leaving the Claim screen and coming back resets it (an in-flight or settled claim is persisted separately).
- Single claim at a time; Activity is not live-updated and has no filters; no automated UI/e2e tests (logic is unit-tested, UI verified manually).
- The bundler/package versions are those scaffolded by `create-expo-app` (Expo SDK 58).
