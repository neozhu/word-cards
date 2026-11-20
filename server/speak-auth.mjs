import { createHash, randomUUID } from 'node:crypto';
import { createServer } from 'node:http';
import { isIP } from 'node:net';
import { resolve } from 'node:path';
import { pathToFileURL } from 'node:url';

function normalizeIp(value) {
  if (typeof value !== 'string') return '';
  const cleaned = value.trim().replace(/^::ffff:/i, '');
  return isIP(cleaned) ? cleaned : '';
}

function isPrivateOrLocalIp(ip) {
  const version = isIP(ip);
  if (version === 4) {
    const [a, b] = ip.split('.').map(Number);
    return (
      a === 0 ||
      a === 10 ||
      a === 127 ||
      (a === 100 && b >= 64 && b <= 127) ||
      (a === 169 && b === 254) ||
      (a === 172 && b >= 16 && b <= 31) ||
      (a === 192 && b === 168)
    );
  }
  if (version === 6) {
    const lower = ip.toLowerCase();
    return (
      lower === '::1' ||
      lower === '::' ||
      /^f[cd][0-9a-f]{2}:/.test(lower) ||
      /^fe[89ab][0-9a-f]:/.test(lower)
    );
  }
  return true;
}

function resolveClientIp(request, trustProxy) {
  const peerIp = normalizeIp(request.socket?.remoteAddress);
  if (!trustProxy) {
    return peerIp;
  }

  const candidates = [];
  const pushHeader = (headerValue, splitList = false) => {
    if (!headerValue) return;
    const raw = Array.isArray(headerValue) ? headerValue.join(',') : headerValue;
    const parts = splitList ? raw.split(',') : [raw];
    for (const part of parts) {
      const ip = normalizeIp(part);
      if (ip) candidates.push(ip);
    }
  };

  pushHeader(request.headers['cf-connecting-ip']);
  pushHeader(request.headers['true-client-ip']);
  pushHeader(request.headers['x-forwarded-for'], true);
  pushHeader(request.headers['x-real-ip']);
  if (peerIp) candidates.push(peerIp);

  return candidates.find((ip) => !isPrivateOrLocalIp(ip)) ?? candidates[0] ?? '';
}

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

    const ip = normalizeIp(clientIp) || resolveClientIp(request, trustProxy);
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

const isMain = Boolean(
  import.meta.main ||
  (process.argv[1] && pathToFileURL(resolve(process.argv[1])).href === import.meta.url)
);

if (isMain) {
  const authorize = createSpeakAuthorization({
    appId: process.env.SPEAK_APP_ID,
    appSecret: process.env.SPEAK_APP_SECRET,
    clientIp: process.env.SPEAK_LOCAL_CLIENT_IP || undefined,
    trustProxy: true,
  });
  createServer((request, response) => {
    const pathname = new URL(request.url ?? '/', 'http://127.0.0.1').pathname;
    if (pathname === '/api/speak/authorize') return authorize(request, response);
    response.writeHead(404).end();
  }).listen(Number(process.env.SPEAK_AUTH_PORT || 4318), '127.0.0.1');
}
