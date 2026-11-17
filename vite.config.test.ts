import assert from 'node:assert/strict';
import { createServer as createHttpServer } from 'node:http';
import { once } from 'node:events';
import test from 'node:test';
import { createServer as createViteServer } from 'vite';

test('local speech proxy sends requests and the server-side key to the speech service', async () => {
  let authorization: string | undefined;
  let requestPath: string | undefined;
  let requestBody = '';
  const upstream = createHttpServer((req, res) => {
    authorization = req.headers.authorization;
    requestPath = req.url;
    req.setEncoding('utf8');
    req.on('data', (chunk) => { requestBody += chunk; });
    req.on('end', () => {
      res.writeHead(200, { 'content-type': 'audio/wav' });
      res.end('test audio');
    });
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const address = upstream.address();
  assert.ok(address && typeof address !== 'string');

  process.env.TTS_API_URL = `http://127.0.0.1:${address.port}`;
  process.env.TTS_API_KEY = 'test-only-key';
  const vite = await createViteServer({
    configFile: 'vite.config.ts',
    server: { host: '127.0.0.1', port: 0, strictPort: true },
    logLevel: 'silent',
  });
  try {
    await vite.listen();
    const viteAddress = vite.httpServer?.address();
    assert.ok(viteAddress && typeof viteAddress !== 'string');
    const payload = { input: 'Hello', model: 'tts-1', voice: 'alloy', speed: 1, response_format: 'wav' };
    const response = await fetch(`http://127.0.0.1:${viteAddress.port}/api/speech`, {
      method: 'POST',
      headers: { 'content-type': 'application/json', authorization: 'Bearer browser-key' },
      body: JSON.stringify(payload),
    });
    assert.equal(response.status, 200);
    assert.equal(response.headers.get('content-type'), 'audio/wav');
    assert.equal(await response.text(), 'test audio');
    assert.equal(requestPath, '/v1/audio/speech');
    assert.equal(authorization, 'Bearer test-only-key');
    assert.deepEqual(JSON.parse(requestBody), payload);
  } finally {
    await vite.close();
    upstream.close();
    await once(upstream, 'close');
    delete process.env.TTS_API_URL;
    delete process.env.TTS_API_KEY;
  }
});
