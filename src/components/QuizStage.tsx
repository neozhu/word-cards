import { useCallback, useEffect, useRef, useState } from 'react';
import { AnimatePresence, motion } from 'motion/react';
import { ArrowRight, CheckCircle2, HelpCircle, Volume2 } from 'lucide-react';
import { VocabCard } from '../data/vocabData';
import { buildQuizQuestion, QuizQuestion } from '../utils/deckLogic';
import { soundEngine } from '../utils/soundEngine';
import { EmojiIcon } from './EmojiIcon';
import { BurstItem, ParticleBurst } from './ParticleBurst';

interface QuizStageProps {
  pool: VocabCard[];
  allCards: VocabCard[];
  onMasterWord: (cardId: string) => void;
  onPronounce?: (card: VocabCard) => Promise<void>;
  onStopPronounce?: () => void;
}

export function QuizStage({
  pool,
  allCards,
  onMasterWord,
  onPronounce,
  onStopPronounce,
}: QuizStageProps) {
  const [question, setQuestion] = useState<QuizQuestion | null>(() =>
    buildQuizQuestion(pool, allCards)
  );
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [wrongIds, setWrongIds] = useState<string[]>([]);
  const [solved, setSolved] = useState(false);
  const [streak, setStreak] = useState(0);
  const [bursts, setBursts] = useState<BurstItem[]>([]);
  const [pronouncing, setPronouncing] = useState(false);
  const [pronounceNotice, setPronounceNotice] = useState('');
  const [postPronounceAdvance, setPostPronounceAdvance] = useState(false);
  const burstCounter = useRef(0);
  const burstTimersRef = useRef(new Set<number>());
  const autoAdvanceTimerRef = useRef<number | null>(null);
  const pronounceRequestRef = useRef(0);
  const solvedRef = useRef(false);
  const questionTargetIdRef = useRef(question?.target.id);
  const prevPoolRef = useRef(pool);
  const prevAllCardsRef = useRef(allCards);

  solvedRef.current = solved;
  questionTargetIdRef.current = question?.target.id;

  const clearAutoAdvance = useCallback(() => {
    if (autoAdvanceTimerRef.current !== null) {
      window.clearTimeout(autoAdvanceTimerRef.current);
      autoAdvanceTimerRef.current = null;
    }
  }, []);

  const advanceQuestion = useCallback(
    (excludeId?: string) => {
      clearAutoAdvance();
      pronounceRequestRef.current += 1;
      onStopPronounce?.();
      setPronouncing(false);
      setPostPronounceAdvance(false);
      setQuestion(buildQuizQuestion(pool, allCards, excludeId));
      setSelectedId(null);
      setWrongIds([]);
      setSolved(false);
      setPronounceNotice('');
    },
    [pool, allCards, clearAutoAdvance, onStopPronounce]
  );

  useEffect(() => {
    const burstTimers = burstTimersRef.current;
    return () => {
      clearAutoAdvance();
      pronounceRequestRef.current += 1;
      onStopPronounce?.();
      burstTimers.forEach((timerId) => window.clearTimeout(timerId));
      burstTimers.clear();
    };
  }, [clearAutoAdvance, onStopPronounce]);

  // Rebuild question only when category pool actually changes (StrictMode-safe)
  useEffect(() => {
    if (prevPoolRef.current === pool && prevAllCardsRef.current === allCards) {
      return;
    }
    prevPoolRef.current = pool;
    prevAllCardsRef.current = allCards;
    advanceQuestion();
  }, [pool, allCards, advanceQuestion]);

  const spawnBurst = useCallback(() => {
    const id = ++burstCounter.current;
    setBursts((prev) => [...prev.slice(-2), { id, kind: 'star' }]);
    const timerId = window.setTimeout(() => {
      burstTimersRef.current.delete(timerId);
      setBursts((prev) => prev.filter((item) => item.id !== id));
    }, 700);
    burstTimersRef.current.add(timerId);
  }, []);

  const handleOptionClick = (option: VocabCard) => {
    if (!question || solved) return;
    setSelectedId(option.id);

    if (option.id === question.target.id) {
      const nextStreak = streak + 1;
      const isFiveStreak = nextStreak > 0 && nextStreak % 5 === 0;
      setSolved(true);
      setStreak(nextStreak);
      setPostPronounceAdvance(false);
      if (isFiveStreak) {
        soundEngine.playMilestoneFanfare();
      } else {
        soundEngine.playStarSuccess();
      }
      spawnBurst();
      onMasterWord(question.target.id);

      const answeredId = question.target.id;
      clearAutoAdvance();
      if (!pronouncing) {
        autoAdvanceTimerRef.current = window.setTimeout(
          () => {
            advanceQuestion(answeredId);
          },
          isFiveStreak ? 2100 : 1800
        );
      }
    } else {
      if (!wrongIds.includes(option.id)) {
        setWrongIds((prev) => [...prev, option.id]);
      }
      setStreak(0);
      soundEngine.playGentleOops();
    }
  };

  const handleNextQuestion = () => {
    if (!question) return;
    soundEngine.playSwipe('next');
    advanceQuestion(question.target.id);
  };

  const handlePronounce = async () => {
    if (!question || !onPronounce) return;
    const targetCard = question.target;
    const request = ++pronounceRequestRef.current;
    const hadAutoAdvance = autoAdvanceTimerRef.current !== null || solvedRef.current;
    if (hadAutoAdvance) {
      clearAutoAdvance();
    }
    setPronouncing(true);
    setPronounceNotice('');
    try {
      await onPronounce(targetCard);
    } catch {
      if (request === pronounceRequestRef.current) {
        setPronounceNotice("Couldn't play audio. Please try again.");
      }
    } finally {
      if (request === pronounceRequestRef.current) {
        setPronouncing(false);
        if (solvedRef.current && questionTargetIdRef.current === targetCard.id) {
          setPostPronounceAdvance(true);
          clearAutoAdvance();
          autoAdvanceTimerRef.current = window.setTimeout(() => {
            advanceQuestion(targetCard.id);
          }, 700);
        }
      }
    }
  };

  if (!question) {
    return null;
  }

  const isStreakMilestone = solved && streak > 0 && streak % 5 === 0;
  const progressDuration = postPronounceAdvance ? 0.65 : isStreakMilestone ? 2.05 : 1.75;

  return (
    <div
      className="relative w-full max-w-[540px] mx-auto"
      data-testid="quiz-stage"
    >
      <ParticleBurst bursts={bursts} />

      <div className="rounded-[32px] bg-white border border-slate-200/95 cardstock-shadow-active p-6 sm:p-8 overflow-hidden">
        {/* Prompt Header */}
        <div className="flex items-center justify-between gap-4 text-xs font-medium text-slate-500">
          <span className="inline-flex items-center gap-1.5">
            <HelpCircle className="w-3.5 h-3.5 text-indigo-500" />
            <span>Find the matching picture</span>
          </span>
          <motion.span
            key={streak}
            initial={{ scale: 0.86 }}
            animate={{ scale: 1 }}
            transition={{ type: 'spring', stiffness: 440, damping: 24 }}
            className={`font-mono tabular-nums px-2.5 py-0.5 rounded-xl border transition-colors ${
              isStreakMilestone
                ? 'bg-amber-100 border-amber-300 text-amber-800 font-bold shadow-xs'
                : streak >= 2
                ? 'bg-amber-50/90 border-amber-200/80 text-amber-700 font-semibold'
                : 'border-transparent text-slate-600'
            }`}
          >
            {isStreakMilestone ? `★ ${streak} in a row!` : `Streak: ${streak}`}
          </motion.span>
        </div>

        {/* Smooth Question-to-Question Transition */}
        <div className="grid grid-cols-1">
          <AnimatePresence mode="wait" initial={false}>
            <motion.div
              key={question.target.id}
              initial={{ opacity: 0, x: 24 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -24 }}
              transition={{ duration: 0.16, ease: [0.22, 1, 0.36, 1] }}
              className="col-start-1 row-start-1 w-full"
            >
              {/* Target Word + Retained Listen Button */}
              <div className="mt-5 flex flex-col items-center text-center">
                <h2
                  className="font-display text-4xl sm:text-5xl font-extrabold tracking-tight text-slate-900"
                  data-testid="quiz-target-word"
                >
                  {question.target.word}
                </h2>
                <p className="mt-1 text-sm font-semibold text-indigo-600">
                  “{question.target.phrase}”
                </p>
                <div className="mt-2 flex items-center gap-3">
                  <span className="text-sm font-medium text-slate-500">
                    {question.target.phonetic}
                  </span>
                  <button
                    type="button"
                    onClick={handlePronounce}
                    aria-label={`Pronounce ${question.target.word}`}
                    data-testid="quiz-pronounce-btn"
                    className={`min-h-[36px] px-3 py-1 rounded-xl text-xs font-semibold inline-flex items-center gap-1.5 transition-colors cursor-pointer whitespace-nowrap shrink-0 ${
                      pronouncing
                        ? 'bg-indigo-600 text-white shadow-xs'
                        : 'bg-indigo-50 hover:bg-indigo-100 text-indigo-700'
                    }`}
                  >
                    <Volume2 className="w-3.5 h-3.5" />
                    <span>Listen</span>
                  </button>
                </div>
                <div className="h-4 mt-1">
                  <AnimatePresence>
                    {pronounceNotice && (
                      <motion.p
                        initial={{ opacity: 0, y: 2 }}
                        animate={{ opacity: 1, y: 0 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.16 }}
                        className="text-[11px] font-medium text-indigo-600/80"
                        role="status"
                      >
                        {pronounceNotice}
                      </motion.p>
                    )}
                  </AnimatePresence>
                </div>
              </div>

              {/* 2x2 Tactile Emoji Choices with staggered entry */}
              <div className="mt-5 grid grid-cols-2 gap-3.5 sm:gap-4">
                {question.options.map((option, idx) => {
                  const isTarget = option.id === question.target.id;
                  const isWrong = wrongIds.includes(option.id);
                  const showSuccess = solved && isTarget;

                  return (
                    <motion.button
                      key={option.id}
                      type="button"
                      onClick={() => handleOptionClick(option)}
                      disabled={solved && !isTarget}
                      initial={{ opacity: 0, y: 10, scale: 0.96 }}
                      animate={
                        isWrong && selectedId === option.id
                          ? { opacity: 0.55, y: 0, scale: 1, x: [0, -7, 7, -5, 5, 0] }
                          : showSuccess
                          ? { opacity: 1, y: 0, scale: [1, 1.05, 1] }
                          : { opacity: isWrong ? 0.55 : 1, y: 0, scale: 1, x: 0 }
                      }
                      whileHover={!solved && !isWrong ? { scale: 1.03 } : undefined}
                      whileTap={!solved && !isWrong ? { scale: 0.96 } : undefined}
                      transition={{
                        duration: 0.28,
                        delay: selectedId ? 0 : idx * 0.04,
                      }}
                      aria-label={`Choose ${option.word}`}
                      data-testid={`quiz-option-${idx}`}
                      className={`relative min-h-[124px] sm:min-h-[140px] rounded-2xl border p-4 flex flex-col items-center justify-center transition-colors cursor-pointer ${
                        showSuccess
                          ? 'bg-emerald-50 border-emerald-400 ring-2 ring-emerald-200'
                          : isWrong
                          ? 'bg-slate-50 border-slate-200'
                          : 'bg-slate-50/70 hover:bg-white border-slate-200/80 hover:border-indigo-300 hover:shadow-sm'
                      }`}
                    >
                      <AnimatePresence>
                        {showSuccess && (
                          <motion.span
                            initial={{ scale: 0, opacity: 0 }}
                            animate={{ scale: 1, opacity: 1 }}
                            exit={{ scale: 0, opacity: 0 }}
                            transition={{
                              type: 'spring',
                              stiffness: 460,
                              damping: 22,
                            }}
                            className="absolute top-2.5 right-2.5 text-emerald-600"
                            aria-hidden="true"
                          >
                            <CheckCircle2 className="w-4 h-4" strokeWidth={2.5} />
                          </motion.span>
                        )}
                      </AnimatePresence>

                      <motion.div
                        animate={
                          showSuccess ? { scale: [1, 1.15, 1] } : { scale: 1 }
                        }
                        transition={{ duration: 0.36, ease: [0.16, 1, 0.3, 1] }}
                      >
                        <EmojiIcon
                          src={option.iconUrl}
                          fallbackEmoji={option.emoji}
                          className="w-16 h-16 sm:w-20 sm:h-20 object-contain drop-shadow-sm"
                          fallbackClassName="text-6xl sm:text-7xl leading-none"
                          multiFallbackClassName="text-4xl sm:text-5xl leading-none whitespace-nowrap"
                        />
                      </motion.div>

                      <AnimatePresence>
                        {(showSuccess || isWrong) && (
                          <motion.span
                            initial={{ opacity: 0, y: 4 }}
                            animate={{ opacity: 1, y: 0 }}
                            exit={{ opacity: 0 }}
                            transition={{ duration: 0.16 }}
                            className={`mt-2 text-xs font-semibold ${
                              showSuccess ? 'text-emerald-700' : 'text-slate-500'
                            }`}
                          >
                            {option.word}
                          </motion.span>
                        )}
                      </AnimatePresence>
                    </motion.button>
                  );
                })}
              </div>

              {/* Feedback & Next Question Bar */}
              <div className="mt-6 min-h-[52px] flex items-center justify-between gap-4">
                <AnimatePresence mode="wait">
                  {solved ? (
                    <motion.div
                      key="solved-bar"
                      initial={{ opacity: 0, y: 6 }}
                      animate={{ opacity: 1, y: 0 }}
                      exit={{ opacity: 0, y: -4 }}
                      transition={{ duration: 0.2 }}
                      className="w-full flex items-center justify-between gap-4"
                    >
                      <div
                        className="flex items-center gap-2 text-emerald-700 font-semibold text-sm"
                        data-testid="quiz-feedback"
                      >
                        <CheckCircle2 className="w-5 h-5 shrink-0" />
                        <span>
                          Great job! {question.target.word} — “{question.target.phrase}”
                        </span>
                      </div>
                      <motion.button
                        type="button"
                        whileTap={{ scale: 0.95 }}
                        onClick={handleNextQuestion}
                        data-testid="quiz-next-btn"
                        className="relative overflow-hidden min-h-[44px] px-5 py-2.5 rounded-2xl bg-slate-900 text-white text-sm font-semibold hover:bg-slate-800 inline-flex items-center gap-2 cursor-pointer whitespace-nowrap shrink-0"
                      >
                        {!pronouncing && (
                          <motion.span
                            key={postPronounceAdvance ? 'resumed' : 'initial'}
                            aria-hidden="true"
                            initial={{ scaleX: 0 }}
                            animate={{ scaleX: 1 }}
                            transition={{
                              duration: progressDuration,
                              ease: 'linear',
                            }}
                            className="absolute inset-0 bg-emerald-500/25 origin-left pointer-events-none"
                          />
                        )}
                        <span className="relative z-10">Next</span>
                        <ArrowRight className="relative z-10 w-4 h-4" />
                      </motion.button>
                    </motion.div>
                  ) : (
                    <motion.p
                      key={wrongIds.length > 0 ? 'retry-hint' : 'idle-hint'}
                      initial={{ opacity: 0 }}
                      animate={{ opacity: 1 }}
                      exit={{ opacity: 0 }}
                      transition={{ duration: 0.15 }}
                      className="text-xs font-medium text-slate-400 mx-auto"
                      data-testid="quiz-feedback"
                    >
                      {wrongIds.length > 0
                        ? 'Almost! Try another picture.'
                        : 'Tap the picture that matches the word above.'}
                    </motion.p>
                  )}
                </AnimatePresence>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}
