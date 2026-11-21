export interface SpeechPrompt {
  kind: 'word' | 'sentence';
  text: string;
}

export interface Assessment {
  score: number;
  grade: 'retry' | 'good' | 'great';
}

function gradeScore(score: number): Assessment {
  return { score, grade: score < 80 ? 'retry' : score < 85 ? 'good' : 'great' };
}

export function getAssessment(payload: unknown): Assessment | null {
  if (typeof payload === 'object' && payload !== null && 'status' in payload && 'reliable' in payload && 'scores' in payload) {
    if (payload.status === 'uncertain' && payload.reliable === false && payload.scores === null) {
      return null;
    }
    const { scores } = payload;
    if (payload.status === 'assessed' && payload.reliable === true && typeof scores === 'object' && scores !== null && 'overall' in scores) {
      const score = scores.overall;
      if (typeof score === 'number' && Number.isFinite(score) && score >= 0 && score <= 100) {
        return gradeScore(score);
      }
    }
  }
  throw new Error('No valid score was returned.');
}

export function getDemoAssessment(duration: number, random = Math.random): Assessment {
  const [minimum, maximum] = duration < 650 ? [48, 61] : duration < 1150 ? [80, 84] : [88, 98];
  return gradeScore(minimum + Math.floor(random() * (maximum - minimum + 1)));
}

const evaluationSampleRate = 16000;

async function toWave(recording: Blob): Promise<Blob> {
  const decoder = new OfflineAudioContext(1, 1, evaluationSampleRate);
  const decoded = await decoder.decodeAudioData(await recording.arrayBuffer());
  let audio = decoded;
  if (decoded.sampleRate !== evaluationSampleRate) {
    const targetLength = Math.max(1, Math.ceil(decoded.duration * evaluationSampleRate));
    const resampler = new OfflineAudioContext(1, targetLength, evaluationSampleRate);
    const source = resampler.createBufferSource();
    source.buffer = decoded;
    source.connect(resampler.destination);
    source.start(0);
    audio = await resampler.startRendering();
  }
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
  return new Blob([pcm.buffer], { type: 'audio/wav' });
}

const recordingExtensions: ReadonlyMap<string, string> = new Map([
  ['audio/webm', 'webm'],
  ['video/webm', 'webm'],
  ['audio/ogg', 'ogg'],
  ['audio/wav', 'wav'],
  ['audio/mpeg', 'mp3'],
  ['audio/flac', 'flac'],
]);

export async function assessSpeech(prompt: SpeechPrompt, recording: Blob, signal: AbortSignal): Promise<Assessment | null> {
  signal.throwIfAborted();
  const mediaType = recording.type.split(';', 1)[0];
  const extension = recordingExtensions.get(mediaType);
  // Some browsers record MP4, which OpenPronounce does not accept.
  const audio = extension
    ? recording.slice(0, recording.size, mediaType === 'video/webm' ? 'audio/webm' : mediaType)
    : await toWave(recording);
  signal.throwIfAborted();

  const form = new FormData();
  form.set('audio', audio, `recording.${extension ?? 'wav'}`);
  form.set('text', prompt.text);
  form.set('mode', prompt.kind);

  const response = await fetch('/api/speak/assess', {
    method: 'POST',
    body: form,
    signal: AbortSignal.any([signal, AbortSignal.timeout(90_000)]),
  });
  if (response.status === 422) {
    return null;
  }
  if (!response.ok) {
    throw new Error('Could not score this recording.');
  }
  return getAssessment(await response.json());
}
