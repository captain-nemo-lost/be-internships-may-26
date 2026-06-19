import test from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { setTimeout as wait } from 'node:timers/promises';
import http from 'node:http';

test('rate limit: handles concurrent bursts safely', async () => {
  const proc = spawn('node', ['src/server.js'], { env: { ...process.env, API_KEY: 'k', PORT: '9092', RATE_LIMIT_PER_MIN: '5' } });
  await wait(300);

  const base = 'http://127.0.0.1:9092';
  const statuses = [];
  const promises = [];
  for (let i=0; i<20; i++){
    promises.push(postStatus(`${base}/v1/signals`, {
      headers: { 'x-api-key': 'k' },
      body: { userId: 'burst-user', type: 'note', payload: String(i) }
    }).then(code => statuses.push(code)));
  }
  await Promise.all(promises);

  const counts = statuses.reduce((acc,c)=> (acc[c]=(acc[c]||0)+1, acc), {});
  assert.equal(counts[200], 5, 'exactly 5 requests should succeed under concurrent burst');
  assert.equal(counts[429], 15, 'exactly 15 requests should be rate limited under concurrent burst');
  proc.kill();
});

async function postStatus(url, { headers, body }){
  return new Promise((resolve, reject) => {
    const data = JSON.stringify(body);
    const req = http.request(url, { method: 'POST', headers: { 'content-type': 'application/json', ...headers } }, (res) => {
      res.resume();
      res.on('end', () => resolve(res.statusCode));
    });
    req.on('error', reject);
    req.write(data); req.end();
  });
}
