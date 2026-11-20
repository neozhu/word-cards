import assert from 'node:assert/strict';
import { once } from 'node:events';
import { createServer } from 'node:http';
import test from 'node:test';
import { createPronunciationPlayer } from './pronunciation';

test('plays words and sentences with LRU cache, queues spelling, and recovers from playback errors', async () => {
  let received: unknown;
  let fetchCount = 0;
  let fail = false;
  const server = createServer((request, response) => {
    assert.equal(request.url, '/api/speech');
    assert.equal(request.method, 'POST');
    fetchCount += 1;
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
    onerror: (() => void) | null = null;
    async play() { played.push(this); }
    pause() { this.paused = true; }
  }
  globalThis.fetch = (input, init) =>
    originalFetch(new URL(String(input), `http://127.0.0.1:${address.port}`), init);
  Object.defineProperty(globalThis, 'Audio', { value: FakeAudio, configurable: true });

  const waitForPlayed = async (count: number) => {
    const deadline = Date.now() + 3000;
    while (played.length < count && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 10));
    }
    assert.equal(played.length, count);
  };

  const player = createPronunciationPlayer();
  try {
    // play() resolves only after audio finishes playing
    let firstDone = false;
    const firstPlay = player.play('Tiger').then(() => { firstDone = true; });
    await waitForPlayed(1);
    assert.deepEqual(received, {
      input: 'Tiger',
      model: 'tts-1',
      voice: 'af_heart',
      speed: 1,
      response_format: 'wav',
    });
    assert.equal(firstDone, false);
    played[0].onended?.();
    await firstPlay;
    assert.equal(firstDone, true);
    assert.equal(fetchCount, 1);

    // Repeated play() of the same text uses the in-memory LRU cache without another fetch
    const cachedPlay = player.play('Tiger');
    await waitForPlayed(2);
    assert.equal(fetchCount, 1);
    played[1].onended?.();
    await cachedPlay;

    // Starting a new play() interrupts active audio cleanly
    const sentence = 'a striped tiger. The striped tiger walks softly through the tall grass.';
    const interruptedPlay = player.play(sentence);
    await waitForPlayed(3);
    assert.equal((received as { input: string }).input, sentence);
    assert.equal(fetchCount, 2);

    // Enqueuing spelling letters interrupts previous play() and plays sequentially
    const firstLetter = player.enqueue('T');
    const lastLetter = player.enqueue('R. Tiger');
    await interruptedPlay;
    assert.equal(played[2].paused, true);
    await waitForPlayed(4);
    assert.equal((received as { input: string }).input, 'T');

    // Playback error on one queued letter rejects its promise without hanging subsequent letters
    played[3].onerror?.();
    await assert.rejects(firstLetter, /playback failed/i);

    await waitForPlayed(5);
    assert.equal((received as { input: string }).input, 'R. Tiger');
    played[4].onended?.();
    await lastLetter;

    player.stop();
    fail = true;
    await assert.rejects(player.play('UncachedWord'));
  } finally {
    player.stop();
    globalThis.fetch = originalFetch;
    if (originalAudio) Object.defineProperty(globalThis, 'Audio', originalAudio);
    else Reflect.deleteProperty(globalThis, 'Audio');
    server.close();
    await once(server, 'close');
  }
});
