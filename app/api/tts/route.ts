import { NextResponse } from "next/server";
import content from "@/content.json";
import { createHash } from "node:crypto";
import { BlobNotFoundError, head, put } from "@vercel/blob";

export const runtime = "nodejs";

export const maxDuration = 30;

// Used as part of the persistent cache key (Vercel Blob pathname hash).
// Change this when switching engines/settings to avoid collisions.
const TTS_MODEL = "piper-http-v1";
const BLOB_CACHE_MAX_AGE_SECONDS = 60 * 60 * 24 * 365;

type TtsCacheEntry = {
  wav: Buffer;
  createdAt: number;
};

type TtsCacheState = {
  audioByKey: Map<string, TtsCacheEntry>;
  inflightByKey: Map<string, Promise<Buffer>>;
};

declare global {
  var __wordCardsTtsCache: TtsCacheState | undefined;
}

const CACHE_MAX_ENTRIES = 400;

function getCache(): TtsCacheState {
  if (!globalThis.__wordCardsTtsCache) {
    globalThis.__wordCardsTtsCache = {
      audioByKey: new Map<string, TtsCacheEntry>(),
      inflightByKey: new Map<string, Promise<Buffer>>(),
    };
  }
  return globalThis.__wordCardsTtsCache;
}

function makeCacheKey(voice: string, text: string): string {
  // Normalize whitespace to increase hit rate.
  const normalizedText = text.trim().replace(/\s+/g, " ");
  return `${voice}::${normalizedText}`;
}

function remember(cache: TtsCacheState, key: string, wav: Buffer) {
  cache.audioByKey.set(key, { wav, createdAt: Date.now() });
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

type ContentEntry = {
  word: string;
  phrase: string;
};

function makeStrongEtag(input: string): string {
  // Strong ETag based on inputs (not response bytes) to avoid hashing large base64.
  // Good enough for cache validation and dedupe.
  const digest = createHash("sha256").update(input).digest("hex");
  return `"${digest}"`;
}

function toSafePathSegment(input: string): string {
  return input
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "-")
    .replace(/[^a-z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^[-.]+|[-.]+$/g, "")
    .slice(0, 80);
}

function makeBlobPathname(params: {
  id: string;
  voice: string;
  kind: "word" | "phrase";
  text: string;
}): string {
  const normalizedText = params.text.trim().replace(/\s+/g, " ");
  const voice = toSafePathSegment(params.voice) || "voice";
  const id = toSafePathSegment(params.id) || "card";
  const hash = createHash("sha256")
    .update(`${TTS_MODEL}::${params.voice}::${normalizedText}`)
    .digest("hex")
    .slice(0, 16);

  // Versioned prefix so we can change format later without collisions.
  return `tts/v1/${voice}/${id}/${params.kind}-${hash}.wav`;
}

async function getOrCreateBlobUrl(params: {
  id: string;
  voice: string;
  kind: "word" | "phrase";
  text: string;
}): Promise<string> {
  const pathname = makeBlobPathname(params);

  try {
    const meta = await head(pathname);
    return meta.url;
  } catch (err) {
    if (!(err instanceof BlobNotFoundError)) {
      throw err;
    }
  }

  // Miss: generate once, then upload.
  const wavBuffer = await getOrSynthesizeWavBuffer(params.text, params.voice);

  try {
    const uploaded = await put(pathname, wavBuffer, {
      access: "public",
      addRandomSuffix: false,
      allowOverwrite: false,
      contentType: "audio/wav",
      cacheControlMaxAge: BLOB_CACHE_MAX_AGE_SECONDS,
    });
    return uploaded.url;
  } catch {
    // Likely a race where another request uploaded first.
    const meta = await head(pathname);
    return meta.url;
  }
}

function withCacheHeaders(res: NextResponse, etagSeed: string) {
  res.headers.set("ETag", makeStrongEtag(etagSeed));
  // Enable browser + CDN caching. TTS is deterministic enough for flashcards.
  res.headers.set(
    "Cache-Control",
    "public, max-age=604800, s-maxage=604800, stale-while-revalidate=86400",
  );
  return res;
}

function getVoiceName(): string {
  const voice = (
    process.env.PIPER_TTS_VOICE_NAME ||
    process.env.TTS_VOICE_NAME ||
    "en_US-lessac-high"
  ).trim();
  return voice || "en_US-lessac-high";
}

function lookupById(id: string): { word: string; phrase: string } | null {
  const entry = (content as unknown as Record<string, ContentEntry>)[id];
  if (!entry) return null;
  const word = (entry.word || "").trim();
  const phrase = (entry.phrase || "").trim();
  if (!word || !phrase) return null;
  return { word, phrase };
}

function getPiperTtsUrl(): string {
  const url = (process.env.PIPER_TTS_URL || "https://tts.blazorserver.com/v1/audio/speech").trim();
  if (!url) {
    throw new Error("Missing PIPER_TTS_URL environment variable");
  }
  try {
    // Validate absolute URL.
    const parsed = new URL(url);
    void parsed;
  } catch {
    throw new Error("Invalid PIPER_TTS_URL (must be an absolute URL)");
  }
  return url;
}

function getPiperModelName(): string {
  return (process.env.PIPER_TTS_MODEL || "piper").trim() || "piper";
}

function looksLikeWav(buffer: Buffer): boolean {
  if (buffer.length < 12) return false;
  return (
    buffer.toString("ascii", 0, 4) === "RIFF" &&
    buffer.toString("ascii", 8, 12) === "WAVE"
  );
}

async function synthesizeWavBuffer(text: string, voice: string) {
  const endpoint = getPiperTtsUrl();
  const model = getPiperModelName();

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 25_000);

  let res: Response;
  try {
    res = await fetch(endpoint, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({ model, voice, input: text }),
      signal: controller.signal,
      // This is a server-side request; don't cache here.
      cache: "no-store",
    });
  } finally {
    clearTimeout(timeout);
  }

  if (!res.ok) {
    const contentType = res.headers.get("content-type") || "";
    let detail = "";
    try {
      if (contentType.includes("application/json")) {
        const json = (await res.json()) as { error?: unknown; message?: unknown };
        detail =
          typeof json.error === "string"
            ? json.error
            : typeof json.message === "string"
              ? json.message
              : "";
      } else {
        detail = (await res.text()).slice(0, 300);
      }
    } catch {
      // Ignore parse errors.
    }
    throw new Error(
      `Piper TTS error (${res.status}): ${detail || res.statusText || "Request failed"}`,
    );
  }

  const wav = Buffer.from(await res.arrayBuffer());
  if (!looksLikeWav(wav)) {
    throw new Error("Unexpected TTS response (expected WAV audio)");
  }
  return wav;
}

