import { insertSignal, getByIdemKey, listSignals } from './db.js';
import { checkAndConsume } from './rateLimit.js';

function nowMs(){ return Date.now(); }
const wait = (ms) => new Promise(r => setTimeout(r, ms));

async function withRetry(fn, maxRetries = 3) {
  let attempt = 0;
  while (true) {
    try {
      return fn();
    } catch (e) {
      if (e.code === 'SQLITE_BUSY' && attempt < maxRetries) {
        attempt++;
        const jitter = Math.random() * 50;
        await wait(50 * Math.pow(2, attempt) + jitter);
        continue;
      }
      throw e;
    }
  }
}

export async function postSignal(req, reply) {
  const idem = req.headers['idempotency-key'] || null;
  const { userId, type, payload } = req.body || {};
  if (!userId || !type || typeof payload === 'undefined') {
    return reply.code(400).send({ error: 'invalid_body' });
  }

  const { ok, remaining, resetMs } = checkAndConsume(userId, nowMs());
  if (!ok) return reply.code(429).send({ error: 'rate_limited', remaining, resetMs });

  const t = nowMs();
  try {
    const info = await withRetry(() => insertSignal(userId, type, payload, idem, t));
    return { id: info.lastInsertRowid, userId, type, payload: String(payload), idempotencyKey: idem, createdAt: t };
  } catch (e) {
    if (e.code === 'SQLITE_CONSTRAINT_UNIQUE' && idem) {
      try {
        const existing = await withRetry(() => getByIdemKey(idem));
        if (existing) return existing;
      } catch (innerErr) {
        req.log.error({ err: innerErr, ctx: 'getByIdemKey' });
        return reply.code(503).send({ error: 'db_unavailable' });
      }
    }
    req.log.error({ err: e, ctx: 'insertSignal' });
    return reply.code(503).send({ error: 'db_unavailable' });
  }
}

export async function getSignals(req, reply) {
  const { userId, limit = 20 } = req.query || {};
  if (!userId) return reply.code(400).send({ error: 'missing_userId' });
  const lim = Math.min(Number(limit) || 20, 100);
  try {
    const rows = await withRetry(() => listSignals(userId, lim));
    return { items: rows };
  } catch (e) {
    req.log.error({ err: e, ctx: 'listSignals' });
    return reply.code(503).send({ error: 'db_unavailable' });
  }
}
