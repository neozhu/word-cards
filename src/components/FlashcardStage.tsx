import React, { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import {
  animate,
  AnimatePresence,
  motion,
  MotionValue,
  PanInfo,
  useIsPresent,
  useMotionValue,
  useReducedMotion,
  useSpring,
  useTransform,
} from 'motion/react';
import { Sparkles, Star, Volume2 } from 'lucide-react';
import { CATEGORIES, VocabCard } from '../data/vocabData';
import { getSpellableLetters, stepSpellingProgress } from '../utils/deckLogic';
import { soundEngine } from '../utils/soundEngine';
import { EmojiIcon } from './EmojiIcon';
import { BurstItem, ParticleBurst } from './ParticleBurst';
import { SpeakPractice, useSpeechPractice, type PracticeResult } from './SpeakPractice';

interface FlashcardStageProps {
  card: VocabCard;
  nextCard?: VocabCard;
  thirdCard?: VocabCard;
  isFlipped: boolean;
  isMastered: boolean;
  direction: number; // 1 for next, -1 for prev
  onFlip: () => void;
  onNext: () => void;
  onPrev: () => void;
  onToggleMastered: (cardId: string) => void;
  onEnsureMastered?: (cardId: string) => void;
  onPronounce?: (card: VocabCard, text?: string, queue?: boolean) => Promise<void>;
  onStopPronounce?: () => void;
}

interface FlashcardItemProps {
  card: VocabCard;
  isFlipped: boolean;
  isMastered: boolean;
  direction: number;
  stackDragX: MotionValue<number>;
  onFlip: () => void;
  onNext: () => void;
  onPrev: () => void;
  onToggleMastered: (cardId: string) => void;
  onEnsureMastered?: (cardId: string) => void;
  onPronounce?: (card: VocabCard, text?: string, queue?: boolean) => Promise<void>;
  onStopPronounce?: () => void;
  onSpawnBurst: (kind: 'star' | 'emoji') => void;
}

const cardVariants = {
  enter: (dir: number) =>
    dir >= 0
      ? {
          // Rise seamlessly out of the 2nd card's exact resting pose underneath
          x: 11,
          y: 14,
          scale: 0.968,
          rotate: 2.8,
          opacity: 1,
        }
      : {
          // Sweep back onto the top of the deck from the left as a solid card
          x: -260,
          y: -8,
          scale: 0.96,
          rotate: -11,
          opacity: 0,
        },
  center: {
    x: 0,
    y: 0,
    scale: 1,
    rotate: 0,
    opacity: 1,
    transition: {
      type: 'spring' as const,
      stiffness: 340,
      damping: 28,
      mass: 0.85,
    },
  },
  exit: (dir: number) =>
    dir >= 0
      ? {
          // Stay solid opaque while peeling sideways clear of the deck, then fade at the outer edge
          x: -320,
          y: -14,
          scale: 0.94,
          rotate: -14,
          opacity: [1, 1, 0],
          transition: {
            duration: 0.28,
            times: [0, 0.58, 1],
            ease: [0.22, 1, 0.36, 1] as const,
          },
        }
      : {
          // Tuck cleanly back down into the 2nd card stack slot without ghosting
          x: 11,
          y: 14,
          scale: 0.968,
          rotate: 2.8,
          opacity: [1, 1, 0],
          transition: {
            duration: 0.24,
            times: [0, 0.65, 1],
            ease: [0.22, 1, 0.36, 1] as const,
          },
        },
};

function FlashcardItem({
  card,
  isFlipped,
  isMastered,
  direction,
  stackDragX,
  onFlip,
  onNext,
  onPrev,
  onToggleMastered,
  onEnsureMastered,
  onPronounce,
  onStopPronounce,
  onSpawnBurst,
}: FlashcardItemProps) {
  const isPresent = useIsPresent();
  const reducedMotion = useReducedMotion();
  const [lockedFlipped, setLockedFlipped] = useState(isFlipped);
  const [emojiBounceKey, setEmojiBounceKey] = useState(0);
  const [pronouncing, setPronouncing] = useState(false);
  const [pronounceNotice, setPronounceNotice] = useState('');
  const [activeLetterIdx, setActiveLetterIdx] = useState<number | null>(null);
  const [spelledCount, setSpelledCount] = useState(0);
  const [speechGlow, setSpeechGlow] = useState(false);
  const didDragRef = useRef(false);
  const dragResetTimerRef = useRef<number | undefined>(undefined);
  const letterTimerRef = useRef<number | null>(null);
  const speechGlowTimer = useRef<number | undefined>(undefined);
  const pronounceRequest = useRef(0);

  const stopListen = useCallback(() => {
    pronounceRequest.current++;
    onStopPronounce?.();
    setPronouncing(false);
    setPronounceNotice('');
  }, [onStopPronounce]);

  const handleSpeechResult = (result: PracticeResult) => {
    if (result.grade === 'great') {
      soundEngine.playStarSuccess();
      onSpawnBurst('star');
      window.clearTimeout(speechGlowTimer.current);
      setSpeechGlow(true);
      speechGlowTimer.current = window.setTimeout(() => setSpeechGlow(false), 2200);
      if (!result.demo) onEnsureMastered?.(card.id);
    } else if (result.grade === 'good') {
      soundEngine.playSpeechGood();
    } else {
      soundEngine.playGentleOops();
    }
  };

  const speech = useSpeechPractice(isPresent, isFlipped, stopListen, handleSpeechResult);
  const needsPronunciationPractice = speech.state.kind === 'result' && speech.state.result.grade === 'retry';

  // Lock face state while exiting so flipped cards don't twist mid-air on dismiss
  useEffect(() => {
    if (isPresent) {
      setLockedFlipped(isFlipped);
    }
  }, [isFlipped, isPresent]);

  const effectiveFlipped = isPresent ? isFlipped : lockedFlipped;

  useLayoutEffect(() => {
    if (isPresent) stopListen();
    window.clearTimeout(speechGlowTimer.current);
    setSpeechGlow(false);
  }, [isFlipped, isPresent, stopListen]);

  // Subtle 3D hover tilt
  const cardRef = useRef<HTMLDivElement>(null);
  const pointerX = useMotionValue(0);
  const pointerY = useMotionValue(0);
  const tiltX = useSpring(useTransform(pointerY, [-0.5, 0.5], [4.5, -4.5]), {
    stiffness: 260,
    damping: 26,
  });
  const tiltY = useSpring(useTransform(pointerX, [-0.5, 0.5], [-4.5, 4.5]), {
    stiffness: 260,
    damping: 26,
  });

  // Per-card drag tracking
  const dragX = useMotionValue(0);
  const dragRotate = useTransform(dragX, [-220, 0, 220], [-8, 0, 8]);

  useEffect(() => {
    return dragX.on('change', (latest) => {
      if (isPresent) {
        stackDragX.set(latest);
      }
    });
  }, [dragX, stackDragX, isPresent]);

  useEffect(() => {
    return () => {
      if (letterTimerRef.current) {
        window.clearTimeout(letterTimerRef.current);
      }
      window.clearTimeout(dragResetTimerRef.current);
      window.clearTimeout(speechGlowTimer.current);
    };
  }, []);

  const handleEmojiPoke = () => {
    soundEngine.playEmojiBoing();
    setEmojiBounceKey((k) => k + 1);
    onSpawnBurst('emoji');
  };

  const handlePronounce = async (text: string, queue = false) => {
    if (!onPronounce) return;
    speech.prepareListen();
    const request = ++pronounceRequest.current;
    setPronouncing(true);
    setPronounceNotice('');
    try {
      await onPronounce(card, text, queue);
    } catch {
      if (request === pronounceRequest.current) setPronounceNotice("Couldn't play audio. Please try again.");
    } finally {
      if (request === pronounceRequest.current) setPronouncing(false);
    }
  };

  const handleStarClick = () => {
    if (!isMastered) {
      soundEngine.playStarSuccess();
      onSpawnBurst('star');
    } else {
      soundEngine.playUnstar();
    }
    onToggleMastered(card.id);
  };

  const spellableLetters = useMemo(() => getSpellableLetters(card.word), [card.word]);
  const spellTokens = useMemo(() => {
    let runningLetterPos = -1;
    return card.word.split('').map((char) => {
      if (char === ' ') {
        return { isSpace: true as const, char, letterPos: -1 };
      }
      runningLetterPos += 1;
      return {
        isSpace: false as const,
        char: char.toUpperCase(),
        letterPos: runningLetterPos,
      };
    });
  }, [card.word]);
  const isSpellingComplete =
    spellableLetters.length > 0 && spelledCount >= spellableLetters.length;

  const handleLetterClick = (letterPos: number) => {
    const result = stepSpellingProgress(spellableLetters, spelledCount, letterPos);
    const letter = spellableLetters[letterPos];
    speech.prepareListen();
    const request = ++pronounceRequest.current;
    setPronouncing(false);
    setPronounceNotice('');
    void onPronounce?.(card, result.completed ? `${letter}. ${card.word}` : letter, true)
      .catch(() => {
        if (request === pronounceRequest.current) {
          setPronounceNotice("Couldn't play audio. Please try again.");
        }
      });
    setSpelledCount(result.nextStep);
    setActiveLetterIdx(letterPos);
    if (letterTimerRef.current) {
      window.clearTimeout(letterTimerRef.current);
    }
    letterTimerRef.current = window.setTimeout(() => {
      setActiveLetterIdx(null);
    }, 260);

    if (result.completed) {
      soundEngine.playStarSuccess();
      onSpawnBurst('star');
      if (onEnsureMastered) {
        onEnsureMastered(card.id);
      }
    }
  };

  const handleCardSurfaceClick = (e: React.MouseEvent<HTMLElement>) => {
    if (!isPresent || didDragRef.current) return;
    if ((e.target as HTMLElement).closest('button, a, [role="button"]')) {
      return;
    }
    onFlip();
  };

  const handlePointerMove = (e: React.PointerEvent<HTMLDivElement>) => {
    if (!isPresent || e.pointerType !== 'mouse' || !cardRef.current) return;
    const rect = cardRef.current.getBoundingClientRect();
    const nx = (e.clientX - rect.left) / rect.width - 0.5;
    const ny = (e.clientY - rect.top) / rect.height - 0.5;
    pointerX.set(nx);
    pointerY.set(ny);
  };

  const handlePointerLeave = () => {
    pointerX.set(0);
    pointerY.set(0);
  };

  const handleDragEnd = (
    _: MouseEvent | TouchEvent | PointerEvent,
    info: PanInfo
  ) => {
    window.clearTimeout(dragResetTimerRef.current);
    dragResetTimerRef.current = window.setTimeout(() => {
      didDragRef.current = false;
    }, 90);
    const threshold = 90;
    const velocityThreshold = 420;
    if (info.offset.x < -threshold || info.velocity.x < -velocityThreshold) {
      onNext();
    } else if (info.offset.x > threshold || info.velocity.x > velocityThreshold) {
      onPrev();
    } else {
      animate(stackDragX, 0, { type: 'spring', stiffness: 360, damping: 28 });
    }
  };

  const categoryMeta =
    CATEGORIES.find((c) => c.id === card.category) ?? CATEGORIES[1];

  // When advancing Next, exiting card peels off ON TOP (z-30) over rising new card (z-20).
  // When going Prev, incoming previous card lands ON TOP (z-20) over tucking card (z-10).
  const zClass = isPresent
    ? 'z-20'
    : direction >= 0
    ? 'z-30 pointer-events-none'
    : 'z-10 pointer-events-none';

  const renderListen = (text: string, label: string, testId: string) => (
    <motion.button
      type="button"
      whileTap={{ scale: 0.94 }}
      onClick={() => handlePronounce(text)}
      aria-label={label}
      data-testid={isPresent ? testId : undefined}
      className={`inline-flex min-h-12 min-w-0 items-center justify-center gap-2 rounded-2xl border px-2.5 py-2 text-sm font-semibold transition-colors cursor-pointer disabled:cursor-default focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-indigo-500 ${
        pronouncing
          ? 'border-indigo-600 bg-indigo-600 text-white'
          : 'border-indigo-200/75 bg-indigo-100 text-indigo-700 enabled:hover:bg-indigo-200'
      } ${needsPronunciationPractice && !pronouncing ? "relative after:pointer-events-none after:absolute after:-inset-1 after:rounded-[20px] after:ring-2 after:ring-indigo-400/65 after:content-[''] motion-safe:after:animate-pulse" : ''}`}
    >
      <Volume2 className="size-4 shrink-0" strokeWidth={2.3} aria-hidden="true" />
      <span>Listen</span>
      <span className="inline-flex h-3.5 w-4 items-end justify-center gap-0.5" aria-hidden="true">
        {[0.6, 1, 0.75].map((height, index) => (
          <motion.span
            key={index}
            animate={pronouncing && !reducedMotion ? { scaleY: [0.4, 1.15, 0.5, 1, 0.4] } : { scaleY: height }}
            transition={pronouncing && !reducedMotion ? { duration: 0.55, repeat: Infinity, delay: index * 0.12 } : { duration: 0.2 }}
            className={`h-full w-[2.5px] origin-bottom rounded-full ${pronouncing ? 'bg-white' : 'bg-indigo-500/70'}`}
          />
        ))}
      </span>
    </motion.button>
  );

  return (
    <motion.div
      ref={cardRef}
      custom={direction}
      variants={cardVariants}
      initial="enter"
      animate="center"
      exit="exit"
      drag={isPresent ? 'x' : false}
      dragConstraints={{ left: 0, right: 0 }}
      dragElastic={0.42}
      onDragStart={() => {
        window.clearTimeout(dragResetTimerRef.current);
        didDragRef.current = true;
      }}
      onDragEnd={handleDragEnd}
      onPointerMove={handlePointerMove}
      onPointerLeave={handlePointerLeave}
      style={{
        x: dragX,
        rotate: dragRotate,
        rotateX: tiltX,
        rotateY: tiltY,
      }}
      className={`col-start-1 row-start-1 w-full relative perspective-1400 cursor-grab active:cursor-grabbing ${zClass}`}
    >
      {/* 3D Flipper Shell with subtle physical lift */}
      <motion.div
        animate={{
          rotateY: effectiveFlipped ? 180 : 0,
          y: effectiveFlipped ? -3 : 0,
        }}
        transition={{
          type: 'spring',
          stiffness: 260,
          damping: 24,
          mass: 0.85,
        }}
        className="preserve-3d relative grid grid-cols-1 w-full min-h-[452px] sm:min-h-[545px]"
      >
        {/* ==================== FRONT FACE ==================== */}
        <section
          aria-label={isPresent ? `${card.word} flashcard front` : undefined}
          aria-hidden={!isPresent || effectiveFlipped}
          inert={!isPresent || effectiveFlipped}
          data-testid={isPresent ? 'card-front' : undefined}
          onClick={handleCardSurfaceClick}
          className={`backface-hidden col-start-1 row-start-1 w-full h-full rounded-[32px] bg-white border cardstock-shadow-active p-5 sm:p-8 flex flex-col justify-between transition-colors duration-300 ${
            speechGlow
              ? 'border-emerald-400 outline-3 outline-emerald-200/70'
              : isMastered
              ? 'border-amber-300/85 bg-[radial-gradient(circle_at_top_right,rgba(253,230,138,0.28),transparent_46%)]'
              : 'border-slate-200/95'
          } ${
            effectiveFlipped || !isPresent
              ? 'pointer-events-none'
              : 'pointer-events-auto'
          }`}
        >
          {/* Top Row: Quiet Category Kicker + Star Mastery Toggle */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2 text-xs font-medium text-slate-500">
              <span
                className="inline-block w-2 h-2 rounded-full"
                style={{ backgroundColor: categoryMeta.accentHex }}
                aria-hidden="true"
              />
              <span>{categoryMeta.label}</span>
            </div>

            <motion.button
              type="button"
              whileTap={{ scale: 0.85 }}
              onClick={handleStarClick}
              aria-label={
                isMastered
                  ? `Unstar ${card.word}`
                  : `Mark ${card.word} as learned`
              }
              aria-pressed={isMastered}
              data-testid={isPresent ? 'star-btn-front' : undefined}
              className={`min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-2xl transition-colors cursor-pointer ${
                speechGlow
                  ? 'bg-emerald-50 text-emerald-600 border border-emerald-300 shadow-[0_0_15px_#6ee7b780]'
                  : isMastered
                  ? 'bg-amber-50 text-amber-500 border border-amber-200'
                  : 'bg-slate-50 text-slate-400 hover:text-amber-500 hover:bg-amber-50/60 border border-slate-200/70'
              }`}
            >
              <Star
                className="w-5 h-5"
                fill={isMastered ? 'currentColor' : 'none'}
                strokeWidth={2.2}
              />
            </motion.button>
          </div>

          {/* Center Stage: Interactive Bouncing Emoji + Word */}
          <div className="flex flex-col items-center text-center my-auto py-2">
            <motion.button
              type="button"
              key={`emoji-${card.id}-${emojiBounceKey}`}
              onClick={handleEmojiPoke}
              whileHover={{ scale: 1.06 }}
              whileTap={{ scale: 0.9 }}
              initial={
                emojiBounceKey > 0 ? { scaleX: 1, scaleY: 1 } : false
              }
              animate={
                emojiBounceKey > 0
                  ? {
                      scaleX: [1, 1.24, 0.86, 1.08, 1],
                      scaleY: [1, 0.76, 1.18, 0.94, 1],
                      rotate: [0, -6, 6, -3, 0],
                    }
                  : reducedMotion
                  ? undefined
                  : { y: [0, -5, 0] }
              }
              transition={
                emojiBounceKey > 0
                  ? { duration: 0.45, ease: [0.16, 1, 0.3, 1] }
                  : {
                      duration: 3.4,
                      repeat: Infinity,
                      ease: 'easeInOut',
                    }
              }
              aria-label={`Tap ${card.word} emoji for bounce`}
              data-testid={isPresent ? 'emoji-trigger' : undefined}
              className="group relative w-32 h-32 sm:w-42 sm:h-42 rounded-full flex items-center justify-center cursor-pointer ring-4 ring-white shadow-[inset_0_3px_10px_rgba(15,23,42,0.06),0_10px_24px_-10px_rgba(15,23,42,0.14)] transition-shadow hover:shadow-[inset_0_3px_10px_rgba(15,23,42,0.06),0_14px_28px_-8px_rgba(79,70,229,0.22)] focus-visible:ring-4 focus-visible:ring-indigo-200 overflow-hidden"
              style={{
                backgroundColor: card.stageTint,
                visibility: effectiveFlipped ? 'hidden' : 'visible',
                transition: 'visibility 0s 150ms, box-shadow 150ms',
              }}
            >
              <span
                aria-hidden="true"
                className="pointer-events-none absolute inset-0 rounded-full bg-[radial-gradient(circle_at_30%_24%,rgba(255,255,255,0.78),transparent_58%)]"
              />
              <EmojiIcon
                src={card.iconUrl}
                fallbackEmoji={card.emoji}
                className="relative z-10 w-22 h-22 sm:w-30 sm:h-30 object-contain drop-shadow-[0_10px_16px_rgba(15,23,42,0.15)]"
                fallbackClassName="relative z-10 text-[4.75rem] sm:text-[6.5rem] leading-none"
                multiFallbackClassName="relative z-10 text-[2.75rem] sm:text-[3.75rem] leading-none whitespace-nowrap"
              />
              <span className="sr-only">{card.word}</span>
            </motion.button>

            <h2 className="mt-4 font-display text-4xl sm:text-[2.75rem] font-extrabold tracking-tight text-slate-900 leading-tight">
              {card.word}
            </h2>
            <p className={`mt-0.5 text-sm tracking-wide ${needsPronunciationPractice ? 'font-semibold text-indigo-700' : 'font-medium text-slate-400'}`}>
              {card.phonetic}
            </p>
            <p
              className="mt-2 font-display text-base sm:text-lg font-semibold text-indigo-600"
              data-testid={isPresent ? 'card-phrase-front' : undefined}
            >
              “{card.phrase}”
            </p>
          </div>

          <SpeakPractice
            prompt={{ kind: 'word', text: card.word }}
            word={card.word}
            practice={speech}
            notice={pronounceNotice}
            noticeTestId={isPresent ? 'pronounce-notice' : undefined}
            listen={renderListen(card.word, `Pronounce ${card.word}`, 'pronounce-btn')}
          />
        </section>

        {/* ==================== BACK FACE ==================== */}
        <section
          aria-label={isPresent ? `${card.word} flashcard back` : undefined}
          aria-hidden={!isPresent || !effectiveFlipped}
          inert={!isPresent || !effectiveFlipped}
          data-testid={isPresent ? 'card-back' : undefined}
          onClick={handleCardSurfaceClick}
          className={`backface-hidden rotate-y-180 col-start-1 row-start-1 w-full h-full rounded-[32px] bg-white border cardstock-shadow-active p-5 sm:p-8 flex flex-col justify-between transition-colors duration-300 ${
            speechGlow
              ? 'border-emerald-400 outline-3 outline-emerald-200/70'
              : isMastered
              ? 'border-amber-300/85 bg-[radial-gradient(circle_at_top_right,rgba(253,230,138,0.24),transparent_44%)]'
              : 'border-slate-200/95'
          } ${
            effectiveFlipped && isPresent
              ? 'pointer-events-auto'
              : 'pointer-events-none'
          }`}
        >
          {/* Top Row */}
          <div className="flex items-center justify-between gap-4">
            <div className="flex items-center gap-2.5">
              <span
                className="w-10 h-10 rounded-xl flex items-center justify-center"
                style={{ backgroundColor: card.stageTint }}
                aria-hidden="true"
              >
                <EmojiIcon
                  src={card.iconUrl}
                  fallbackEmoji={card.emoji}
                  className="w-6 h-6 object-contain"
                  fallbackClassName="text-xl leading-none"
                  multiFallbackClassName="text-sm leading-none whitespace-nowrap"
                />
              </span>
              <div>
                <p className="font-display font-bold text-base text-slate-900 leading-none">
                  {card.word}
                </p>
                <p className={`mt-1 text-xs ${needsPronunciationPractice ? 'font-semibold text-indigo-700' : 'text-slate-500'}`}>{card.phonetic}</p>
              </div>
            </div>

            <motion.button
              type="button"
              whileTap={{ scale: 0.85 }}
              onClick={handleStarClick}
              aria-label={
                isMastered
                  ? `Unstar ${card.word}`
                  : `Mark ${card.word} as learned`
              }
              aria-pressed={isMastered}
              data-testid={isPresent ? 'star-btn-back' : undefined}
              className={`min-w-[44px] min-h-[44px] inline-flex items-center justify-center rounded-2xl transition-colors cursor-pointer ${
                speechGlow
                  ? 'bg-emerald-50 text-emerald-600 border border-emerald-300 shadow-[0_0_15px_#6ee7b780]'
                  : isMastered
                  ? 'bg-amber-50 text-amber-500 border border-amber-200'
                  : 'bg-slate-50 text-slate-400 hover:text-amber-500 hover:bg-amber-50/60 border border-slate-200/70'
              }`}
            >
              <Star
                className="w-5 h-5"
                fill={isMastered ? 'currentColor' : 'none'}
                strokeWidth={2.2}
              />
            </motion.button>
          </div>

          {/* Center: Quick Phrase, Musical Letter Tiles & Story Sentence */}
          <div className="my-auto py-2 flex flex-col items-center text-center">
            <span className="text-xs font-medium text-slate-400 tracking-wide">
              Quick Phrase
            </span>
            <h3
              className="mt-1 font-display text-2xl sm:text-3xl font-bold text-slate-900 tracking-tight"
              data-testid={isPresent ? 'card-phrase-back' : undefined}
            >
              “{card.phrase}”
            </h3>

            {/* Interactive Sequential Spelling Game */}
            <div className="mt-3.5 flex flex-col items-center">
              <div className="mb-2 h-4 flex items-center gap-2 text-[11px] font-semibold">
                {isSpellingComplete && (
                  <motion.span
                    initial={{ scale: 0.85, opacity: 0 }}
                    animate={{ scale: 1, opacity: 1 }}
                    className="inline-flex items-center gap-1 text-emerald-600"
                    data-testid={isPresent ? 'spelling-complete-badge' : undefined}
                  >
                    <Sparkles className="w-3 h-3" />
                    <span>Nice spelling! Star earned</span>
                  </motion.span>
                )}
              </div>

              <div
                className="flex flex-wrap items-center justify-center gap-1.5"
                aria-label={`Spell ${card.word}`}
              >
                {spellTokens.map((token, idx) => {
                  if (token.isSpace) {
                    return (
                      <span key={`space-${idx}`} className="w-2" aria-hidden="true" />
                    );
                  }
                  const pos = token.letterPos;
                  const isDone = pos < spelledCount;
                  const isNext = !isSpellingComplete && pos === spelledCount;
                  const isJustTapped = activeLetterIdx === pos;

                  return (
                    <motion.button
                      key={`${card.id}-char-${idx}`}
                      type="button"
                      whileHover={{ y: isNext ? -3 : -2 }}
                      whileTap={{ scale: 0.85 }}
                      animate={
                        isSpellingComplete
                          ? { y: [0, -4, 0], scale: [1, 1.12, 1] }
                          : isJustTapped
                          ? { y: -5, scale: 1.1 }
                          : isNext
                          ? { y: -2, scale: 1.02 }
                          : effectiveFlipped
                          ? { y: 0, scale: 1 }
                          : { y: 4, scale: 0.94 }
                      }
                      transition={
                        isSpellingComplete
                          ? {
                              duration: 0.34,
                              delay: pos * 0.04,
                              ease: [0.16, 1, 0.3, 1],
                            }
                          : {
                              type: 'spring',
                              stiffness: 420,
                              damping: 24,
                              delay: isJustTapped || isNext ? 0 : idx * 0.025,
                            }
                      }
                      onClick={() => handleLetterClick(pos)}
                      aria-label={`Letter ${token.char}`}
                      data-testid={
                        isPresent ? `spell-letter-${pos}` : undefined
                      }
                      className={`relative w-8 h-9 sm:w-9 sm:h-10 rounded-xl border font-display font-bold text-sm sm:text-base inline-flex items-center justify-center transition-colors cursor-pointer ${
                        isSpellingComplete
                          ? 'bg-emerald-500 text-white border-emerald-500 shadow-xs'
                          : isDone
                          ? 'bg-indigo-600 text-white border-indigo-600 shadow-xs'
                          : isNext
                          ? 'bg-indigo-50 text-indigo-700 border-indigo-300'
                          : 'bg-slate-100 hover:bg-indigo-50 border-slate-200/80 hover:border-indigo-200 text-slate-800 hover:text-indigo-700'
                      }`}
                    >
                      {isNext && (
                        <motion.span
                          aria-hidden="true"
                          animate={reducedMotion ? { opacity: 0.7 } : { opacity: [0.35, 0.95, 0.35] }}
                          transition={
                            reducedMotion
                              ? { duration: 0 }
                              : {
                                  duration: 1.5,
                                  repeat: Infinity,
                                  ease: 'easeInOut',
                                }
                          }
                          className="pointer-events-none absolute -inset-0.5 rounded-xl ring-2 ring-indigo-300"
                        />
                      )}
                      <span className="relative z-10">{token.char}</span>
                    </motion.button>
                  );
                })}
              </div>
            </div>

            <div className="mt-4 w-full rounded-2xl bg-slate-50/90 border border-slate-200/70 p-4 text-left">
              <p className="text-[11px] font-semibold text-indigo-600 tracking-wide">
                Story Sentence
              </p>
              <p className="mt-1 text-sm sm:text-base font-semibold text-slate-800 leading-snug">
                “{card.sentence}”
              </p>
            </div>
          </div>

          <SpeakPractice
            prompt={{ kind: 'sentence', text: card.sentence }}
            word={card.word}
            practice={speech}
            notice={pronounceNotice}
            listen={renderListen(
              `${card.phrase}. ${card.sentence}`, `Read phrase and sentence for ${card.word}`, 'pronounce-btn-back'
            )}
          />
        </section>
      </motion.div>
    </motion.div>
  );
}

export function FlashcardStage({
  card,
  nextCard,
  thirdCard,
  isFlipped,
  isMastered,
  direction,
  onFlip,
  onNext,
  onPrev,
  onToggleMastered,
  onEnsureMastered,
  onPronounce,
  onStopPronounce,
}: FlashcardStageProps) {
  const [bursts, setBursts] = useState<BurstItem[]>([]);
  const burstCounter = useRef(0);
  const burstTimersRef = useRef(new Set<number>());

  useEffect(() => {
    const timers = burstTimersRef.current;
    return () => {
      timers.forEach((timerId) => window.clearTimeout(timerId));
      timers.clear();
    };
  }, []);

  // Shared MotionValue reflecting top-card drag for continuous stacked-card lift
  const stackDragX = useMotionValue(0);
  const peekScale = useTransform(stackDragX, [-180, 0, 180], [0.995, 0.968, 0.995]);
  const peekRotate = useTransform(stackDragX, [-180, 0, 180], [0.4, 2.8, 0.4]);
  const peekX = useTransform(stackDragX, [-180, 0, 180], [2, 11, 2]);
  const peekY = useTransform(stackDragX, [-180, 0, 180], [4, 14, 4]);

  const thirdScale = useTransform(stackDragX, [-180, 0, 180], [0.968, 0.945, 0.968]);
  const thirdRotate = useTransform(stackDragX, [-180, 0, 180], [-1.2, -3, -1.2]);
  const thirdX = useTransform(stackDragX, [-180, 0, 180], [-4, -10, -4]);
  const thirdY = useTransform(stackDragX, [-180, 0, 180], [14, 24, 14]);

  useEffect(() => {
    animate(stackDragX, 0, {
      type: 'spring',
      stiffness: 340,
      damping: 28,
    });
  }, [card.id, stackDragX]);

  const spawnBurst = useCallback((kind: 'star' | 'emoji') => {
    const id = ++burstCounter.current;
    setBursts((prev) => [...prev.slice(-3), { id, kind }]);
    const timerId = window.setTimeout(() => {
      burstTimersRef.current.delete(timerId);
      setBursts((prev) => prev.filter((item) => item.id !== id));
    }, 700);
    burstTimersRef.current.add(timerId);
  }, []);

  return (
    <div
      className="pointer-events-auto relative w-full max-w-[440px] mx-auto select-none"
      data-testid="card-stage"
    >
      <ParticleBurst bursts={bursts} />

      {/* Physical Fanned Deck Stack Behind Active Card */}
      {thirdCard && (
        <motion.div
          key={`third-${thirdCard.id}`}
          aria-hidden="true"
          initial={{ opacity: 0.6 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          className="absolute inset-0 rounded-[32px] border border-slate-300/75 cardstock-shadow pointer-events-none overflow-hidden"
          style={{
            backgroundColor: thirdCard.stageTint,
            scale: thirdScale,
            rotate: thirdRotate,
            x: thirdX,
            y: thirdY,
          }}
        >
          <div className="absolute inset-[3px] rounded-[29px] bg-white/88" />
        </motion.div>
      )}

      {nextCard && (
        <motion.div
          key={`next-${nextCard.id}`}
          aria-hidden="true"
          initial={{ opacity: 0.7 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 0.25, ease: 'easeOut' }}
          style={{
            scale: peekScale,
            rotate: peekRotate,
            x: peekX,
            y: peekY,
          }}
          className="absolute inset-0 rounded-[32px] bg-white border border-slate-200/95 cardstock-shadow pointer-events-none p-5 sm:p-8 flex flex-col justify-between overflow-hidden"
        >
          {/* Subtle peeking card header accent so users feel the next real card beneath */}
          <div className="flex items-center justify-between">
            <span
              className="w-2.5 h-2.5 rounded-full opacity-70"
              style={{ backgroundColor: nextCard.stageTint }}
            />
            <span className="w-8 h-8 rounded-xl bg-slate-100/80 border border-slate-200/60" />
          </div>
          <div className="my-auto flex items-center justify-center">
            <div
              className="w-32 h-32 sm:w-40 sm:h-40 rounded-full flex items-center justify-center opacity-50"
              style={{ backgroundColor: nextCard.stageTint }}
            >
              <EmojiIcon
                src={nextCard.iconUrl}
                fallbackEmoji={nextCard.emoji}
                className="w-20 h-20 sm:w-28 sm:h-28 object-contain"
                fallbackClassName="text-6xl"
                multiFallbackClassName="text-[2.25rem] sm:text-[3rem] leading-none whitespace-nowrap"
              />
            </div>
          </div>
          <div className="h-10" />
        </motion.div>
      )}

      {/* Active Card Slot: Grid overlay lets exiting and entering cards animate simultaneously with zero empty gap */}
      <div className="grid grid-cols-1 relative z-10 perspective-1400">
        <AnimatePresence initial={false} custom={direction}>
          <FlashcardItem
            key={card.id}
            card={card}
            isFlipped={isFlipped}
            isMastered={isMastered}
            direction={direction}
            stackDragX={stackDragX}
            onFlip={onFlip}
            onNext={onNext}
            onPrev={onPrev}
            onToggleMastered={onToggleMastered}
            onEnsureMastered={onEnsureMastered}
            onPronounce={onPronounce}
            onStopPronounce={onStopPronounce}
            onSpawnBurst={spawnBurst}
          />
        </AnimatePresence>
      </div>
    </div>
  );
}
