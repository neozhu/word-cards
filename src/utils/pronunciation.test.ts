import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import { createPronunciationPlayer } from './pronunciation';

test('plays words and sentences, queues spelling, and reports speech service failures', async () => {
  let received: unknown;
  let fail = false;
  const server = createServer((request, response) => {
    assert.equal(request.url, '/api/speech');
    assert.equal(request.method, 'POST');
    let body = '';
    request.setEncoding('utf8');
    request.on('data', (chunk) => { body += chunk; });
    request.on('end', () => {
      received = JSON.parse(body);
      if (fail) {
        response.writeHead(503).end();
      } else {
        response.writeHead(200, { 'content-type': 'audio/wav' }).end('audio');
      }
    });
  });
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  const address = server.address();
  assert.ok(address && typeof address !== 'string');

  const originalFetch = globalThis.fetch;
  const originalAudio = Object.getOwnPropertyDescriptor(globalThis, 'Audio');
  const played: FakeAudio[] = [];
  class FakeAudio {
    paused = false;
    onended: (() => void) | null = null;
    async play() { played.push(this); }
    pause() { this.paused = true; }
  }
  globalThis.fetch = (input, init) =>
    originalFetch(new URL(String(input), `http://127.0.0.1:${address.port}`), init);
  Object.defineProperty(globalThis, 'Audio', { value: FakeAudio, configurable: true });

  const player = createPronunciationPlayer();
  try {
    await player.play('Tiger');
    assert.deepEqual(received, {
      input: 'Tiger',
      model: 'tts-1',
      voice: 'af_heart',
      speed: 1,
      response_format: 'wav',
    });
    assert.equal(played.length, 1);
    const sentence = 'a striped tiger. The striped tiger walks softly through the tall grass.';
    await player.play(sentence);
    assert.equal((received as { input: string }).input, sentence);
    assert.equal(played[0].paused, true);

    const firstLetter = player.enqueue('T');
    const lastLetter = player.enqueue('R. Tiger');
    const waitForPlayed = async (count: number) => {
      const deadline = Date.now() + 3000;
      while (played.length < count && Date.now() < deadline) {
        await new Promise((resolve) => setTimeout(resolve, 10));
      }
      assert.equal(played.length, count);
    };
    await waitForPlayed(3);
    assert.equal((received as { input: string }).input, 'T');
    played[2].onended?.();
    await firstLetter;
    await waitForPlayed(4);
    assert.equal((received as { input: string }).input, 'R. Tiger');
    played[3].onended?.();
    await lastLetter;

    player.stop();
    fail = true;
    await assert.rejects(player.play('Tiger'));
  } finally {
    player.stop();
    globalThis.fetch = originalFetch;
    if (originalAudio) Object.defineProperty(globalThis, 'Audio', originalAudio);
    else Reflect.deleteProperty(globalThis, 'Audio');
    server.close();
    await once(server, 'close');
  }
});
