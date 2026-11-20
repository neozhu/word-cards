import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import { createSpeakAuthorization } from './speak-auth.mjs';

test('signs the Aliyun authorization form server-side and returns only browser credentials', async () => {
  const auth = createSpeakAuthorization({
    appId: 'test-app', appSecret: 'test-secret', clientIp: '203.0.113.42',
    async authorize(url, options) {
      assert.equal(url, 'https://api.cloud.ssapi.cn/auth/authorize');
      assert.equal(options.method, 'POST');
      const { appid, timestamp, user_id, user_client_ip, request_sign, warrant_available } = Object.fromEntries(options.body);
      assert.equal(appid, 'test-app');
      assert.match(user_id, /^[\da-f-]{36}$/);
      assert.equal(user_client_ip, '203.0.113.42');
      assert.equal(warrant_available, '300');
      assert.equal(options.body.has('app_secret'), false);
      const expected = createHash('md5').update(`app_secret=test-secret&appid=test-app&timestamp=${timestamp}&user_client_ip=203.0.113.42&user_id=${user_id}`).digest('hex');
      assert.equal(request_sign, expected);
      return Response.json({ code: 0, data: { warrant_id: 'test-warrant' } });
    },
  });
  const server = createServer(auth);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  try {
    const url = `http://127.0.0.1:${server.address().port}/api/speak/authorize`;
    assert.equal((await fetch(url)).status, 405);
    const response = await fetch(url, { method: 'POST' });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('cache-control'), 'no-store');
    const { userId, ...credentials } = await response.json();
    assert.match(userId, /^[\da-f-]{36}$/);
    assert.deepEqual(credentials, { applicationId: 'test-app', warrantId: 'test-warrant' });
  } finally {
    server.close();
    await once(server, 'close');
  }
});

test('sanitizes x-real-ip, enforces cross-site and credential checks, and reports upstream errors', async () => {
  let seenIp;
  let upstreamOk = true;
  const auth = createSpeakAuthorization({
    appId: 'test-app',
    appSecret: 'test-secret',
    trustProxy: true,
    async authorize(_url, options) {
      seenIp = Object.fromEntries(options.body).user_client_ip;
      if (!upstreamOk) {
        return Response.json({ code: 4001 }, { status: 400 });
      }
      return Response.json({ code: 0, data: { warrant_id: 'proxy-warrant' } });
    },
  });
  const unconfigured = createSpeakAuthorization({ appId: '', appSecret: '' });

  const server = createServer((req, res) => {
    if (req.url === '/unconfigured') return unconfigured(req, res);
    return auth(req, res);
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const origConsoleError = console.error;
  console.error = () => {};
  try {
    const base = `http://127.0.0.1:${server.address().port}`;
    const crossSite = await fetch(`${base}/api/speak/authorize`, {
      method: 'POST',
      headers: { 'sec-fetch-site': 'cross-site' },
    });
    assert.equal(crossSite.status, 403);

    const missingCreds = await fetch(`${base}/unconfigured`, { method: 'POST' });
    assert.equal(missingCreds.status, 503);

    const proxied = await fetch(`${base}/api/speak/authorize`, {
      method: 'POST',
      headers: { 'x-real-ip': '  ::ffff:198.51.100.7  ' },
    });
    assert.equal(proxied.status, 200);
    assert.equal(seenIp, '198.51.100.7');

    upstreamOk = false;
    const failed = await fetch(`${base}/api/speak/authorize`, {
      method: 'POST',
      headers: { 'x-real-ip': '198.51.100.7' },
    });
    assert.equal(failed.status, 502);
  } finally {
    console.error = origConsoleError;
    server.close();
    await once(server, 'close');
  }
});
