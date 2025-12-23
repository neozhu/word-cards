import { GoogleGenAI } from "@google/genai";
import { NextResponse } from "next/server";

export const runtime = "nodejs";

export const maxDuration = 30;

type TtsCacheEntry = {
  base64: string;
  createdAt: number;
};

type TtsCacheState = {
  audioByKey: Map<string, TtsCacheEntry>;
  inflightByKey: Map<string, Promise<string>>;
};

declare global {
  var __wordCardsTtsCache: TtsCacheState | undefined;
}

const CACHE_MAX_ENTRIES = 400;

function getCache(): TtsCacheState {
  if (!globalThis.__wordCardsTtsCache) {
    globalThis.__wordCardsTtsCache = {
      audioByKey: new Map<string, TtsCacheEntry>(),
      inflightByKey: new Map<string, Promise<string>>(),
    };
  }
  return globalThis.__wordCardsTtsCache;
}

function makeCacheKey(voice: string, text: string): string {
  // Normalize whitespace to increase hit rate.
  const normalizedText = text.trim().replace(/\s+/g, " ");
  return `${voice}::${normalizedText}`;
}

function remember(cache: TtsCacheState, key: string, base64: string) {
  cache.audioByKey.set(key, { base64, createdAt: Date.now() });
  while (cache.audioByKey.size > CACHE_MAX_ENTRIES) {
    const oldestKey = cache.audioByKey.keys().next().value as string | undefined;
    if (!oldestKey) break;
    cache.audioByKey.delete(oldestKey);
  }
}

type TtsRequestBody = {
  word?: string;
  phrase?: string;
};

function getGeminiApiKey(): string | null {
  const key = process.env.GOOGLE_GENERATIVE_AI_API_KEY;
  return key && key.trim().length > 0 ? key.trim() : null;
}

function createWavHeader(
  dataLength: number,
  sampleRate = 24000,
  numChannels = 1,
  bitsPerSample = 16,
) {
  const buffer = Buffer.alloc(44);
  let offset = 0;

  buffer.write("RIFF", offset);
  offset += 4;
  buffer.writeUInt32LE(36 + dataLength, offset);
  offset += 4;
  buffer.write("WAVE", offset);
  offset += 4;

  buffer.write("fmt ", offset);
  offset += 4;
  buffer.writeUInt32LE(16, offset);
  offset += 4;
  buffer.writeUInt16LE(1, offset);
  offset += 2;
  buffer.writeUInt16LE(numChannels, offset);
  offset += 2;
  buffer.writeUInt32LE(sampleRate, offset);
  offset += 4;
  buffer.writeUInt32LE((sampleRate * numChannels * bitsPerSample) / 8, offset);
  offset += 4;
  buffer.writeUInt16LE((numChannels * bitsPerSample) / 8, offset);
  offset += 2;
  buffer.writeUInt16LE(bitsPerSample, offset);
  offset += 2;

  buffer.write("data", offset);
  offset += 4;
  buffer.writeUInt32LE(dataLength, offset);

  return buffer;
}

async function synthesizeWavBase64(text: string, voice: string) {
  const apiKey = getGeminiApiKey();
  if (!apiKey) {
    throw new Error("Missing GOOGLE_GENERATIVE_AI_API_KEY environment variable");
  }

  const ai = new GoogleGenAI({ apiKey });

  const response = await ai.models.generateContent({
    model: "gemini-2.5-flash-preview-tts",
    contents: [{ parts: [{ text }] }],
    config: {
      responseModalities: ["AUDIO"],
      speechConfig: {
        voiceConfig: {
          prebuiltVoiceConfig: { voiceName: voice },
        },
      },
    },
  });

  const audioData =
    response.candidates?.[0]?.content?.parts?.[0]?.inlineData?.data;

  if (!audioData) {
    throw new Error("No audio data generated");
  }

  const pcmBuffer = Buffer.from(audioData, "base64");
  const wavHeader = createWavHeader(pcmBuffer.length);
  const wavBuffer = Buffer.concat([wavHeader, pcmBuffer]);

  return wavBuffer.toString("base64");
}

async function getOrSynthesizeWavBase64(text: string, voice: string) {
  const cache = getCache();
  const key = makeCacheKey(voice, text);

  const cached = cache.audioByKey.get(key);
  if (cached) return cached.base64;

  const inflight = cache.inflightByKey.get(key);
  if (inflight) return inflight;

  const promise = (async () => {
    try {
      const base64 = await synthesizeWavBase64(text, voice);
      remember(cache, key, base64);
      return base64;
    } finally {
      cache.inflightByKey.delete(key);
    }
  })();

  cache.inflightByKey.set(key, promise);
  return promise;
}

export async function POST(req: Request) {
  let body: TtsRequestBody;
  try {
    body = (await req.json()) as TtsRequestBody;
  } catch {
    return NextResponse.json({ error: "Invalid JSON" }, { status: 400 });
  }

  const word = (body.word || "").trim();
  const phrase = (body.phrase || "").trim();

  if (!word || !phrase) {
    return NextResponse.json(
      { error: "Missing required fields: word, phrase" },
      { status: 400 },
    );
  }

  const voice = (process.env.TTS_VOICE_NAME || "Kore").trim() || "Kore";

  try {
    const [wordAudioBase64, phraseAudioBase64] = await Promise.all([
      getOrSynthesizeWavBase64(word, voice),
      getOrSynthesizeWavBase64(phrase, voice),
    ]);

    return NextResponse.json({
      mimeType: "audio/wav",
      wordAudioBase64,
      phraseAudioBase64,
    });
  } catch (err) {
    const message = err instanceof Error ? err.message : "TTS failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
