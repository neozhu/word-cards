import assert from 'node:assert/strict';
import test from 'node:test';
import { assessSpeech, getAssessment, getDemoAssessment } from './speechAssessment';

test('uploads the recording with the reference text and card mode', async () => {
  const originalFetch = globalThis.fetch;
  globalThis.fetch = async (input, options) => {
    assert.equal(input, '/api/speak/assess');
    assert.equal(options?.method, 'POST');
    assert.ok(options?.body instanceof FormData);
    assert.equal(options.body.get('text'), 'The tiger walks.');
    assert.equal(options.body.get('mode'), 'sentence');
    const audio = options.body.get('audio');
    assert.ok(audio instanceof File);
    assert.equal(audio.name, 'recording.webm');
    assert.equal(audio.type, 'audio/webm');
    assert.equal(await audio.text(), 'recording bytes');
    return Response.json({ status: 'assessed', reliable: true, scores: { overall: 85.2 } });
  };
  try {
    const result = await assessSpeech(
      { kind: 'sentence', text: 'The tiger walks.' },
      new Blob(['recording bytes'], { type: 'audio/webm;codecs=opus' }),
      new AbortController().signal,
    );
    assert.deepEqual(result, { score: 85.2, grade: 'great' });
  } finally {
    globalThis.fetch = originalFetch;
  }
});

test('grades OpenPronounce scores at the 80 and 85 point boundaries', () => {
  for (const [overall, grade] of [[0, 'retry'], [79.9, 'retry'], [80, 'good'], [84.9, 'good'], [85, 'great'], [100, 'great']] as const) {
    assert.deepEqual(getAssessment({ status: 'assessed', reliable: true, scores: { overall } }), { score: overall, grade });
  }
});

test('distinguishes uncertain recordings from invalid scores', () => {
  assert.equal(getAssessment({ status: 'uncertain', reliable: false, scores: null }), null);
  for (const scores of [{ overall: null }, { overall: 101 }, { overall: '40' }, {}]) {
    assert.throws(() => getAssessment({ status: 'assessed', reliable: true, scores }), /valid score/);
  }
});

test('demo scores use the recording duration to select one of three distinct ranges', () => {
  for (const [duration, minimum, maximum, grade] of [[649, 48, 61, 'retry'], [650, 80, 84, 'good'], [1149, 80, 84, 'good'], [1150, 88, 98, 'great']] as const) {
    assert.deepEqual(getDemoAssessment(duration, () => 0), { score: minimum, grade });
    assert.deepEqual(getDemoAssessment(duration, () => 0.999), { score: maximum, grade });
  }
});
