import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import http from 'node:http';

test('idempotency returns same resource for concurrent requests', async () => {
  const proc = spawn('node', ['src/server.js'], { env: { ...process.env, API_KEY: 'k', PORT: '9091', RATE_LIMIT_PER_MIN: '100' } });
  await wait(300);

  const base = 'http://127.0.0.1:9091';
  const idem = 'concurrent-key';

  const promises = [];
  for (let i = 0; i < 20; i++) {
    promises.push(postJson(`${base}/v1/signals`, {
      headers: { 'x-api-key': 'k', 'Idempotency-Key': idem },
      body: { userId: 'u1', type: 'note', payload: 'x' }
    }));
  }

  const results = await Promise.all(promises);
  
  const first = results[0];
  assert.ok(first.id, 'Should return an ID');
  
  for (const r of results) {
    assert.equal(r.id, first.id, 'All concurrent requests must return the exact same resource ID');
    assert.equal(r.idempotencyKey, first.idempotencyKey);
  }
  proc.kill();
});

async function postJson(url, { headers, body }){
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers } }, (res) => {
      let chunks=''; res.on('data', d => chunks+=d);
      res.on('end', () => resolve(JSON.parse(chunks||'{}')));
    });
    req.on('error', reject);
    req.write(data); req.end();
  });
}
