/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import {
  ChevronLeft,
  ChevronRight,
  Layers,
  RotateCcw,
  Shuffle,
  Sparkles,
  Star,
  Trophy,
  Volume2,
  VolumeX,
} from 'lucide-react';
import {
  CATEGORIES,
  CategoryId,
  VOCAB_CARDS,
  VocabCard,
} from './data/vocabData';
import {
  clearCategoryMasteredIds,
  filterCardsByCategory,
  filterStudyDeck,
  getMasteryProgress,
  getWrappedIndex,
  shuffleDeck,
  toggleMasteredId,
} from './utils/deckLogic';
import { soundEngine } from './utils/soundEngine';
import { BackdropScene } from './components/BackdropScene';
import { EmojiIcon } from './components/EmojiIcon';
import { FlashcardStage } from './components/FlashcardStage';
import { QuizStage } from './components/QuizStage';

type AppMode = 'cards' | 'quiz';

const STORAGE_KEY_MASTERED = 'wordpop_mastered_v1';

export default function App() {
  const [mode, setMode] = useState<AppMode>('cards');
  const [category, setCategory] = useState<CategoryId>('all');
  const [onlyUnlearned, setOnlyUnlearned] = useState(false);
  const [deck, setDeck] = useState<VocabCard[]>(() => VOCAB_CARDS);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [shuffleNonce, setShuffleNonce] = useState(0);
  const [isFlipped, setIsFlipped] = useState(false);
  const [milestoneBanner, setMilestoneBanner] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(() => soundEngine.isMuted());
  const [masteredIds, setMasteredIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY_MASTERED);
      if (!raw) return [];
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? parsed : [];
    } catch {
      return [];
    }
  });

  useEffect(() => {
    try {
      window.localStorage.setItem(
        STORAGE_KEY_MASTERED,
        JSON.stringify(masteredIds)
      );
    } catch {
      // Ignore storage quota errors
    }
  }, [masteredIds]);

  const activeCategoryMeta = useMemo(
    () => CATEGORIES.find((c) => c.id === category) ?? CATEGORIES[0],
    [category]
  );

  const activeCategoryPool = useMemo(
    () => filterCardsByCategory(VOCAB_CARDS, category),
    [category]
  );

  const mastery = useMemo(
    () => getMasteryProgress(activeCategoryPool, masteredIds),
    [activeCategoryPool, masteredIds]
  );

  const totalMastery = useMemo(
    () => getMasteryProgress(VOCAB_CARDS, masteredIds),
    [masteredIds]
  );

  // Trigger celebratory banner only when crossing into 100% mastery for current category
  const prevMasteredCountRef = useRef(mastery.mastered);
  const prevCategoryRef = useRef(category);
  useEffect(() => {
    if (prevCategoryRef.current !== category) {
      prevCategoryRef.current = category;
      prevMasteredCountRef.current = mastery.mastered;
      return;
    }
    if (
      mastery.total > 0 &&
      prevMasteredCountRef.current < mastery.total &&
      mastery.mastered === mastery.total
    ) {
      soundEngine.playMilestoneFanfare();
      setMilestoneBanner(
        category === 'all'
          ? `Superstar! All ${mastery.total} words learned!`
          : `Awesome! All ${mastery.total} ${activeCategoryMeta.label} learned!`
      );
    }
    prevMasteredCountRef.current = mastery.mastered;
  }, [category, mastery.mastered, mastery.total, activeCategoryMeta.label]);

  const safeIndex = deck.length > 0 ? Math.min(currentIndex, deck.length - 1) : 0;
  const currentCard = deck[safeIndex];
  const nextCard =
    deck.length > 1
      ? deck[getWrappedIndex(safeIndex, 1, deck.length)]
      : undefined;
  const thirdCard =
    deck.length > 2
      ? deck[getWrappedIndex(safeIndex, 2, deck.length)]
      : undefined;

  const handleCategoryChange = (nextCategory: CategoryId) => {
    if (nextCategory === category) return;
    soundEngine.playTabClick();
    setCategory(nextCategory);
    setMilestoneBanner(null);
    const filtered = filterStudyDeck(
      VOCAB_CARDS,
      nextCategory,
      masteredIds,
      onlyUnlearned
    );
    setDeck(filtered);
    setCurrentIndex(0);
    setDirection(1);
    setIsFlipped(false);
  };

  const handleToggleOnlyUnlearned = () => {
    soundEngine.playTabClick();
    const nextOnly = !onlyUnlearned;
    setOnlyUnlearned(nextOnly);
    const filtered = filterStudyDeck(VOCAB_CARDS, category, masteredIds, nextOnly);
    if (nextOnly && filtered.length === 0) {
      setMilestoneBanner(null);
    }
    setDeck(filtered);
    setCurrentIndex(0);
    setDirection(1);
    setIsFlipped(false);
  };

  const handleResetCategoryStars = () => {
    soundEngine.playUnstar();
    const updated = clearCategoryMasteredIds(masteredIds, activeCategoryPool);
    setMasteredIds(updated);
    setMilestoneBanner(null);
    setOnlyUnlearned(false);
    setDeck(filterStudyDeck(VOCAB_CARDS, category, updated, false));
    setCurrentIndex(0);
    setIsFlipped(false);
  };

  const handleModeChange = (nextMode: AppMode) => {
    if (nextMode === mode) return;
    soundEngine.playTabClick();
    setMilestoneBanner(null);
    setMode(nextMode);
  };

  const handleNext = useCallback(() => {
    if (deck.length === 0) return;
    soundEngine.playSwipe('next');
    setDirection(1);
    setIsFlipped(false);
    setCurrentIndex((idx) => getWrappedIndex(idx, 1, deck.length));
  }, [deck.length]);

  const handlePrev = useCallback(() => {
    if (deck.length === 0) return;
    soundEngine.playSwipe('prev');
    setDirection(-1);
    setIsFlipped(false);
    setCurrentIndex((idx) => getWrappedIndex(idx, -1, deck.length));
  }, [deck.length]);

  const handleFlip = useCallback(() => {
    setIsFlipped((prev) => {
      const nextState = !prev;
      soundEngine.playFlip(nextState);
      return nextState;
    });
  }, []);

  const handleShuffle = () => {
    if (deck.length <= 1) return;
    soundEngine.playShuffle();
    setDirection(1);
    setIsFlipped(false);
    setDeck((prevDeck) => shuffleDeck(prevDeck));
    setCurrentIndex(0);
    setShuffleNonce((n) => n + 1);
  };

  const handleToggleMastered = useCallback((cardId: string) => {
    setMasteredIds((prev) => toggleMasteredId(prev, cardId));
  }, []);

  const handleEnsureMastered = useCallback((cardId: string) => {
    setMasteredIds((prev) => (prev.includes(cardId) ? prev : [...prev, cardId]));
  }, []);

  const handleToggleMute = () => {
    const nextMuted = !isMuted;
    setIsMuted(nextMuted);
    soundEngine.setMuted(nextMuted);
  };

  /**
   * Reserved pronunciation handler.
   * Plug in your TTS / audio API here later using `card.word`.
   */
  const handlePronounce = useCallback((_card: VocabCard) => {
    // Intentionally left ready for future TTS API integration.
  }, []);

  // Keyboard shortcuts for desktop exploration
  useEffect(() => {
    if (mode !== 'cards') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInteractiveElement =
        target &&
        (target.tagName === 'BUTTON' ||
          target.tagName === 'INPUT' ||
          target.tagName === 'TEXTAREA');

      if (e.key === 'ArrowRight') {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'ArrowLeft') {
        e.preventDefault();
        handlePrev();
      } else if (e.key === ' ' && !isInteractiveElement) {
        e.preventDefault();
        handleFlip();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, handleNext, handlePrev, handleFlip]);

  const progressPercent =
    deck.length > 0 ? Math.round(((safeIndex + 1) / deck.length) * 100) : 0;
  const unlearnedCount = Math.max(0, mastery.total - mastery.mastered);

  return (
    <div className="relative min-h-screen studio-canvas flex flex-col text-slate-900 overflow-x-clip">
      <BackdropScene
        category={category}
        cardTint={mode === 'cards' ? currentCard?.stageTint : undefined}
      />

      {/* Clean Single-Row Studio Header */}
      <header className="relative z-10 w-full max-w-5xl mx-auto px-4 sm:px-6 pt-4 pb-2 flex items-center justify-between gap-2 sm:gap-4">
        {/* Zone 1: Single-line Brand Wordmark */}
        <div className="flex items-center shrink-0">
          <span className="font-display text-lg sm:text-2xl font-extrabold tracking-tight text-slate-900 whitespace-nowrap">
            WordPop
          </span>
        </div>

        {/* Zone 2: Interactive Mode Switch with Sliding Pill */}
        <LayoutGroup id="mode-switch">
          <nav
            aria-label="Study mode"
            className="flex items-center gap-0.5 sm:gap-1 p-1 bg-slate-200/70 rounded-2xl border border-slate-200/80 shrink-0"
          >
            <button
              type="button"
              onClick={() => handleModeChange('cards')}
              aria-pressed={mode === 'cards'}
              data-testid="mode-cards-btn"
              className={`relative min-h-[36px] sm:min-h-[38px] px-2.5 sm:px-4 py-1.5 rounded-xl text-xs sm:text-sm font-semibold inline-flex items-center gap-1 sm:gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                mode === 'cards'
                  ? 'text-slate-900'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {mode === 'cards' && (
                <motion.span
                  layoutId="mode-pill"
                  transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                  className="absolute inset-0 bg-white rounded-xl shadow-sm"
                  aria-hidden="true"
                />
              )}
              <Layers className="relative z-10 w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span className="relative z-10">Cards</span>
            </button>
            <button
              type="button"
              onClick={() => handleModeChange('quiz')}
              aria-pressed={mode === 'quiz'}
              data-testid="mode-quiz-btn"
              className={`relative min-h-[36px] sm:min-h-[38px] px-2.5 sm:px-4 py-1.5 rounded-xl text-xs sm:text-sm font-semibold inline-flex items-center gap-1 sm:gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                mode === 'quiz'
                  ? 'text-slate-900'
                  : 'text-slate-600 hover:text-slate-900'
              }`}
            >
              {mode === 'quiz' && (
                <motion.span
                  layoutId="mode-pill"
                  transition={{ type: 'spring', stiffness: 460, damping: 34 }}
                  className="absolute inset-0 bg-white rounded-xl shadow-sm"
                  aria-hidden="true"
                />
              )}
              <Sparkles className="relative z-10 w-3.5 h-3.5 sm:w-4 sm:h-4 shrink-0" />
              <span className="relative z-10">Quiz</span>
            </button>
          </nav>
        </LayoutGroup>

        {/* Zone 3: Sound FX Toggle & Quiet Star Tally */}
        <div className="flex items-center gap-2 sm:gap-4 shrink-0">
          <div
            className="flex items-center gap-1 sm:gap-1.5 text-sm font-semibold text-slate-700"
            aria-label={`Learned ${totalMastery.mastered} of ${totalMastery.total} words`}
            data-testid="star-counter"
          >
            <motion.span
              key={totalMastery.mastered}
              initial={
                totalMastery.mastered > 0
                  ? { scale: 1.38, rotate: -18 }
                  : false
              }
              animate={{ scale: 1, rotate: 0 }}
              transition={{ type: 'spring', stiffness: 460, damping: 20 }}
              className="inline-flex items-center"
            >
              <Star
                className="w-4 h-4 text-amber-500 shrink-0"
                fill={totalMastery.mastered > 0 ? 'currentColor' : 'none'}
              />
            </motion.span>
            <span className="font-mono tabular-nums text-xs sm:text-sm">
              {totalMastery.mastered}/{totalMastery.total}
            </span>
          </div>

          <button
            type="button"
            onClick={handleToggleMute}
            aria-label={isMuted ? 'Unmute sound effects' : 'Mute sound effects'}
            aria-pressed={!isMuted}
            data-testid="sound-toggle-btn"
            className={`min-w-[40px] min-h-[40px] px-2 sm:px-3 rounded-xl border text-xs font-semibold inline-flex items-center justify-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
              isMuted
                ? 'bg-slate-100 text-slate-500 border-slate-200 hover:bg-slate-200/70'
                : 'bg-white text-slate-700 border-slate-200/90 hover:bg-slate-50 shadow-xs'
            }`}
          >
            {isMuted ? (
              <VolumeX className="w-4 h-4 shrink-0" />
            ) : (
              <Volume2 className="w-4 h-4 text-indigo-600 shrink-0" />
            )}
            <span className="hidden sm:inline">
              {isMuted ? 'Muted' : 'Sound'}
            </span>
          </button>
        </div>
      </header>

      {/* Main Centered Learning Stage */}
      <main className="relative z-10 flex-1 w-full max-w-5xl mx-auto px-4 sm:px-6 py-2 sm:py-6 flex flex-col items-center justify-center">
        {/* Category Filter Tabs with Sliding Active Pill */}
        <LayoutGroup id="category-tabs">
          <div
            role="tablist"
            aria-label="Word categories"
            className="w-full max-w-2xl flex flex-wrap items-center justify-center gap-2 mb-4 sm:mb-7"
          >
            {CATEGORIES.map((cat) => {
              const isActive = category === cat.id;
              return (
                <motion.button
                  key={cat.id}
                  type="button"
                  role="tab"
                  aria-selected={isActive}
                  whileTap={{ scale: 0.95 }}
                  onClick={() => handleCategoryChange(cat.id)}
                  data-testid={`cat-tab-${cat.id}`}
                  className={`relative min-h-[40px] sm:min-h-[44px] px-3 sm:px-4 py-1.5 sm:py-2 rounded-2xl text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 sm:gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 border ${
                    isActive
                      ? 'text-white border-transparent'
                      : 'bg-white/85 text-slate-600 border-slate-200/80 hover:bg-white hover:text-slate-900'
                  }`}
                >
                  {isActive && (
                    <motion.span
                      layoutId="category-pill"
                      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                      className="absolute inset-0 bg-slate-900 rounded-2xl shadow-sm"
                      aria-hidden="true"
                    />
                  )}
                  <EmojiIcon
                    src={cat.iconUrl}
                    fallbackEmoji={cat.emoji}
                    className="relative z-10 w-4 h-4 sm:w-[18px] sm:h-[18px] object-contain"
                    fallbackClassName="relative z-10 text-base leading-none"
                  />
                  <span className="relative z-10">{cat.label}</span>
                </motion.button>
              );
            })}
          </div>
        </LayoutGroup>

        {/* Category Mastery Milestone Celebration Banner */}
        <AnimatePresence>
          {milestoneBanner && (Boolean(currentCard) || mode === 'quiz') && (
            <motion.div
              initial={{ opacity: 0, y: -10, scale: 0.96 }}
              animate={{
                opacity: 1,
                y: 0,
                scale: 1,
                transition: { type: 'spring', stiffness: 360, damping: 26 },
              }}
              exit={{
                opacity: 0,
                y: -6,
                scale: 0.96,
                transition: { duration: 0.14, ease: 'easeOut' },
              }}
              data-testid="milestone-banner"
              className="w-full max-w-[460px] mb-4 rounded-2xl bg-gradient-to-r from-amber-50 via-white to-emerald-50 border border-amber-200/90 shadow-md px-4 py-3 flex flex-wrap items-center justify-between gap-2.5"
            >
              <div className="flex items-center gap-2.5">
                <span className="w-8 h-8 rounded-xl bg-amber-100 text-amber-600 inline-flex items-center justify-center shrink-0">
                  <Trophy className="w-4 h-4" />
                </span>
                <span className="text-xs sm:text-sm font-bold text-slate-800">
                  {milestoneBanner}
                </span>
              </div>
              <div className="flex items-center gap-1.5 ml-auto">
                {mode === 'cards' && (
                  <button
                    type="button"
                    onClick={() => handleModeChange('quiz')}
                    className="px-2.5 py-1 rounded-xl bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-semibold cursor-pointer transition-colors"
                  >
                    Try Quiz
                  </button>
                )}
                <button
                  type="button"
                  onClick={handleResetCategoryStars}
                  className="px-2.5 py-1 rounded-xl bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-semibold cursor-pointer transition-colors"
                >
                  Practice Again
                </button>
                <button
                  type="button"
                  onClick={() => setMilestoneBanner(null)}
                  className="px-2 py-1 rounded-xl text-slate-400 hover:text-slate-700 text-xs font-semibold cursor-pointer"
                  aria-label="Dismiss celebration"
                >
                  OK
                </button>
              </div>
            </motion.div>
          )}
        </AnimatePresence>

        {/* Active Study View with Smooth Mode Crossfade */}
        <AnimatePresence mode="wait">
          {mode === 'cards' ? (
            <motion.div
              key="study-cards-view"
              initial={{ opacity: 0, y: 10, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.985 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="w-full flex flex-col items-center"
            >
              {currentCard ? (
                <>
                  <FlashcardStage
                    card={currentCard}
                    nextCard={nextCard}
                    thirdCard={thirdCard}
                    isFlipped={isFlipped}
                    isMastered={masteredIds.includes(currentCard.id)}
                    direction={direction}
                    shuffleNonce={shuffleNonce}
                    onFlip={handleFlip}
                    onNext={handleNext}
                    onPrev={handlePrev}
                    onToggleMastered={handleToggleMastered}
                    onEnsureMastered={handleEnsureMastered}
                    onPronounce={handlePronounce}
                  />

                  {/* Deck Navigation & Progress Strip */}
                  <div className="mt-9 sm:mt-11 w-full max-w-[440px] space-y-2.5 sm:space-y-3">
                    {/* Thin Progress Track */}
                    <div
                      className="w-full h-1.5 bg-slate-200/80 rounded-full overflow-hidden"
                      aria-hidden="true"
                    >
                      <motion.div
                        className="h-full bg-indigo-600 rounded-full"
                        initial={false}
                        animate={{ width: `${progressPercent}%` }}
                        transition={{ type: 'spring', stiffness: 280, damping: 28 }}
                      />
                    </div>

                    {/* Navigation Buttons */}
                    <div className="flex items-center justify-between gap-3">
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.92 }}
                        onClick={handlePrev}
                        aria-label="Previous card"
                        data-testid="prev-card-btn"
                        className="min-h-[48px] px-4 py-2.5 rounded-2xl bg-white border border-slate-200/90 text-slate-700 hover:bg-slate-50 hover:text-slate-900 font-semibold text-sm inline-flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <ChevronLeft className="w-4 h-4" />
                        <span>Prev</span>
                      </motion.button>

                      <div className="flex items-center gap-3">
                        <motion.button
                          type="button"
                          whileTap={{ scale: 0.9 }}
                          onClick={handleShuffle}
                          aria-label="Shuffle cards"
                          data-testid="shuffle-btn"
                          className="min-w-[44px] min-h-[44px] rounded-2xl bg-white border border-slate-200/90 text-slate-600 hover:text-slate-900 hover:bg-slate-50 inline-flex items-center justify-center shadow-xs transition-colors cursor-pointer"
                          title="Shuffle deck"
                        >
                          <Shuffle className="w-4 h-4" />
                        </motion.button>

                        <span
                          className="font-mono tabular-nums text-sm font-semibold text-slate-600 min-w-[64px] text-center"
                          data-testid="deck-counter"
                        >
                          {safeIndex + 1} / {deck.length}
                        </span>
                      </div>

                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.92 }}
                        onClick={handleNext}
                        aria-label="Next card"
                        data-testid="next-card-btn"
                        className="min-h-[48px] px-4 py-2.5 rounded-2xl bg-white border border-slate-200/90 text-slate-700 hover:bg-slate-50 hover:text-slate-900 font-semibold text-sm inline-flex items-center gap-1.5 shadow-xs transition-colors cursor-pointer whitespace-nowrap shrink-0"
                      >
                        <span>Next</span>
                        <ChevronRight className="w-4 h-4" />
                      </motion.button>
                    </div>

                    {/* Retention Filter & Hints Row */}
                    <div className="pt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-slate-500 px-1">
                      <div className="flex items-center gap-2">
                        <span>
                          Stars: {mastery.mastered}/{mastery.total}
                        </span>
                        {(mastery.mastered > 0 || onlyUnlearned) && (
                          <button
                            type="button"
                            onClick={handleToggleOnlyUnlearned}
                            aria-pressed={onlyUnlearned}
                            data-testid="to-learn-toggle"
                            className={`px-2 py-0.5 rounded-lg border text-[11px] font-semibold transition-colors cursor-pointer ${
                              onlyUnlearned
                                ? 'bg-indigo-600 text-white border-indigo-600'
                                : 'bg-white/85 text-slate-600 border-slate-200 hover:border-indigo-300 hover:text-indigo-700'
                            }`}
                          >
                            {onlyUnlearned
                              ? `Showing To Learn (${unlearnedCount})`
                              : `To Learn (${unlearnedCount})`}
                          </button>
                        )}
                        {mastery.mastered > 0 && (
                          <button
                            type="button"
                            onClick={handleResetCategoryStars}
                            data-testid="reset-stars-btn"
                            aria-label="Reset category stars"
                            className="inline-flex items-center gap-1 px-1.5 py-0.5 rounded-lg text-[11px] font-medium text-slate-500 hover:text-slate-800 hover:bg-white/80 transition-colors cursor-pointer"
                          >
                            <RotateCcw className="w-3 h-3" />
                            <span>Reset</span>
                          </button>
                        )}
                      </div>
                      <span className="hidden sm:inline">
                        Tap card to flip · Swipe · ← →
                      </span>
                    </div>
                  </div>
                </>
              ) : (
                /* Joyful All-Caught-Up Empty State when To Learn filter has 0 unstarred words left */
                <div
                  data-testid="all-learned-empty-state"
                  className="w-full max-w-[440px] rounded-[32px] bg-white border border-slate-200/95 cardstock-shadow-active p-8 text-center flex flex-col items-center"
                >
                  <span className="w-16 h-16 rounded-2xl bg-amber-100 text-amber-500 inline-flex items-center justify-center mb-4">
                    <Trophy className="w-8 h-8" />
                  </span>
                  <h2 className="font-display text-2xl font-extrabold text-slate-900">
                    All {mastery.total} {activeCategoryMeta.label} Learned!
                  </h2>
                  <p className="mt-2 text-sm text-slate-500 max-w-xs">
                    Every word in this deck already has a gold star. Ready for a quiz or a fresh round?
                  </p>
                  <div className="mt-6 flex flex-wrap items-center justify-center gap-2.5">
                    <button
                      type="button"
                      onClick={() => handleModeChange('quiz')}
                      className="min-h-[44px] px-4 py-2 rounded-2xl bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-semibold cursor-pointer transition-colors"
                    >
                      Play Quiz
                    </button>
                    <button
                      type="button"
                      onClick={handleToggleOnlyUnlearned}
                      className="min-h-[44px] px-4 py-2 rounded-2xl bg-slate-900 hover:bg-slate-800 text-white text-sm font-semibold cursor-pointer transition-colors"
                    >
                      Show All Cards
                    </button>
                    <button
                      type="button"
                      onClick={handleResetCategoryStars}
                      className="min-h-[44px] px-4 py-2 rounded-2xl bg-slate-100 hover:bg-slate-200 text-slate-700 text-sm font-semibold cursor-pointer transition-colors"
                    >
                      Practice Again
                    </button>
                  </div>
                </div>
              )}
            </motion.div>
          ) : (
            <motion.div
              key="study-quiz-view"
              initial={{ opacity: 0, y: 10, scale: 0.985 }}
              animate={{ opacity: 1, y: 0, scale: 1 }}
              exit={{ opacity: 0, y: -8, scale: 0.985 }}
              transition={{ duration: 0.18, ease: [0.22, 1, 0.36, 1] }}
              className="w-full"
            >
              <QuizStage
                pool={activeCategoryPool}
                allCards={VOCAB_CARDS}
                onMasterWord={handleEnsureMastered}
                onPronounce={handlePronounce}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
