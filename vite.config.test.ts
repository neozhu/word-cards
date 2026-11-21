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

test('pronunciation proxy forwards multipart audio with the server-side OpenPronounce key', async () => {
  const upstreamRequests: Request[] = [];
  const upstream = createHttpServer(async (req, res) => {
    const chunks = [];
    for await (const chunk of req) chunks.push(chunk);
    const headers = new Headers();
    for (const [name, value] of Object.entries(req.headers)) {
      if (typeof value === 'string') headers.set(name, value);
    }
    upstreamRequests.push(new Request(new URL(req.url || '/', 'http://127.0.0.1'), {
      method: req.method,
      headers,
      body: new Uint8Array(Buffer.concat(chunks)),
    }));
    res.writeHead(200, { 'content-type': 'application/json' });
    res.end(JSON.stringify({ status: 'assessed', reliable: true, scores: { overall: 78 } }));
  });
  upstream.listen(0, '127.0.0.1');
  await once(upstream, 'listening');
  const address = upstream.address();
  assert.ok(address && typeof address !== 'string');
  const previousUrl = process.env.OPENPRONOUNCE_API_URL;
  const previousKey = process.env.OPENPRONOUNCE_API_KEY;
  process.env.OPENPRONOUNCE_API_URL = `http://127.0.0.1:${address.port}`;
  process.env.OPENPRONOUNCE_API_KEY = 'test-only-key';
  const vite = await createViteServer({
    configFile: 'vite.config.ts',
    server: { host: '127.0.0.1', port: 0, strictPort: true },
    logLevel: 'silent',
  });
  try {
    await vite.listen();
    const viteAddress = vite.httpServer?.address();
    assert.ok(viteAddress && typeof viteAddress !== 'string');
    const form = new FormData();
    form.set('audio', new Blob(['recording bytes'], { type: 'audio/ogg' }), 'word.ogg');
    form.set('text', 'apple');
    form.set('mode', 'word');
    const url = `http://127.0.0.1:${viteAddress.port}/api/speak/assess`;
    const crossSite = await fetch(url, {
      method: 'POST',
      headers: { 'sec-fetch-site': 'cross-site' },
      body: form,
    });
    assert.equal(crossSite.status, 404);
    assert.equal(upstreamRequests.length, 0);

    const response = await fetch(url, {
      method: 'POST',
      headers: { 'x-api-key': 'browser-key' },
      body: form,
    });
    assert.equal(response.status, 200);
    assert.deepEqual(await response.json(), { status: 'assessed', reliable: true, scores: { overall: 78 } });
    assert.equal(upstreamRequests.length, 1);
    const [upstreamRequest] = upstreamRequests;
    assert.equal(new URL(upstreamRequest.url).pathname, '/api/v1/assess');
    assert.equal(upstreamRequest.headers.get('x-api-key'), 'test-only-key');
    const uploaded = await upstreamRequest.formData();
    assert.equal(uploaded.get('text'), 'apple');
    assert.equal(uploaded.get('mode'), 'word');
    const audio = uploaded.get('audio');
    assert.ok(audio instanceof File);
    assert.equal(await audio.text(), 'recording bytes');
  } finally {
    await vite.close();
    upstream.close();
    await once(upstream, 'close');
    if (previousUrl === undefined) delete process.env.OPENPRONOUNCE_API_URL;
    else process.env.OPENPRONOUNCE_API_URL = previousUrl;
    if (previousKey === undefined) delete process.env.OPENPRONOUNCE_API_KEY;
    else process.env.OPENPRONOUNCE_API_KEY = previousKey;
  }
});
