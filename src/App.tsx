/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import { useCallback, useEffect, useMemo, useRef, useState, type KeyboardEvent as ReactKeyboardEvent } from 'react';
import { AnimatePresence, LayoutGroup, motion } from 'motion/react';
import {
  ChevronLeft,
  ChevronRight,
  Layers,
  RotateCcw,
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
  advanceStudyDeck,
  clearCategoryMasteredIds,
  filterCardsByCategory,
  filterStudyDeck,
  getMasteryProgress,
  getWrappedIndex,
  toggleMasteredId,
} from './utils/deckLogic';
import { soundEngine } from './utils/soundEngine';
import { createPronunciationPlayer } from './utils/pronunciation';
import { BackdropScene } from './components/BackdropScene';
import { EmojiIcon } from './components/EmojiIcon';
import { FlashcardStage } from './components/FlashcardStage';
import { QuizStage } from './components/QuizStage';

type AppMode = 'cards' | 'quiz';

const STORAGE_KEY_MASTERED = 'wordpop_mastered_v1';
const VALID_CARD_IDS = new Set(VOCAB_CARDS.map((card) => card.id));

export default function App() {
  const [mode, setMode] = useState<AppMode>('cards');
  const [category, setCategory] = useState<CategoryId>('all');
  const [onlyUnlearned, setOnlyUnlearned] = useState(false);
  const [deck, setDeck] = useState<VocabCard[]>(() => VOCAB_CARDS);
  const [currentIndex, setCurrentIndex] = useState(0);
  const [direction, setDirection] = useState(1);
  const [isFlipped, setIsFlipped] = useState(false);
  const [milestoneBanner, setMilestoneBanner] = useState<string | null>(null);
  const [isMuted, setIsMuted] = useState(() => soundEngine.isMuted());
  const [scrollEdge, setScrollEdge] = useState({ left: false, right: false });
  const pronunciationPlayer = useMemo(() => createPronunciationPlayer(), []);
  const categoryScrollRef = useRef<HTMLDivElement>(null);
  const [masteredIds, setMasteredIds] = useState<string[]>(() => {
    if (typeof window === 'undefined') return [];
    try {
      const raw = window.localStorage.getItem(STORAGE_KEY_MASTERED);
      if (!raw) return [];
      const parsed: unknown = JSON.parse(raw);
      if (!Array.isArray(parsed)) return [];
      return Array.from(
        new Set(
          parsed.filter(
            (id): id is string => typeof id === 'string' && VALID_CARD_IDS.has(id)
          )
        )
      );
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
    if (nextMode === 'cards' && onlyUnlearned) {
      const filtered = filterStudyDeck(VOCAB_CARDS, category, masteredIds, true);
      setDeck(filtered);
      setCurrentIndex((idx) =>
        filtered.length === 0 ? 0 : Math.min(idx, filtered.length - 1)
      );
      setIsFlipped(false);
    }
    setMode(nextMode);
  };

  const stepDeck = useCallback(
    (delta: 1 | -1) => {
      if (deck.length === 0) return;
      soundEngine.playSwipe(delta > 0 ? 'next' : 'prev');
      const { deck: nextDeck, nextIndex } = advanceStudyDeck(
        deck,
        currentIndex,
        delta,
        masteredIds,
        onlyUnlearned
      );
      setDirection(delta);
      setIsFlipped(false);
      setDeck(nextDeck);
      setCurrentIndex(nextIndex);
    },
    [deck, currentIndex, masteredIds, onlyUnlearned]
  );

  const handleNext = useCallback(() => {
    stepDeck(1);
  }, [stepDeck]);

  const handlePrev = useCallback(() => {
    stepDeck(-1);
  }, [stepDeck]);

  const handleFlip = useCallback(() => {
    setIsFlipped((prev) => {
      const nextState = !prev;
      soundEngine.playFlip(nextState);
      return nextState;
    });
  }, []);

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

  useEffect(() => () => pronunciationPlayer.stop(), [pronunciationPlayer, currentCard?.id, mode]);

  const handlePronounce = useCallback((card: VocabCard, text = card.word, queue = false) => (
    queue ? pronunciationPlayer.enqueue(text) : pronunciationPlayer.play(text)
  ), [pronunciationPlayer]);

  // Track category bar horizontal overflow for scroll buttons & edge fade
  const updateCategoryScrollEdges = useCallback(() => {
    const el = categoryScrollRef.current;
    if (!el) return;
    const left = el.scrollLeft > 4;
    const right = el.scrollLeft + el.clientWidth < el.scrollWidth - 4;
    setScrollEdge((prev) =>
      prev.left === left && prev.right === right ? prev : { left, right }
    );
  }, []);

  useEffect(() => {
    const el = categoryScrollRef.current;
    if (!el) return;
    updateCategoryScrollEdges();
    el.addEventListener('scroll', updateCategoryScrollEdges, { passive: true });
    let observer: ResizeObserver | undefined;
    if (typeof ResizeObserver !== 'undefined') {
      observer = new ResizeObserver(updateCategoryScrollEdges);
      observer.observe(el);
    }
    window.addEventListener('resize', updateCategoryScrollEdges);
    return () => {
      el.removeEventListener('scroll', updateCategoryScrollEdges);
      observer?.disconnect();
      window.removeEventListener('resize', updateCategoryScrollEdges);
    };
  }, [updateCategoryScrollEdges]);

  const handleCategoryKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const currentIdx = CATEGORIES.findIndex((c) => c.id === category);
    let targetIdx = -1;
    if (e.key === 'ArrowRight') {
      targetIdx = (currentIdx + 1) % CATEGORIES.length;
    } else if (e.key === 'ArrowLeft') {
      targetIdx = (currentIdx - 1 + CATEGORIES.length) % CATEGORIES.length;
    } else if (e.key === 'Home') {
      targetIdx = 0;
    } else if (e.key === 'End') {
      targetIdx = CATEGORIES.length - 1;
    }
    if (targetIdx >= 0) {
      e.preventDefault();
      const targetCategory = CATEGORIES[targetIdx];
      handleCategoryChange(targetCategory.id);
      const tabButtons = categoryScrollRef.current?.querySelectorAll<HTMLButtonElement>('[role="tab"]');
      const nextTab = tabButtons?.[targetIdx];
      nextTab?.focus();
      nextTab?.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
    }
  };

  // Keyboard shortcuts for desktop exploration
  useEffect(() => {
    if (mode !== 'cards') return;

    const handleKeyDown = (e: KeyboardEvent) => {
      const target = e.target as HTMLElement | null;
      const isInTabList = Boolean(target?.closest('[role="tablist"]'));
      const isTextOrFormControl = Boolean(
        target &&
          (target.tagName === 'INPUT' ||
            target.tagName === 'TEXTAREA' ||
            target.tagName === 'SELECT' ||
            target.isContentEditable)
      );
      const isInteractiveElement = Boolean(
        target &&
          (target.tagName === 'BUTTON' ||
            target.tagName === 'A' ||
            isTextOrFormControl)
      );

      if (e.key === 'ArrowRight' && !isInTabList && !isTextOrFormControl) {
        e.preventDefault();
        handleNext();
      } else if (e.key === 'ArrowLeft' && !isInTabList && !isTextOrFormControl) {
        e.preventDefault();
        handlePrev();
      } else if ((e.key === 'ArrowUp' || e.key === 'ArrowDown') && !isInTabList && !isTextOrFormControl) {
        e.preventDefault();
        handleFlip();
      } else if (e.key === ' ' && !isInteractiveElement) {
        e.preventDefault();
        handleFlip();
      }
    };

    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [mode, handleNext, handlePrev, handleFlip]);

  const unlearnedCount = Math.max(0, mastery.total - mastery.mastered);
  const tabMaskLeft = scrollEdge.left ? 'transparent 0px, black 20px' : 'black 0px';
  const tabMaskRight = scrollEdge.right ? 'black calc(100% - 20px), transparent 100%' : 'black 100%';
  const categoryMaskImage = scrollEdge.left || scrollEdge.right
    ? `linear-gradient(to right, ${tabMaskLeft}, ${tabMaskRight})`
    : undefined;

  return (
    <div className="relative min-h-dvh studio-canvas flex flex-col text-slate-900 overflow-x-clip">
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
          <div className="w-full max-w-2xl flex items-center gap-2 mb-4 sm:mb-7">
            <button
              type="button"
              aria-label="Scroll categories left"
              aria-controls="word-categories"
              disabled={!scrollEdge.left}
              onClick={() => categoryScrollRef.current?.scrollBy({ left: -240, behavior: 'smooth' })}
              className="hidden [@media(any-pointer:fine)]:inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200/80 bg-white/85 text-slate-600 hover:bg-white cursor-pointer disabled:opacity-35 disabled:cursor-default disabled:hover:bg-white/85 transition-opacity"
            >
              <ChevronLeft className="h-4 w-4" aria-hidden="true" />
            </button>
          <div
            ref={categoryScrollRef}
            id="word-categories"
            role="tablist"
            aria-label="Word categories"
            onKeyDown={handleCategoryKeyDown}
            style={categoryMaskImage ? { maskImage: categoryMaskImage, WebkitMaskImage: categoryMaskImage } : undefined}
            className="no-scrollbar min-w-0 flex-1 flex flex-nowrap items-center gap-2 overflow-x-auto py-1"
          >
            {CATEGORIES.map((cat) => {
              const isActive = category === cat.id;
              return (
                <motion.button
                  key={cat.id}
                  type="button"
                  role="tab"
                  tabIndex={isActive ? 0 : -1}
                  aria-selected={isActive}
                  whileTap={{ scale: 0.95 }}
                  onClick={(e) => {
                    handleCategoryChange(cat.id);
                    e.currentTarget.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
                  }}
                  data-testid={`cat-tab-${cat.id}`}
                  className={`relative min-h-[40px] sm:min-h-[44px] px-3 sm:px-4 py-1.5 sm:py-2 rounded-2xl text-xs sm:text-sm font-semibold inline-flex items-center gap-1.5 sm:gap-2 transition-colors cursor-pointer whitespace-nowrap shrink-0 border ${
                    isActive
                      ? 'text-slate-800 border-transparent'
                      : 'bg-white/85 text-slate-600 border-slate-200/80 hover:bg-white hover:text-slate-900'
                  }`}
                >
                  {isActive && (
                    <motion.span
                      layoutId="category-pill"
                      transition={{ type: 'spring', stiffness: 420, damping: 32 }}
                      className="absolute inset-0 rounded-2xl border shadow-sm"
                      style={{ backgroundColor: cat.softHex, borderColor: `${cat.accentHex}80` }}
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
            <button
              type="button"
              aria-label="Scroll categories right"
              aria-controls="word-categories"
              disabled={!scrollEdge.right}
              onClick={() => categoryScrollRef.current?.scrollBy({ left: 240, behavior: 'smooth' })}
              className="hidden [@media(any-pointer:fine)]:inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl border border-slate-200/80 bg-white/85 text-slate-600 hover:bg-white cursor-pointer disabled:opacity-35 disabled:cursor-default disabled:hover:bg-white/85 transition-opacity"
            >
              <ChevronRight className="h-4 w-4" aria-hidden="true" />
            </button>
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
                    onFlip={handleFlip}
                    onNext={handleNext}
                    onPrev={handlePrev}
                    onToggleMastered={handleToggleMastered}
                    onEnsureMastered={handleEnsureMastered}
                    onPronounce={handlePronounce}
                    onStopPronounce={pronunciationPlayer.stop}
                  />

                  {(mastery.mastered > 0 || onlyUnlearned) && (
                    <div className="mt-9 sm:mt-11 flex flex-wrap items-center justify-center gap-2">
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
                  )}
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
                onStopPronounce={pronunciationPlayer.stop}
              />
            </motion.div>
          )}
        </AnimatePresence>
      </main>
    </div>
  );
}
