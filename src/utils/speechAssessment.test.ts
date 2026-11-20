import assert from 'node:assert/strict';
import test from 'node:test';
import {
  AssessmentUnavailableError,
  createCredentialCache,
  getAssessment,
  getAssessmentRequest,
  getDemoAssessment,
} from './speechAssessment';

test('uses the child word and sentence models with their respective reference text', () => {
  assert.deepEqual(getAssessmentRequest({ kind: 'word', text: 'Tiger' }), {
    coreType: 'en.word_kid.score', refText: 'Tiger', rank: 100, attachAudioUrl: 0,
  });
  assert.deepEqual(getAssessmentRequest({ kind: 'sentence', text: 'The tiger walks.' }), {
    coreType: 'en.sent_kid.score', refText: 'The tiger walks.', rank: 100, attachAudioUrl: 0,
  });
});

test('grades cloud scores at the 65 and 85 point boundaries', () => {
  for (const [overall, grade] of [[0, 'retry'], [64, 'retry'], [65, 'good'], [84, 'good'], [85, 'great'], [100, 'great']] as const) {
    assert.deepEqual(getAssessment(JSON.stringify({ result: { overall } })), { score: overall, grade });
  }
});

test('demo scores use the recording duration to select one of three distinct ranges', () => {
  for (const [duration, minimum, maximum, grade] of [[649, 48, 61, 'retry'], [650, 72, 82, 'good'], [1149, 72, 82, 'good'], [1150, 88, 98, 'great']] as const) {
    assert.deepEqual(getDemoAssessment(duration, () => 0), { score: minimum, grade });
    assert.deepEqual(getDemoAssessment(duration, () => 0.999), { score: maximum, grade });
  }
});

test('rejects missing or invalid scores rather than treating them as low scores', () => {
  for (const result of [{ overall: null }, { overall: 101 }, { overall: '40' }, {}]) {
    assert.throws(() => getAssessment({ result }), /valid score/);
  }
});

test('caches authorization credentials within TTL, deduplicates concurrent requests, and refreshes after expiry', async () => {
  let time = 1_000_000;
  let calls = 0;
  const cache = createCredentialCache({
    now: () => time,
    ttlMs: 10_000,
    fetcher: async () => {
      calls += 1;
      return Response.json({
        applicationId: 'app',
        userId: `user-${calls}`,
        warrantId: `warrant-${calls}`,
      });
    },
  });

  const [a, b] = await Promise.all([cache.get(), cache.get()]);
  assert.equal(calls, 1);
  assert.equal(a.fromCache, false);
  assert.equal(b.fromCache, false);
  assert.equal(a.credentials.warrantId, 'warrant-1');

  time += 5_000;
  const c = await cache.get();
  assert.equal(calls, 1);
  assert.equal(c.fromCache, true);
  assert.equal(c.credentials.warrantId, 'warrant-1');

  time += 6_000;
  const d = await cache.get();
  assert.equal(calls, 2);
  assert.equal(d.fromCache, false);
  assert.equal(d.credentials.warrantId, 'warrant-2');
});

test('backs off repeated authorization requests after 404 or 503 unavailable responses', async () => {
  let time = 2_000_000;
  let calls = 0;
  let status = 503;
  const cache = createCredentialCache({
    now: () => time,
    unavailableBackoffMs: 30_000,
    fetcher: async () => {
      calls += 1;
      if (status !== 200) return new Response(null, { status });
      return Response.json({ applicationId: 'app', userId: 'u', warrantId: 'w' });
    },
  });

  await assert.rejects(() => cache.get(), AssessmentUnavailableError);
  assert.equal(calls, 1);

  time += 10_000;
  await assert.rejects(() => cache.get(), AssessmentUnavailableError);
  assert.equal(calls, 1);

  time += 25_000;
  status = 200;
  const ok = await cache.get();
  assert.equal(calls, 2);
  assert.equal(ok.credentials.warrantId, 'w');
});
