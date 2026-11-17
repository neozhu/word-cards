import { CategoryId, VocabCard } from '../data/vocabData';

/**
 * Filters vocabulary cards by category.
 */
export function filterCardsByCategory(
  cards: VocabCard[],
  category: CategoryId
): VocabCard[] {
  if (category === 'all') {
    return cards;
  }
  return cards.filter((card) => card.category === category);
}

/**
 * Filters cards by category and optionally narrows to unlearned (unstarred) cards.
 */
export function filterStudyDeck(
  cards: VocabCard[],
  category: CategoryId,
  masteredIds: readonly string[],
  onlyUnlearned: boolean
): VocabCard[] {
  const byCategory = filterCardsByCategory(cards, category);
  if (!onlyUnlearned) {
    return byCategory;
  }
  const masteredSet = new Set(masteredIds);
  return byCategory.filter((card) => !masteredSet.has(card.id));
}

/**
 * Removes mastered IDs belonging to a specific category pool while preserving others.
 */
export function clearCategoryMasteredIds(
  masteredIds: readonly string[],
  categoryCards: readonly VocabCard[]
): string[] {
  const categoryIds = new Set(categoryCards.map((c) => c.id));
  return masteredIds.filter((id) => !categoryIds.has(id));
}

/**
 * Returns uppercase spellable letters of a word (stripping whitespace).
 */
export function getSpellableLetters(word: string): string[] {
  return word
    .replace(/\s+/g, '')
    .toUpperCase()
    .split('');
}

export interface SpellingStepResult {
  nextStep: number;
  matched: boolean;
  completed: boolean;
}

/**
 * Advances sequential spelling progress when tapping a letter tile.
 * Allows tapping duplicate matching characters (e.g. either 'P' in APPLE) and replays cleanly after completion.
 */
export function stepSpellingProgress(
  letters: readonly string[],
  currentStep: number,
  tappedIndex: number
): SpellingStepResult {
  if (letters.length === 0 || tappedIndex < 0 || tappedIndex >= letters.length) {
    return { nextStep: 0, matched: false, completed: false };
  }

  const effectiveStep = currentStep >= letters.length ? 0 : currentStep;
  const expectedChar = letters[effectiveStep];
  const tappedChar = letters[tappedIndex];
  const matched = tappedIndex === effectiveStep || tappedChar === expectedChar;

  if (!matched) {
    return {
      nextStep: effectiveStep,
      matched: false,
      completed: false,
    };
  }

  const nextStep = effectiveStep + 1;
  return {
    nextStep,
    matched: true,
    completed: nextStep >= letters.length,
  };
}

/**
 * Advances or rewinds card index with wrap-around safety.
 */
export function getWrappedIndex(
  currentIndex: number,
  delta: number,
  total: number
): number {
  if (total <= 0) {
    return 0;
  }
  const normalized = (currentIndex + delta) % total;
  return normalized < 0 ? normalized + total : normalized;
}

/**
 * Pure Fisher-Yates shuffle returning a new array without mutating input.
 * Accepts an optional RNG for deterministic testing.
 */
export function shuffleDeck<T>(
  items: readonly T[],
  rng: () => number = Math.random
): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const temp = copy[i];
    copy[i] = copy[j];
    copy[j] = temp;
  }
  return copy;
}

/**
 * Toggles a card ID in the mastered set, returning a new array for clean persistence.
 */
export function toggleMasteredId(
  masteredIds: readonly string[],
  cardId: string
): string[] {
  if (masteredIds.includes(cardId)) {
    return masteredIds.filter((id) => id !== cardId);
  }
  return [...masteredIds, cardId];
}

/**
 * Computes mastery stats for a given subset of cards.
 */
export function getMasteryProgress(
  cards: readonly VocabCard[],
  masteredIds: readonly string[]
): { mastered: number; total: number; percent: number } {
  const total = cards.length;
  if (total === 0) {
    return { mastered: 0, total: 0, percent: 0 };
  }
  const masteredSet = new Set(masteredIds);
  const mastered = cards.filter((c) => masteredSet.has(c.id)).length;
  return {
    mastered,
    total,
    percent: Math.round((mastered / total) * 100),
  };
}

export interface QuizQuestion {
  target: VocabCard;
  options: VocabCard[];
}

/**
 * Builds a 4-option emoji quiz round from the current pool (falling back to allCards if pool < 4).
 */
export function buildQuizQuestion(
  pool: readonly VocabCard[],
  allCards: readonly VocabCard[],
  previousTargetId?: string,
  rng: () => number = Math.random
): QuizQuestion | null {
  if (pool.length === 0) {
    return null;
  }

  const candidates =
    pool.length > 1 && previousTargetId
      ? pool.filter((c) => c.id !== previousTargetId)
      : [...pool];

  const target = candidates[Math.floor(rng() * candidates.length)];

  const distractorPool = (pool.length >= 4 ? pool : allCards).filter(
    (c) => c.id !== target.id
  );
  const distractors = shuffleDeck(distractorPool, rng).slice(0, 3);
  const options = shuffleDeck([target, ...distractors], rng);

  return { target, options };
}
