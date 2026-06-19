import { checkAndConsumeRateLimit } from './db.js';

const RATE = Number(process.env.RATE_LIMIT_PER_MIN || 5);
const WINDOW_MS = 60_000;

export function checkAndConsume(userId, nowMs = Date.now()) {
  const row = checkAndConsumeRateLimit(userId, RATE, WINDOW_MS, nowMs);
  const ok = row.count <= RATE;
  const resetMs = row.window_start + WINDOW_MS;
  const remaining = Math.max(RATE - row.count, 0);
  return { ok, remaining, resetMs };
}
