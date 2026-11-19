import assert from 'node:assert/strict';
import test from 'node:test';
import { getAssessment, getAssessmentRequest, getDemoAssessment } from './speechAssessment';

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
