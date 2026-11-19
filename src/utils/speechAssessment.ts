export interface SpeechPrompt {
  kind: 'word' | 'sentence';
  text: string;
}

interface AssessmentRequest {
  coreType: 'en.word_kid.score' | 'en.sent_kid.score';
  refText: string;
  rank: 100;
  attachAudioUrl: 1;
}

export interface Assessment {
  score: number;
  grade: 'retry' | 'good' | 'great';
  recordingUrl: string | null;
}

interface Credentials {
  applicationId: string;
  userId: string;
  warrantId: string;
}

interface SpeechEngine {
  startRecord(parameters: AssessmentRequest & { warrantId: string }): void;
  stopRecord(): void;
  cancelRecord(): void;
  destroyEngine(): void;
}

type SpeechEngineConstructor = new (options: Credentials & {
  logIsOpen: false;
  engineFirstInitDone(): void;
  engineBackResultDone(result: unknown): void;
  engineBackResultFail(): void;
  micForbidCallback(): void;
  JSSDKNotSupport(): void;
  noNetwork(): void;
}) => SpeechEngine;

declare global {
  interface Window {
    EngineEvaluat?: SpeechEngineConstructor;
  }
}

export function getAssessmentRequest(prompt: SpeechPrompt): AssessmentRequest {
  return {
    coreType: prompt.kind === 'word' ? 'en.word_kid.score' : 'en.sent_kid.score',
    refText: prompt.text,
    rank: 100,
    attachAudioUrl: 1,
  };
}

export function getAssessment(message: unknown): Assessment {
  const payload: unknown = typeof message === 'string' ? JSON.parse(message) : message;
  if (typeof payload !== 'object' || payload === null || !('result' in payload)) {
    throw new Error('No valid score was returned.');
  }
  const result = payload.result;
  const score = typeof result === 'object' && result !== null && 'overall' in result ? result.overall : null;
  if (typeof score !== 'number' || !Number.isFinite(score) || score < 0 || score > 100) {
    throw new Error('No valid score was returned.');
  }

  const appId = 'applicationId' in payload ? payload.applicationId : null;
  const recordId = 'recordId' in payload ? payload.recordId : null;
  const recordingUrl = typeof appId === 'string' && /^[\w-]+$/.test(appId)
    && typeof recordId === 'string' && /^[\w-]+$/.test(recordId)
    ? `https://files.cloud.ssapi.cn/${appId}/${recordId}.mp3`
    : null;
  return { score, grade: score < 60 ? 'retry' : score < 85 ? 'good' : 'great', recordingUrl };
}

async function authorize(signal: AbortSignal): Promise<Credentials> {
  const response = await fetch('/api/speak/authorize', {
    method: 'POST',
    signal: AbortSignal.any([signal, AbortSignal.timeout(10000)]),
  });
  if (response.status === 503 || response.status === 404) throw new Error('Speech scoring is unavailable.');
  if (!response.ok) throw new Error('Could not connect to speech scoring.');
  const payload: unknown = await response.json();
  if (typeof payload !== 'object' || payload === null
    || !('applicationId' in payload) || typeof payload.applicationId !== 'string'
    || !('userId' in payload) || typeof payload.userId !== 'string'
    || !('warrantId' in payload) || typeof payload.warrantId !== 'string') {
    throw new Error('Speech scoring is unavailable.');
  }
  return { applicationId: payload.applicationId, userId: payload.userId, warrantId: payload.warrantId };
}

let engineLoad: Promise<SpeechEngineConstructor> | undefined;

function loadEngine(): Promise<SpeechEngineConstructor> {
  if (window.EngineEvaluat) return Promise.resolve(window.EngineEvaluat);
  engineLoad ??= new Promise<SpeechEngineConstructor>((resolve, reject) => {
    const script = document.createElement('script');
    const fail = () => {
      window.clearTimeout(timeout);
      script.remove();
      reject(new Error('Speech scoring is unavailable.'));
    };
    const timeout = window.setTimeout(fail, 10000);
    script.src = `${import.meta.env.BASE_URL}sdk/engine.js`;
    script.onload = () => {
      if (!window.EngineEvaluat) return fail();
      window.clearTimeout(timeout);
      resolve(window.EngineEvaluat);
    };
    script.onerror = fail;
    document.head.appendChild(script);
  }).catch((error: unknown) => {
    engineLoad = undefined;
    throw error;
  });
  return engineLoad;
}

export async function assessSpeech(
  prompt: SpeechPrompt,
  signal: AbortSignal,
  callbacks: {
    onRecording(stop: () => void): void;
    onScoring(): void;
    onResult(result: Assessment): void;
    onError(message: string): void;
  },
) {
  const [credentials, Engine] = await Promise.all([authorize(signal), loadEngine()]);
  signal.throwIfAborted();

  let engine: SpeechEngine | undefined;
  let phase: 'starting' | 'recording' | 'scoring' | 'finished' = 'starting';
  let timer: number | undefined;

  function cleanup() {
    window.clearTimeout(timer);
    signal.removeEventListener('abort', cancel);
    const wasRecording = phase === 'recording';
    phase = 'finished';
    try {
      if (wasRecording) engine?.cancelRecord();
    } finally {
      engine?.destroyEngine();
    }
  }

  function cancel() {
    if (phase !== 'finished') cleanup();
  }

  function fail(message = 'Could not score this recording. Try again.') {
    if (phase === 'finished') return;
    cleanup();
    callbacks.onError(message);
  }

  function stop() {
    if (phase !== 'recording') return;
    phase = 'scoring';
    window.clearTimeout(timer);
    timer = window.setTimeout(() => fail(), 15000);
    callbacks.onScoring();
    try {
      engine?.stopRecord();
    } catch {
      fail();
    }
  }

  signal.addEventListener('abort', cancel, { once: true });
  timer = window.setTimeout(() => fail('Could not start the microphone. Try again.'), 30000);
  try {
    engine = new Engine({
      ...credentials,
      logIsOpen: false,
      engineFirstInitDone: () => queueMicrotask(() => {
        if (phase !== 'starting') return;
        phase = 'recording';
        window.clearTimeout(timer);
        timer = window.setTimeout(stop, prompt.kind === 'word' ? 6000 : 15000);
        callbacks.onRecording(stop);
        try {
          engine?.startRecord({ ...getAssessmentRequest(prompt), warrantId: credentials.warrantId });
        } catch {
          fail();
        }
      }),
      engineBackResultDone: (message) => {
        if (phase !== 'scoring') return;
        let result: Assessment;
        try {
          result = getAssessment(message);
        } catch {
          fail();
          return;
        }
        cleanup();
        callbacks.onResult(result);
      },
      engineBackResultFail: () => fail(),
      micForbidCallback: () => fail('Allow microphone access to record.'),
      JSSDKNotSupport: () => fail('Recording is unavailable in this browser.'),
      noNetwork: () => fail('Could not connect to speech scoring.'),
    });
  } catch {
    fail('Could not start speech scoring. Try again.');
  }
}