async function getOrSynthesizeWavBuffer(text: string, voice: string) {
  const cache = getCache();
  const key = makeCacheKey(voice, text);

  const cached = cache.audioByKey.get(key);
  if (cached) return cached.wav;

  const inflight = cache.inflightByKey.get(key);
  if (inflight) return inflight;

  const promise = (async () => {
    try {
      const wav = await synthesizeWavBuffer(text, voice);
      remember(cache, key, wav);
      return wav;
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

  const voice = getVoiceName();

  try {
    const [wordAudioUrl, phraseAudioUrl] = await Promise.all([
      getOrCreateBlobUrl({ id: "adhoc", voice, kind: "word", text: word }),
      getOrCreateBlobUrl({
        id: "adhoc",
        voice,
        kind: "phrase",
        text: phrase,
      }),
    ]);

    const res = NextResponse.json({
      mimeType: "audio/wav",
      wordAudioUrl,
      phraseAudioUrl,
    });
    return withCacheHeaders(res, `${voice}::${word}::${phrase}`);
  } catch (err) {
    console.error("/api/tts Piper TTS error", err);
    const message = err instanceof Error ? err.message : "TTS failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function GET(req: Request) {
  const url = new URL(req.url);
  const id = (url.searchParams.get("id") || "").trim();

  if (!id) {
    return NextResponse.json(
      { error: "Missing required query: id" },
      { status: 400 },
    );
  }

  const entry = lookupById(id);
  if (!entry) {
    return NextResponse.json(
      { error: "Unknown flashcard id" },
      { status: 404 },
    );
  }

  const voice = getVoiceName();
  const etagSeed = `${voice}::${id}::${entry.word}::${entry.phrase}`;
  const ifNoneMatch = req.headers.get("if-none-match");
  const etag = makeStrongEtag(etagSeed);
  if (ifNoneMatch && ifNoneMatch === etag) {
    return new NextResponse(null, {
      status: 304,
      headers: {
        ETag: etag,
        "Cache-Control":
          "public, max-age=604800, s-maxage=604800, stale-while-revalidate=86400",
      },
    });
  }

  try {
    const [wordAudioUrl, phraseAudioUrl] = await Promise.all([
      getOrCreateBlobUrl({ id, voice, kind: "word", text: entry.word }),
      getOrCreateBlobUrl({ id, voice, kind: "phrase", text: entry.phrase }),
    ]);

    const res = NextResponse.json({
      mimeType: "audio/wav",
      wordAudioUrl,
      phraseAudioUrl,
    });
    return withCacheHeaders(res, etagSeed);
  } catch (err) {
    console.error("/api/tts Piper TTS error", err);
    const message = err instanceof Error ? err.message : "TTS failed";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
