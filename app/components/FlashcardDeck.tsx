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

    setDirection(nextDirection);
    setIndex((prev) => {
      const next = prev + nextDirection;
      if (next < 0) return count - 1;
      if (next >= count) return 0;
      return next;
    });
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

        <AnimatePresence initial={false} custom={direction} mode="popLayout">
          <motion.div
            key={card.id}
            custom={direction}
            initial={{
              x: direction === 1 ? 80 : -80,
              y: 20,
              rotate: direction === 1 ? 3 : -3,
              opacity: 0,
            }}
            animate={{ x: 0, y: 0, rotate: 0, opacity: 1 }}
            exit={{
              x: direction === 1 ? -120 : 120,
              rotate: direction === 1 ? -4 : 4,
              opacity: 0,
            }}
            transition={{ type: "spring", stiffness: 380, damping: 32 }}
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
            className="relative z-10 rounded-[40px] bg-(--card-bg) px-7 py-8 text-center shadow-(--card-shadow) sm:px-8 sm:py-10"
          >
            <div className="mb-5">
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

            <div className="text-7xl leading-none">{card.emoji}</div>
            <div className="mt-6 text-4xl font-semibold tracking-tight text-(--text)">
              {card.word}
            </div>
            <div className="mt-4 text-lg leading-7 text-(--text) opacity-80">
              {card.phrase}
            </div>
          </motion.div>
        </AnimatePresence>
      </div>
    </div>
  );
}
