export interface SpeechRecording {
  audio: Blob | null;
  duration: number;
  unavailableReason?: 'unsupported' | 'permission-denied' | 'device-error';
}

export function recordSpeech({ limit, signal, onStarted, onChecking, onLevel }: {
  limit: number;
  signal: AbortSignal;
  onStarted?: () => void;
  onChecking: () => void;
  onLevel: (level: number | null) => void;
}) {
  let stop = () => {};
  const result = new Promise<SpeechRecording | null>((resolve) => {
    let phase: 'pending' | 'recording' | 'stopping' | 'finished' = 'pending';
    let startedAt = performance.now();
    let duration = 0;
    let demoReason: SpeechRecording['unavailableReason'];
    let timer: number | undefined;
    let stopFallbackTimer: number | undefined;
    let meter: number | undefined;
    let context: AudioContext | undefined;
    let stream: MediaStream | undefined;
    let recorder: MediaRecorder | undefined;
    const chunks: Blob[] = [];

    function release() {
      window.clearTimeout(timer);
      window.clearTimeout(stopFallbackTimer);
      window.clearInterval(meter);
      stream?.getTracks().forEach((track) => track.stop());
      if (context) void context.close().catch(() => {});
      stream = undefined;
      context = undefined;
    }

    function finish(recording: SpeechRecording | null) {
      if (phase === 'finished') return;
      phase = 'finished';
      release();
      signal.removeEventListener('abort', cancel);
      resolve(recording);
    }

    function cancel() {
      finish(null);
      if (recorder?.state === 'recording') {
        try {
          recorder.stop();
        } catch {
          // Ignore recorder stop errors during abort
        }
      }
    }

    stop = () => {
      if (phase === 'stopping' || phase === 'finished') return;
      if (phase === 'pending') {
        finish(null);
        return;
      }
      duration = performance.now() - startedAt;
      phase = 'stopping';
      window.clearTimeout(timer);
      window.clearInterval(meter);
      onChecking();
      if (recorder?.state === 'recording') {
        stopFallbackTimer = window.setTimeout(() => {
          finish({ audio: null, duration, unavailableReason: demoReason });
        }, 1500);
        try {
          recorder.stop();
        } catch {
          finish({ audio: null, duration, unavailableReason: demoReason });
        }
      } else {
        finish({ audio: null, duration, unavailableReason: demoReason });
      }
    };

    function startClock() {
      phase = 'recording';
      startedAt = performance.now();
      onStarted?.();
      timer = window.setTimeout(stop, limit);
    }

    function demo(reason: 'unsupported' | 'device-error') {
      if (phase !== 'pending') return;
      demoReason = reason;
      release();
      onLevel(null);
      startClock();
    }

    function monitor(input: MediaStream) {
      try {
        context = new AudioContext();
        const analyser = context.createAnalyser();
        const source = context.createMediaStreamSource(input);
        source.connect(analyser);
        analyser.fftSize = 256;
        const samples = new Float32Array(analyser.fftSize);
        void context.resume().catch(() => {});
        meter = window.setInterval(() => {
          analyser.getFloatTimeDomainData(samples);
          const rms = Math.sqrt(samples.reduce((sum, sample) => sum + sample * sample, 0) / samples.length);
          onLevel(Math.min(1, rms * 6));
        }, 80);
      } catch {
        onLevel(null);
      }
    }

    if (signal.aborted) return finish(null);
    signal.addEventListener('abort', cancel, { once: true });
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      return demo('unsupported');
    }

    void navigator.mediaDevices
      .getUserMedia({ audio: { channelCount: 1, echoCancellation: true } })
      .then((input) => {
        if (phase !== 'pending') {
          input.getTracks().forEach((track) => track.stop());
          return;
        }
        stream = input;
        const mediaRecorder = new MediaRecorder(input);
        recorder = mediaRecorder;
        mediaRecorder.ondataavailable = (event) => {
          if (phase !== 'finished' && event.data.size > 0) chunks.push(event.data);
        };
        mediaRecorder.onstop = () => {
          if (phase !== 'stopping') return;
          const audio = chunks.length ? new Blob(chunks, { type: mediaRecorder.mimeType }) : null;
          finish({ audio, duration });
        };
        mediaRecorder.onerror = () => {
          if (phase === 'recording') {
            duration = performance.now() - startedAt;
            onChecking();
          }
          if (phase !== 'finished') {
            finish({ audio: null, duration, unavailableReason: 'device-error' });
          }
        };
        mediaRecorder.start();
        startClock();
        monitor(input);
      })
      .catch((error: unknown) => {
        if (phase !== 'pending') return;
        const name =
          typeof error === 'object' && error !== null && 'name' in error
            ? String((error as { name: unknown }).name)
            : '';
        if (name === 'NotAllowedError' || name === 'PermissionDeniedError') {
          finish({ audio: null, duration: 0, unavailableReason: 'permission-denied' });
          return;
        }
        demo('device-error');
      });
  });
  return { stop: () => stop(), result };
}
