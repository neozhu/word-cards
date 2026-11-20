const MAX_CACHE_SIZE = 64;

export function createPronunciationPlayer() {
  let controller: AbortController | null = null;
  let audio: HTMLAudioElement | null = null;
  let audioUrl: string | null = null;
  let finishAudio: (() => void) | null = null;
  let failAudio: ((error: Error) => void) | null = null;
  let queue = Promise.resolve();
  let generation = 0;
  let queuedCount = 0;
  const cache = new Map<string, Blob>();

  const getCachedBlob = (text: string): Blob | undefined => {
    const cached = cache.get(text);
    if (!cached) return undefined;
    cache.delete(text);
    cache.set(text, cached);
    return cached;
  };

  const setCachedBlob = (text: string, blob: Blob) => {
    if (cache.has(text)) {
      cache.delete(text);
    } else if (cache.size >= MAX_CACHE_SIZE) {
      const oldestKey = cache.keys().next().value;
      if (oldestKey !== undefined) {
        cache.delete(oldestKey);
      }
    }
    cache.set(text, blob);
  };

  const releaseActiveAudio = (outcome: 'resolve' | Error) => {
    const currentAudio = audio;
    const currentUrl = audioUrl;
    const resolve = finishAudio;
    const reject = failAudio;
    audio = null;
    audioUrl = null;
    finishAudio = null;
    failAudio = null;

    if (currentAudio) {
      currentAudio.onended = null;
      currentAudio.onerror = null;
      currentAudio.pause();
    }
    if (currentUrl) {
      URL.revokeObjectURL(currentUrl);
    }
    if (outcome === 'resolve') {
      resolve?.();
    } else {
      reject?.(outcome);
    }
  };

  const stop = () => {
    generation += 1;
    queue = Promise.resolve();
    queuedCount = 0;
    controller?.abort();
    controller = null;
    releaseActiveAudio('resolve');
  };

  const fetchAudioBlob = async (text: string, signal: AbortSignal): Promise<Blob> => {
    const cached = getCachedBlob(text);
    if (cached) return cached;

    const response = await fetch('/api/speech', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        input: text,
        model: 'tts-1',
        voice: 'af_heart',
        speed: 1,
        response_format: 'wav',
      }),
      signal,
    });
    if (!response.ok) throw new Error('Speech request failed');
    const blob = await response.blob();
    if (!signal.aborted && blob.size > 0) {
      setCachedBlob(text, blob);
    }
    return blob;
  };

  const speak = async (text: string, waitUntilEnded: boolean) => {
    const request = new AbortController();
    controller = request;
    try {
      const blob = await fetchAudioBlob(text, request.signal);
      if (request.signal.aborted) return;

      const url = URL.createObjectURL(blob);
      const currentAudio = new Audio(url);
      audioUrl = url;
      audio = currentAudio;
      const ended = new Promise<void>((resolve, reject) => {
        finishAudio = resolve;
        failAudio = reject;
      });
      currentAudio.onended = () => {
        if (audio === currentAudio) {
          releaseActiveAudio('resolve');
        }
      };
      currentAudio.onerror = () => {
        if (audio === currentAudio) {
          releaseActiveAudio(new Error('Audio playback failed'));
        }
      };
      await currentAudio.play();
      if (waitUntilEnded) await ended;
    } catch (error) {
      if (request.signal.aborted) return;
      if (controller === request) {
        controller = null;
        releaseActiveAudio('resolve');
      }
      throw error;
    } finally {
      if (controller === request) {
        controller = null;
      }
    }
  };

  const play = (text: string) => {
    stop();
    return speak(text, true);
  };

  const enqueue = (text: string) => {
    if (queuedCount === 0) stop();
    queuedCount += 1;
    const queuedGeneration = generation;
    const next = queue
      .catch(() => {})
      .then(() => {
        if (queuedGeneration === generation) return speak(text, true);
      })
      .finally(() => {
        if (queuedGeneration === generation) queuedCount -= 1;
      });
    queue = next;
    return next;
  };

  return { play, enqueue, stop };
}
