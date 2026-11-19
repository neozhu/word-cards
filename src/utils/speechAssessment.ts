export interface SpeechPrompt {
  kind: 'word' | 'sentence';
  text: string;
}

interface AssessmentRequest {
  coreType: 'en.word_kid.score' | 'en.sent_kid.score';
  refText: string;
  rank: 100;
  attachAudioUrl: 0;
}

export interface Assessment {
  score: number;
  grade: 'retry' | 'good' | 'great';
}

interface Credentials {
  applicationId: string;
  userId: string;
  warrantId: string;
}

interface SpeechEngine {
  configAudio(audio: { sampleRate: number; channel: number; sampleBytes: number; audioType: 'wav' }): void;
  start(parameters: AssessmentRequest & { warrantId: string }): void;
  feed(data: string): void;
  stop(): void;
  destroyEngine(): void;
}

type SpeechEngineConstructor = new (options: Credentials & {
  logIsOpen: false;
  engineFirstInitDone(): void;
  engineBackResultDone(result: unknown, complete?: boolean): void;
  engineBackResultFail(): void;
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
    attachAudioUrl: 0,
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

  return { score, grade: score < 65 ? 'retry' : score < 85 ? 'good' : 'great' };
}

export function getDemoAssessment(duration: number, random = Math.random): Assessment {
  const [minimum, maximum] = duration < 650 ? [48, 61] : duration < 1150 ? [72, 82] : [88, 98];
  const score = minimum + Math.floor(random() * (maximum - minimum + 1));
  return { score, grade: score < 65 ? 'retry' : score < 85 ? 'good' : 'great' };
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
  engineLoad ??= new Promise<SpeechEngineConstructor>((resolve, reject) => {
    const frame = document.createElement('iframe');
    frame.hidden = true;
    // Some SDK versions request the microphone during initialization, even for file uploads.
    frame.allow = "microphone 'none'";
    const fail = () => {
      window.clearTimeout(timeout);
      frame.remove();
      reject(new Error('Speech scoring is unavailable.'));
    };
    const timeout = window.setTimeout(fail, 10000);
    const scriptURL = new URL(`${import.meta.env.BASE_URL}sdk/engine.js`, window.location.href);
    frame.srcdoc = `<!doctype html><script src="${scriptURL.href}"></script>`;
    frame.onload = () => {
      const Engine = frame.contentWindow?.EngineEvaluat;
      if (!Engine) return fail();
      window.clearTimeout(timeout);
      resolve(Engine);
    };
    frame.onerror = fail;
    document.body.appendChild(frame);
  }).catch((error: unknown) => {
    engineLoad = undefined;
    throw error;
  });
  return engineLoad;
}

const evaluationSampleRate = 16000;

async function toWave(recording: Blob): Promise<Uint8Array> {
  const decoder = new OfflineAudioContext(1, 1, evaluationSampleRate);
  const audio = await decoder.decodeAudioData(await recording.arrayBuffer());
  const channels = Array.from({ length: audio.numberOfChannels }, (_, channel) => audio.getChannelData(channel));
  const dataLength = audio.length * 2;
  const pcm = new DataView(new ArrayBuffer(44 + dataLength));
  pcm.setUint32(0, 0x52494646); // RIFF
  pcm.setUint32(4, 36 + dataLength, true);
  pcm.setUint32(8, 0x57415645); // WAVE
  pcm.setUint32(12, 0x666d7420); // fmt chunk
  pcm.setUint32(16, 16, true);
  pcm.setUint16(20, 1, true);
  pcm.setUint16(22, 1, true);
  pcm.setUint32(24, evaluationSampleRate, true);
  pcm.setUint32(28, evaluationSampleRate * 2, true);
  pcm.setUint16(32, 2, true);
  pcm.setUint16(34, 16, true);
  pcm.setUint32(36, 0x64617461); // data chunk
  pcm.setUint32(40, dataLength, true);
  for (let index = 0; index < audio.length; index++) {
    const sample = channels.reduce((sum, channel) => sum + channel[index], 0) / channels.length;
    const clamped = Math.max(-1, Math.min(1, sample));
    pcm.setInt16(44 + index * 2, clamped * (clamped < 0 ? 32768 : 32767), true);
  }
  return new Uint8Array(pcm.buffer);
}

export async function assessSpeech(prompt: SpeechPrompt, recording: Blob, signal: AbortSignal): Promise<Assessment> {
  const [credentials, Engine, wave] = await Promise.all([authorize(signal), loadEngine(), toWave(recording)]);
  signal.throwIfAborted();

  return new Promise<Assessment>((resolve, reject) => {
    let engine: SpeechEngine | undefined;
    let finished = false;
    const timer = window.setTimeout(fail, 15000);

    function finish() {
      if (finished) return false;
      finished = true;
      window.clearTimeout(timer);
      signal.removeEventListener('abort', fail);
      engine?.destroyEngine();
      return true;
    }

    function fail() {
      if (finish()) reject(new Error('Could not score this recording.'));
    }

    signal.addEventListener('abort', fail, { once: true });
    try {
      engine = new Engine({
        ...credentials,
        logIsOpen: false,
        engineFirstInitDone: () => queueMicrotask(() => {
          if (finished || !engine) return;
          try {
            engine.configAudio({ sampleRate: evaluationSampleRate, channel: 1, sampleBytes: 2, audioType: 'wav' });
            engine.start({
              ...getAssessmentRequest(prompt), warrantId: credentials.warrantId,
            });
            for (let offset = 0; offset < wave.length; offset += 8192) {
              engine.feed(btoa(String.fromCharCode(...wave.subarray(offset, offset + 8192))));
            }
            engine.stop();
          } catch {
            fail();
          }
        }),
        engineBackResultDone: (message, complete) => {
          if (finished || complete === false) return;
          try {
            const result = getAssessment(message);
            if (finish()) resolve(result);
          } catch {
            fail();
          }
        },
        engineBackResultFail: () => queueMicrotask(fail),
        JSSDKNotSupport: () => queueMicrotask(fail),
        noNetwork: () => queueMicrotask(fail),
      });
    } catch {
      fail();
    }
  });
}
