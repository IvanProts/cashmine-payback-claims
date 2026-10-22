# CashMine Payback Claims

Mobile-first Expo + React Native (web) + TypeScript app for viewing crypto payback balances and submitting claims
against the CashMine task API (<https://task-api.cashmine.io/docs>).

**Live URL:** _TO BE FILLED AFTER DEPLOYMENT_

## Functionality

- **Token entry** on first open; stored in browser `localStorage`; "Token" button to change or forget it. No token is
  in the source or the build.
- **Balances** per asset (`available`, `pending`, `claiming`), USD total of the claimable (`available`) amounts,
  snapshot freshness (`asOf` + age), loading / error / retry / refresh states, 401 handling.
- **Claim**: asset + destination selection, amount input with Max, live validation using the documented API rules,
  fee / received preview, confirmation step, submission with an `Idempotency-Key`, and status tracking
  (`pending` → `completed` / `failed`, with `failureReason`) via `GET /v1/claims/{id}`.
- **Safe submission**: attempt (key + exact body) is persisted before sending; unknown outcomes are resolved by
  replaying the identical request with the same key; in-flight claims survive page reloads.
- Not implemented: Activity history (optional in the brief).

## Setup

```bash
npm install
npm run web          # dev server
npm test             # unit tests (vitest)
npm run typecheck
npm run build        # static export to dist/ (deployable on any static host, e.g. Netlify Drop)
```

Requires Node 20+. The app talks directly to `https://task-api.cashmine.io` (CORS is open). Enter your own token in the
browser on first open.

### Local testing without a real token

`scripts/mock-api.mjs` is a small mock of the API (token `mock-token`) with failure modes:

```bash
MODE=lose-first node scripts/mock-api.mjs      # also: normal | always-504 | dead-504
EXPO_PUBLIC_API_BASE=http://localhost:8787 npm run web
```

## Structure

```
App.tsx                      token gate + main layout
src/lib/money.ts             decimal.js helpers: validation, fee preview, USD totals
src/lib/api.ts               fetch client, typed errors, response parsing
src/lib/claimFlow.ts         idempotent send/replay + status polling (pure, unit-tested)
src/lib/storage.ts           localStorage wrapper
src/useBalances.ts           balances hook (server-authoritative)
src/useClaimAttempt.ts       persisted claim attempt hook
src/screens/                 Token, Balances, Claim, ClaimStatus
```

See [NOTES.md](NOTES.md) for engineering decisions, AI collaboration and limitations; AI conversation exports are in
[ai-logs/](ai-logs/).
