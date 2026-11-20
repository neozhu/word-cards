import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { isIP } from 'node:net';

export function createSpeakAuthorization({ appId, appSecret, clientIp, trustProxy = false, authorize = fetch }) {
  return async (request, response) => {
    const send = (status, body) => {
      response.writeHead(status, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
      response.end(JSON.stringify(body));
    };
    if (request.method !== 'POST') {
      response.setHeader('Allow', 'POST');
      return send(405, { error: 'Use POST.' });
    }
    if (request.headers['sec-fetch-site'] === 'cross-site') {
      return send(403, { error: 'Cross-site requests are unavailable.' });
    }
    if (!appId || !appSecret) return send(503, { error: 'Speech scoring is not configured.' });

    const peerIp = request.socket.remoteAddress?.replace(/^::ffff:/, '');
    const rawForwarded = request.headers['x-real-ip'];
    const forwardedIp = typeof rawForwarded === 'string'
      ? rawForwarded.trim().replace(/^::ffff:/, '')
      : undefined;
    const ip = clientIp || (trustProxy && forwardedIp ? forwardedIp : peerIp);
    if (!ip || !isIP(ip)) return send(400, { error: 'Client address is unavailable.' });

    const userId = randomUUID();
    const timestamp = Math.floor(Date.now() / 1000).toString();
    const signedFields = `app_secret=${appSecret}&appid=${appId}&timestamp=${timestamp}&user_client_ip=${ip}&user_id=${userId}`;
    const form = new FormData();
    form.set('appid', appId);
    form.set('timestamp', timestamp);
    form.set('user_id', userId);
    form.set('user_client_ip', ip);
    form.set('request_sign', createHash('md5').update(signedFields).digest('hex'));
    form.set('warrant_available', '300');

    try {
      const upstream = await authorize('https://api.cloud.ssapi.cn/auth/authorize', {
        method: 'POST',
        body: form,
        signal: AbortSignal.timeout(8000),
      });
      const result = await upstream.json();
      const warrantId = result?.data?.warrant_id;
      if (!upstream.ok || result?.code !== 0 || typeof warrantId !== 'string' || !warrantId) {
        console.error(`Speech auth upstream rejected: status=${upstream.status} code=${result?.code ?? 'unknown'}`);
        return send(502, { error: 'Speech scoring authorization failed.' });
      }
      return send(200, { applicationId: appId, userId, warrantId });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      console.error(`Speech auth upstream request error: ${message}`);
      return send(502, { error: 'Speech scoring authorization failed.' });
    }
  };
}

if (import.meta.main) {
  const authorize = createSpeakAuthorization({
    appId: process.env.SPEAK_APP_ID,
    appSecret: process.env.SPEAK_APP_SECRET,
    trustProxy: true,
  });
  createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    if (pathname === '/api/speak/authorize') return authorize(request, response);
    response.writeHead(404).end();
  }).listen(Number(process.env.SPEAK_AUTH_PORT || 4318), '127.0.0.1');
}
