// Local mock of the CashMine task API for UI testing without a real token. Not used in production.
// Modes (env MODE): normal | lose-first (first POST creates the claim but replies 504) | always-504 | dead-504 (every POST 504s, nothing created)
import http from 'node:http';

const MODE = process.env.MODE ?? 'normal';
const claims = new Map(); // id -> claim
const keys = new Map(); // idempotency key -> { body, id }
let available = 820.5;
let n = 0;
// Realistic snapshots: recomputed only every 15 s. FAIL503=1 makes balances return 503 for 12 s after a claim settles.
let snap = null;
let failUntil = 0;

const send = (res, status, json, headers = {}) => {
  res.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': '*',
    'Access-Control-Expose-Headers': 'Idempotent-Replayed',
    ...headers,
  });
  res.end(JSON.stringify(json));
};

http
  .createServer((req, res) => {
    if (req.method === 'OPTIONS') return send(res, 204, {});
    if (req.headers.authorization !== 'Bearer mock-token') {
      return send(res, 401, { error: { code: 'UNAUTHORIZED', message: 'Invalid token' } });
    }
    const url = new URL(req.url, 'http://x');
    if (url.pathname === '/v1/balances') {
      if (Date.now() < failUntil) return send(res, 503, { error: { code: 'SERVER', message: 'Temporary server error' } });
      if (!snap || Date.now() - snap.t > 15000) {
        const claiming = [...claims.values()].filter((c) => c.status === 'pending').reduce((s, c) => s + Number(c.amount), 0);
        snap = {
          t: Date.now(),
          body: {
            asOf: new Date().toISOString(),
            items: [
              { asset: 'USDT', decimals: 6, available: available.toFixed(6), pending: '50.12', claiming: String(claiming), usdPrice: '1.0002' },
              { asset: 'ETH', decimals: 18, available: '1.25', pending: '0', claiming: '0', usdPrice: '3200.5' },
            ],
          },
        };
      }
      return send(res, 200, snap.body);
    }
    if (url.pathname === '/v1/claim-options') {
      return send(res, 200, {
        asset: url.searchParams.get('asset'),
        minAmount: '0.01',
        fee: '0.0012',
        destinations: [{ id: 'dest_wallet', label: 'Wallet 0x8f3e…a91c' }],
      });
    }
    if (url.pathname === '/v1/claims' && req.method === 'POST') {
      let raw = '';
      req.on('data', (c) => (raw += c));
      req.on('end', () => {
        if (MODE === 'dead-504') return send(res, 504, { error: { code: 'TIMEOUT', message: 'Timed out' } });
        const key = req.headers['idempotency-key'];
        const body = JSON.parse(raw);
        const prior = keys.get(key);
        if (prior) {
          if (JSON.stringify(prior.body) !== JSON.stringify(body)) {
            return send(res, 409, { error: { code: 'IDEMPOTENCY_MISMATCH', message: 'Key reused with different body' } });
          }
          return send(res, 200, claims.get(prior.id), { 'Idempotent-Replayed': 'true' });
        }
        const amount = Number(body.amount);
        if (amount > available) return send(res, 400, { error: { code: 'VALIDATION', message: 'Insufficient balance', field: 'amount' } });
        const id = `clm_${++n}`;
        const claim = {
          id, asset: body.asset, amount: body.amount, fee: '0.0012',
          receiveAmount: (amount - 0.0012).toFixed(4), destinationId: body.destinationId,
          status: 'pending', failureReason: null, createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(),
        };
        claims.set(id, claim);
        keys.set(key, { body, id });
        available -= amount;
        setTimeout(() => {
          claim.status = amount === 13 ? 'failed' : 'completed';
          claim.updatedAt = new Date().toISOString();
          if (process.env.FAIL503) failUntil = Date.now() + 12000;
          if (claim.status === 'failed') {
            claim.failureReason = 'Destination rejected the transfer';
            available += amount;
          }
        }, 8000);
        if (MODE === 'always-504' || (MODE === 'lose-first' && keys.size === 1 && !globalThis.__lost)) {
          globalThis.__lost = true;
          return send(res, 504, { error: { code: 'TIMEOUT', message: 'Timed out' } });
        }
        send(res, 201, claim);
      });
      return;
    }
    const m = url.pathname.match(/^\/v1\/claims\/(.+)$/);
    if (m) return claims.has(m[1]) ? send(res, 200, claims.get(m[1])) : send(res, 404, { error: { code: 'NOT_FOUND', message: 'Unknown id' } });
    send(res, 404, { error: { code: 'NOT_FOUND', message: 'Unknown endpoint' } });
  })
  .listen(8787, () => console.log(`mock api on :8787 mode=${MODE}`));
