import fs from 'node:fs';
import path from 'node:path';
import test from 'node:test';
import assert from 'node:assert/strict';
import { CATEGORIES, VOCAB_CARDS } from '../data/vocabData';
import {
  buildQuizQuestion,
  clearCategoryMasteredIds,
  filterCardsByCategory,
  filterStudyDeck,
  getMasteryProgress,
  getSpellableLetters,
  getWrappedIndex,
  shuffleDeck,
  stepSpellingProgress,
  toggleMasteredId,
} from './deckLogic';

test('filterCardsByCategory returns all cards for "all" and narrows for specific categories', () => {
  assert.equal(filterCardsByCategory(VOCAB_CARDS, 'all').length, 40);
  const animals = filterCardsByCategory(VOCAB_CARDS, 'animals');
  assert.equal(animals.length, 10);
  assert.ok(animals.every((c) => c.category === 'animals'));

  const vehicles = filterCardsByCategory(VOCAB_CARDS, 'vehicles');
  assert.equal(vehicles.length, 10);
  assert.ok(vehicles.every((c) => c.category === 'vehicles'));
});

test('getWrappedIndex wraps forward and backward safely', () => {
  assert.equal(getWrappedIndex(0, 1, 10), 1);
  assert.equal(getWrappedIndex(9, 1, 10), 0);
  assert.equal(getWrappedIndex(0, -1, 10), 9);
  assert.equal(getWrappedIndex(3, -5, 10), 8);
  assert.equal(getWrappedIndex(0, 1, 0), 0);
});

test('shuffleDeck preserves all elements without mutating source', () => {
  const input = [1, 2, 3, 4, 5];
  let seed = 0.25;
  const deterministicRng = () => {
    seed = (seed * 9301 + 49297) % 233280;
    return seed / 233280;
  };
  const shuffled = shuffleDeck(input, deterministicRng);
  assert.deepEqual(input, [1, 2, 3, 4, 5]);
  assert.equal(shuffled.length, input.length);
  assert.deepEqual([...shuffled].sort((a, b) => a - b), input);
});

test('toggleMasteredId adds and removes IDs cleanly', () => {
  const added = toggleMasteredId([], 'ani-tiger');
  assert.deepEqual(added, ['ani-tiger']);
  const addedSecond = toggleMasteredId(added, 'fru-apple');
  assert.deepEqual(addedSecond, ['ani-tiger', 'fru-apple']);
  const removed = toggleMasteredId(addedSecond, 'ani-tiger');
  assert.deepEqual(removed, ['fru-apple']);
});

test('getMasteryProgress calculates exact percentage for category', () => {
  const fruits = filterCardsByCategory(VOCAB_CARDS, 'fruits');
  const stats = getMasteryProgress(fruits, ['fru-apple', 'fru-banana', 'ani-tiger']);
  assert.equal(stats.mastered, 2);
  assert.equal(stats.total, 10);
  assert.equal(stats.percent, 20);
});

test('buildQuizQuestion creates 4 unique options including the target', () => {
  const moods = filterCardsByCategory(VOCAB_CARDS, 'expressions');
  const q = buildQuizQuestion(moods, VOCAB_CARDS, moods[0].id, () => 0.42);
  assert.ok(q !== null);
  assert.notEqual(q.target.id, moods[0].id);
  assert.equal(q.options.length, 4);
  const ids = new Set(q.options.map((o) => o.id));
  assert.equal(ids.size, 4);
  assert.ok(ids.has(q.target.id));
});

test('all cards and categories are English-only with memory phrases and existing emoji PNG files', () => {
  const hanRegex = /\p{Script=Han}/u;
  for (const cat of CATEGORIES) {
    assert.ok(!hanRegex.test(cat.label), `Unexpected Chinese in category ${cat.id}`);
    const filePath = path.resolve(process.cwd(), cat.iconUrl.replace(/^\//, ''));
    assert.ok(fs.existsSync(filePath), `Missing category icon: ${cat.iconUrl}`);
  }
  for (const card of VOCAB_CARDS) {
    assert.ok(card.phrase.trim().length > 0, `Missing phrase on ${card.id}`);
    assert.ok(!hanRegex.test(card.word), `Unexpected Chinese in word ${card.id}`);
    assert.ok(!hanRegex.test(card.phrase), `Unexpected Chinese in phrase ${card.id}`);
    assert.ok(!hanRegex.test(card.sentence), `Unexpected Chinese in sentence ${card.id}`);
    const filePath = path.resolve(process.cwd(), card.iconUrl.replace(/^\//, ''));
    assert.ok(fs.existsSync(filePath), `Missing card icon: ${card.iconUrl}`);
  }
});

test('filterStudyDeck narrows to unlearned cards and clearCategoryMasteredIds only clears active category', () => {
  const mastered = ['ani-tiger', 'ani-elephant', 'fru-apple'];
  const unlearnedAnimals = filterStudyDeck(VOCAB_CARDS, 'animals', mastered, true);
  assert.equal(unlearnedAnimals.length, 8);
  assert.ok(!unlearnedAnimals.some((c) => c.id === 'ani-tiger' || c.id === 'ani-elephant'));

  const animalsPool = filterCardsByCategory(VOCAB_CARDS, 'animals');
  const cleared = clearCategoryMasteredIds(mastered, animalsPool);
  assert.deepEqual(cleared, ['fru-apple']);
});

test('getSpellableLetters and stepSpellingProgress guide sequential spelling and handle repeated letters', () => {
  const letters = getSpellableLetters('Fire Truck');
  assert.deepEqual(letters, ['F', 'I', 'R', 'E', 'T', 'R', 'U', 'C', 'K']);

  const appleLetters = getSpellableLetters('Apple');
  // Wrong tap does not advance
  assert.deepEqual(stepSpellingProgress(appleLetters, 0, 2), {
    nextStep: 0,
    matched: false,
    completed: false,
  });
  // Sequential A -> P (either P) -> P -> L -> E completes word
  let step = 0;
  step = stepSpellingProgress(appleLetters, step, 0).nextStep; // A -> 1
  step = stepSpellingProgress(appleLetters, step, 2).nextStep; // tapping 2nd P when 1st P expected still advances -> 2
  step = stepSpellingProgress(appleLetters, step, 2).nextStep; // 3
  step = stepSpellingProgress(appleLetters, step, 3).nextStep; // 4
  const finalResult = stepSpellingProgress(appleLetters, step, 4);
  assert.deepEqual(finalResult, {
    nextStep: 5,
    matched: true,
    completed: true,
  });

  // Tapping first letter after completion starts a clean replay
  assert.deepEqual(stepSpellingProgress(appleLetters, 5, 0), {
    nextStep: 1,
    matched: true,
    completed: false,
  });
});

