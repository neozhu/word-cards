export function createPronunciationPlayer() {
  let controller: AbortController | null = null;
  let audio: HTMLAudioElement | null = null;
  let audioUrl: string | null = null;
  let finishAudio: (() => void) | null = null;
  let queue = Promise.resolve();
  let generation = 0;
  let queuedCount = 0;

  const stop = () => {
    generation += 1;
    queue = Promise.resolve();
    queuedCount = 0;
    controller?.abort();
    controller = null;
    audio?.pause();
    audio = null;
    finishAudio?.();
    finishAudio = null;
    if (audioUrl) URL.revokeObjectURL(audioUrl);
    audioUrl = null;
  };

  const speak = async (text: string, waitUntilEnded: boolean) => {
    const request = new AbortController();
    controller = request;
    try {
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
        signal: request.signal,
      });
      if (!response.ok) throw new Error('Speech request failed');
      const blob = await response.blob();
      if (request.signal.aborted) return;

      audioUrl = URL.createObjectURL(blob);
      const currentAudio = new Audio(audioUrl);
      audio = currentAudio;
      const ended = new Promise<void>((resolve) => { finishAudio = resolve; });
      currentAudio.onended = () => {
        if (audio === currentAudio) {
          audio = null;
          if (audioUrl) URL.revokeObjectURL(audioUrl);
          audioUrl = null;
          finishAudio?.();
          finishAudio = null;
        }
      };
      await currentAudio.play();
      if (waitUntilEnded) await ended;
    } catch (error) {
      if (request.signal.aborted) return;
      if (controller === request) stop();
      throw error;
    }
  };

  const play = (text: string) => {
    stop();
    return speak(text, false);
  };

  const enqueue = (text: string) => {
    if (queuedCount === 0) stop();
    queuedCount += 1;
    const queuedGeneration = generation;
    const next = queue.catch(() => {}).then(() => {
      if (queuedGeneration === generation) return speak(text, true);
    }).finally(() => {
      if (queuedGeneration === generation) queuedCount -= 1;
    });
    queue = next;
    return next;
  };

  return { play, enqueue, stop };
}
