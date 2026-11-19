import assert from 'node:assert/strict';
import test from 'node:test';
import { getAssessment, getAssessmentRequest } from './speechAssessment';

test('uses the child word and sentence models with their respective reference text', () => {
  assert.deepEqual(getAssessmentRequest({ kind: 'word', text: 'Tiger' }), {
    coreType: 'en.word_kid.score', refText: 'Tiger', rank: 100, attachAudioUrl: 1,
  });
  assert.deepEqual(getAssessmentRequest({ kind: 'sentence', text: 'The tiger walks.' }), {
    coreType: 'en.sent_kid.score', refText: 'The tiger walks.', rank: 100, attachAudioUrl: 1,
  });
});

test('grades the overall score and keeps the recording playable in all three bands', () => {
  for (const [overall, grade] of [[0, 'retry'], [59, 'retry'], [60, 'good'], [84, 'good'], [85, 'great'], [100, 'great']] as const) {
    const result = getAssessment(JSON.stringify({ applicationId: 'app123', recordId: 'record456', result: { overall } }));
    assert.deepEqual(result, { score: overall, grade, recordingUrl: 'https://files.cloud.ssapi.cn/app123/record456.mp3' });
  }
});

test('rejects missing or invalid scores rather than treating them as low scores', () => {
  for (const result of [{ overall: null }, { overall: 101 }, { overall: '40' }, {}]) {
    assert.throws(() => getAssessment({ result }), /valid score/);
  }
});
