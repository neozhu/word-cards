"use client";

import { AnimatePresence, motion } from "framer-motion";
import { Volume2 } from "lucide-react";
import { useMemo, useRef, useState } from "react";

import type { FlashcardItem } from "../lib/flashcards";

type Props = {
  cards: FlashcardItem[];
};

type TtsUrls = {
  wordAudioUrl: string;
  phraseAudioUrl: string;
};

const TTS_URLS_CACHE_MAX_ENTRIES = 200;
const TAP_THROTTLE_MS = 250;

function sleep(ms: number) {
  return new Promise<void>((resolve) => setTimeout(resolve, ms));
}

async function playAudioSrc(src: string): Promise<void> {
  await new Promise<void>((resolve, reject) => {
    const audio = new Audio(src);
    audio.onended = () => resolve();
    audio.onerror = () => reject(new Error("Audio playback failed"));

    const playPromise = audio.play();
    if (playPromise) {
      playPromise.catch(reject);
    }
  });
}

export default function FlashcardDeck({ cards }: Props) {
  const [index, setIndex] = useState(0);
  const [direction, setDirection] = useState<1 | -1>(1);
  const [isFirstLoad, setIsFirstLoad] = useState(true);
  const [cardTransform, setCardTransform] = useState({ rotateX: 0, rotateY: 0, scale: 1 });

  const isPlayingRef = useRef(false);
  const didDragRef = useRef(false);

  // Dedupes /api/tts requests per card id.
  const ttsInflightRef = useRef(new Map<string, Promise<TtsUrls | null>>());
  // Caches successful /api/tts results per card id.
  const ttsCacheRef = useRef(new Map<string, TtsUrls>());
  // Prevents rapid multi-tap from re-triggering playback.
  const lastTapAtRef = useRef(new Map<string, number>());

  const count = cards.length;
  const card = cards[index];

  const progressPct = useMemo(() => {
    if (count <= 0) return 0;
    return Math.round(((index + 1) / count) * 100);
  }, [count, index]);

  // Generate stable random rotation for each card's background
  const cardRotation = useMemo(() => {
    let hash = 0;
    for (let i = 0; i < card.id.length; i++) {
      hash = ((hash << 5) - hash + card.id.charCodeAt(i)) | 0;
    }
    return (Math.abs(hash) % 360);
  }, [card.id]);

  function rememberTtsUrls(cardId: string, urls: TtsUrls) {
    ttsCacheRef.current.set(cardId, urls);
    while (ttsCacheRef.current.size > TTS_URLS_CACHE_MAX_ENTRIES) {
      const oldestKey = ttsCacheRef.current.keys().next().value as
        | string
        | undefined;
      if (!oldestKey) break;
      ttsCacheRef.current.delete(oldestKey);
    }
  }

  async function fetchTtsUrls(cardId: string): Promise<TtsUrls | null> {
    const url = `/api/tts?id=${encodeURIComponent(cardId)}`;
    const res = await fetch(url, {
      method: "GET",
      headers: { Accept: "application/json" },
      cache: "force-cache",
    });

    if (!res.ok) {
      try {
        const errorPayload = (await res.json()) as { error?: string };
        console.warn("/api/tts failed", res.status, errorPayload?.error);
      } catch {
        console.warn("/api/tts failed", res.status);
      }
      return null;
    }

    const payload = (await res.json()) as {
      wordAudioUrl?: string;
      phraseAudioUrl?: string;
    };

    const wordAudioUrl = payload.wordAudioUrl ?? null;
    const phraseAudioUrl = payload.phraseAudioUrl ?? null;
    if (!wordAudioUrl || !phraseAudioUrl) return null;

    return { wordAudioUrl, phraseAudioUrl };
  }

  async function getTtsUrls(cardId: string): Promise<TtsUrls | null> {
    const cached = ttsCacheRef.current.get(cardId);
    if (cached) return cached;

    const inflight = ttsInflightRef.current.get(cardId);
    if (inflight) return inflight;

    const promise = (async () => {
      try {
        const urls = await fetchTtsUrls(cardId);
        if (urls) rememberTtsUrls(cardId, urls);
        return urls;
      } finally {
        ttsInflightRef.current.delete(cardId);
      }
    })();

    ttsInflightRef.current.set(cardId, promise);
    return promise;
  }

  async function playCurrent() {
    const cardToPlay = card;
    if (!cardToPlay) return;

    const now = Date.now();
    const last = lastTapAtRef.current.get(cardToPlay.id) ?? 0;
    if (now - last < TAP_THROTTLE_MS) return;
    lastTapAtRef.current.set(cardToPlay.id, now);

    if (isPlayingRef.current) return;

    isPlayingRef.current = true;
    try {
      const urls = await getTtsUrls(cardToPlay.id);
      if (!urls) return;

      // Avoid playing the wrong card after a quick swipe.
      if (cards[index]?.id !== cardToPlay.id) return;

      await playAudioSrc(urls.wordAudioUrl);
      await sleep(500);
      await playAudioSrc(urls.phraseAudioUrl);
    } catch {
      // Safe no-op: avoid extra UI or modals.
    } finally {
      isPlayingRef.current = false;
    }
  }

  function paginate(nextDirection: 1 | -1) {
    if (count <= 0) return;

    setIsFirstLoad(false); // After first interaction, disable magic effect
    setDirection(nextDirection);
    setIndex((prev) => {
      const next = prev + nextDirection;
      if (next < 0) return count - 1;
      if (next >= count) return 0;
      return next;
    });
  }

  function handleMouseMove(e: React.MouseEvent<HTMLDivElement>) {
    const rect = e.currentTarget.getBoundingClientRect();
    const x = e.clientX - rect.left;
    const y = e.clientY - rect.top;
    const centerX = rect.width / 2;
    const centerY = rect.height / 2;
    
    // Calculate distance from each corner
    const corners = [
      { x: 0, y: 0, name: 'top-left' },
      { x: rect.width, y: 0, name: 'top-right' },
      { x: 0, y: rect.height, name: 'bottom-left' },
      { x: rect.width, y: rect.height, name: 'bottom-right' },
    ];
    
    const threshold = 100; // pixels from corner to activate effect
    let nearestCorner = null;
    let minDistance = threshold;
    
    for (const corner of corners) {
      const distance = Math.sqrt(Math.pow(x - corner.x, 2) + Math.pow(y - corner.y, 2));
      if (distance < minDistance) {
        minDistance = distance;
        nearestCorner = corner;
      }
    }
    
    if (nearestCorner) {
      // Calculate magnetic pull effect
      const intensity = 1 - (minDistance / threshold);
      const pullX = (nearestCorner.x - centerX) / centerX;
      const pullY = (nearestCorner.y - centerY) / centerY;
      
      setCardTransform({
        rotateX: pullY * intensity * 8,
        rotateY: -pullX * intensity * 8,
        scale: 1 + intensity * 0.03,
      });
    } else {
      // Gentle 3D tilt based on cursor position
      const rotateY = ((x - centerX) / centerX) * 3;
      const rotateX = -((y - centerY) / centerY) * 3;
      
      setCardTransform({
        rotateX,
        rotateY,
        scale: 1,
      });
    }
  }

  function handleMouseLeave() {
    setCardTransform({ rotateX: 0, rotateY: 0, scale: 1 });
  }

  if (count === 0) {
    return (
      <div className="w-full px-6 py-10 text-center text-(--text)">
        No flashcards found.
      </div>
    );
  }

  return (
    <div className="flex w-full items-center justify-center">
      <div className="relative w-full select-none">
        <div aria-hidden className="pointer-events-none absolute inset-0 z-0">
          <div className="absolute inset-0 origin-bottom translate-y-6.5 -rotate-6 scale-[0.985] rounded-[40px] bg-(--card-bg) shadow-(--card-shadow) opacity-35 border border-(--progress-track)" />
          <div className="absolute inset-0 origin-bottom translate-y-4.5 rotate-6 scale-[0.992] rounded-[40px] bg-(--card-bg) shadow-(--card-shadow) opacity-45 border border-(--progress-track)" />
          <div className="absolute inset-0 origin-bottom translate-y-2.5 -rotate-2 scale-[0.997] rounded-[40px] bg-(--card-bg) shadow-(--card-shadow) opacity-55 border border-(--progress-track)" />
        </div>

        <AnimatePresence initial={isFirstLoad} custom={direction} mode="popLayout">
          <motion.div
            key={card.id}
            custom={direction}
            initial={
              isFirstLoad
                ? {
                    x: 0,
                    y: 0,
                    rotate: 0,
                    scale: 0.3,
                    opacity: 0,
                    filter: "blur(12px) brightness(1.8)",
                  }
                : {
                    x: direction === 1 ? 100 : -100,
                    y: 30,
                    rotate: direction === 1 ? 8 : -8,
                    scale: 0.9,
                    opacity: 0,
                    filter: "blur(4px) brightness(1.2)",
                  }
            }
            animate={{
              x: 0,
              y: 0,
              rotate: 0,
              scale: 1,
              opacity: 1,
              filter: "blur(0px) brightness(1)",
            }}
            exit={{
              x: direction === 1 ? -140 : 140,
              y: -20,
              rotate: direction === 1 ? -12 : 12,
              scale: 0.85,
              opacity: 0,
              filter: "blur(4px) brightness(0.8)",
            }}
            transition={
              isFirstLoad
                ? {
                    type: "spring",
                    stiffness: 150,
                    damping: 20,
                    mass: 1.5,
                    opacity: { duration: 0.8 },
                    filter: { duration: 1 },
                    scale: { duration: 0.8 },
                  }
                : {
                    type: "spring",
                    stiffness: 300,
                    damping: 28,
                    mass: 0.8,
                    opacity: { duration: 0.3 },
                    filter: { duration: 0.35 },
                  }
            }
            drag="x"
            dragConstraints={{ left: 0, right: 0 }}
            dragElastic={0.2}
            onDragStart={() => {
              didDragRef.current = true;
            }}
            onDragEnd={(_, info) => {
              if (info.offset.x > 100) paginate(-1);
              if (info.offset.x < -100) paginate(1);

              // If the pointer interaction was a drag, don't treat it as a tap.
              // Reset on the next tick so an immediate click doesn't accidentally play.
              setTimeout(() => {
                didDragRef.current = false;
              }, 0);
            }}
            onTap={() => {
              if (didDragRef.current) return;
              void playCurrent();
            }}
            whileTap={{ scale: 0.95 }}
            style={{
              perspective: "1000px",
            }}
            className="relative z-10"
          >
            <motion.div
              onMouseMove={handleMouseMove}
              onMouseLeave={handleMouseLeave}
              animate={{
                rotateX: cardTransform.rotateX,
                rotateY: cardTransform.rotateY,
                scale: cardTransform.scale,
              }}
              transition={{
                type: "spring",
                stiffness: 150,
                damping: 15,
                mass: 0.5,
              }}
              style={{
                transformStyle: "preserve-3d",
              }}
              className="rounded-[40px] bg-(--card-bg) px-7 py-8 text-center shadow-(--card-shadow) sm:px-8 sm:py-10 overflow-hidden"
            >
            {/* Transition magic particles */}
            {!isFirstLoad && (
              <>
                {[...Array(5)].map((_, i) => (
                  <motion.div
                    key={`particle-${i}`}
                    initial={{
                      x: direction === 1 ? 80 : -80,
                      y: -40 + i * 20,
                      scale: 0,
                      opacity: 0,
                    }}
                    animate={{
                      x: [direction === 1 ? 80 : -80, 0, direction === 1 ? -80 : 80],
                      y: [-40 + i * 20, -10 + i * 15, 20 + i * 10],
                      scale: [0, 1, 0],
                      opacity: [0, 0.6, 0],
                    }}
                    transition={{
                      duration: 0.6,
                      delay: i * 0.03,
                      ease: "easeOut",
                    }}
                    className="absolute left-1/2 top-1/2 -ml-1.5 -mt-1.5 pointer-events-none"
                    style={{
                      width: "12px",
                      height: "12px",
                      background:
                        "radial-gradient(circle, rgba(255, 200, 150, 0.7) 0%, transparent 70%)",
                      borderRadius: "50%",
                      boxShadow: "0 0 15px rgba(255, 200, 150, 0.5)",
                    }}
                  />
                ))}
              </>
            )}
            
            {/* Magical sparkle effect - only on first load */}
            {isFirstLoad && (
              <>
                <motion.div
                  initial={{ opacity: 0, scale: 0 }}
                  animate={{ opacity: [0, 1, 0], scale: [0, 2, 3] }}
                  transition={{ duration: 1.5, times: [0, 0.5, 1] }}
                  className="absolute inset-0 pointer-events-none"
                  style={{
                    background:
                      "radial-gradient(circle at 50% 50%, rgba(255, 200, 100, 0.3) 0%, transparent 60%)",
                  }}
                />
                {/* Sparkle particles */}
                {[...Array(8)].map((_, i) => (
                  <motion.div
                    key={i}
                    initial={{
                      x: 0,
                      y: 0,
                      scale: 0,
                      opacity: 0,
                    }}
                    animate={{
                      x: Math.cos((i * Math.PI * 2) / 8) * 150,
                      y: Math.sin((i * Math.PI * 2) / 8) * 150,
                      scale: [0, 1, 0],
                      opacity: [0, 1, 0],
                    }}
                    transition={{
                      duration: 1,
                      delay: i * 0.05,
                      ease: "easeOut",
                    }}
                    className="absolute left-1/2 top-1/2 -ml-2 -mt-2 pointer-events-none"
                    style={{
                      width: "16px",
                      height: "16px",
                      background:
                        "radial-gradient(circle, rgba(255, 220, 100, 0.8) 0%, transparent 70%)",
                      borderRadius: "50%",
                      boxShadow: "0 0 20px rgba(255, 220, 100, 0.6)",
                    }}
                  />
                ))}
              </>
            )}
            
            {/* Persistent rotating gradient background for all cards */}
            <motion.div
              initial={{ rotate: cardRotation }}
              animate={{ rotate: cardRotation + 360 }}
              transition={{ duration: 25, repeat: Number.POSITIVE_INFINITY, ease: "linear" }}
              className="absolute inset-0 pointer-events-none opacity-20"
              style={{
                background:
                  "conic-gradient(from 0deg, transparent 0%, rgba(255, 200, 100, 0.15) 10%, transparent 20%, rgba(255, 150, 200, 0.15) 30%, transparent 40%, rgba(100, 200, 255, 0.15) 50%, transparent 60%, rgba(150, 100, 255, 0.15) 70%, transparent 80%)",
              }}
            />
            <motion.div
              initial={{ opacity: 0 }}
              animate={{ opacity: 0.1 }}
              transition={{ duration: 0.5 }}
              className="absolute inset-0 pointer-events-none"
              style={{
                background:
                  "radial-gradient(circle at 50% 50%, rgba(255, 220, 150, 0.08) 0%, transparent 70%)",
              }}
            />

            <div className="mb-5 relative z-10">
              <div className="flex items-center justify-between gap-4">
                <div className="text-sm font-medium text-(--text) opacity-60">
                  {index + 1} / {count}
                </div>
                <button
                  type="button"
                  onClick={(e) => {
                    e.stopPropagation();
                    void playCurrent();
                  }}
                  className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-(--card-bg) shadow-(--card-shadow)"
                  aria-label="Play audio"
                >
                  <Volume2 className="h-5 w-5 text-(--accent)" />
                </button>
              </div>

              <div className="mt-2 h-1.5 w-full rounded-full bg-(--progress-track)">
                <div
                  className="h-1.5 rounded-full bg-(--progress-fill) transition-[width] duration-200 ease-out"
                  style={{ width: `${progressPct}%` }}
                />
              </div>
            </div>

            <motion.div
              initial={isFirstLoad ? { scale: 0, rotate: -360 } : { scale: 1, rotate: 0 }}
              animate={{ scale: 1, rotate: 0 }}
              transition={
                isFirstLoad
                  ? { delay: 0.3, type: "spring", stiffness: 200, damping: 15 }
                  : {}
              }
              className="text-7xl leading-none relative z-10"
            >
              {card.emoji}
            </motion.div>
            <motion.div
              initial={isFirstLoad ? { y: 30, opacity: 0 } : { y: 0, opacity: 1 }}
              animate={{ y: 0, opacity: 1 }}
              transition={isFirstLoad ? { delay: 0.5, duration: 0.6 } : {}}
              className="mt-6 text-4xl font-semibold tracking-tight text-(--text) relative z-10"
            >
              {card.word}
            </motion.div>
            <motion.div
              initial={isFirstLoad ? { y: 30, opacity: 0 } : { y: 0, opacity: 1 }}
              animate={{ y: 0, opacity: 1 }}
              transition={isFirstLoad ? { delay: 0.7, duration: 0.6 } : {}}
              className="mt-4 text-lg leading-7 text-(--text) opacity-80 relative z-10"
            >
              {card.phrase}
            </motion.div>
            </motion.div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
