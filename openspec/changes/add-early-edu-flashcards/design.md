# Design Notes: Early-education word flashcards

## Goals
- Minimal single-screen learning loop: see → tap → hear → swipe → repeat.
- Keep UI warm, rounded, and uncluttered.
- Keep data pipeline simple and deterministic.

## Data Model
- `@emoji-mart/data` provides the emoji inventory (animals category).
- `content.json` is the curated teaching content (capitalized `word`, short `phrase`).
- Runtime selection rule: only show emoji IDs that exist in `content.json`.
  - This avoids showing animals without a phrase.
  - It keeps future content expansion a content-only change.

## UI Architecture
- Single route: `/`.
- A client component owns card index state, motion gestures, and audio playback.
- Keep layout concerns in `app/layout.tsx` and `app/globals.css` via CSS variables + Tailwind theme mapping.

## Motion
- Framer Motion drives:
  - Tap feedback: scale down to `0.95` with spring.
  - Swipe: `drag="x"`, threshold `100px`, `dragElastic: 0.2`.
  - Enter/exit transitions to simulate a light “shuffle” (small rotation + horizontal offset).

## TTS
- Server route `/api/tts` produces audio for requested text.
- Client sequence: request/receive audio for word and phrase (or one combined request, depending on SDK), then play with a 0.5s pause.
- Start minimal: no persistent caching and no background prefetch. If latency is too high, add simple cache later.

## Risks & Mitigations
- SDK capability mismatch (model/voice availability): keep API contract stable and swap provider details behind `/api/tts`.
- Mobile autoplay restrictions: require user gesture (tap) to start playback; reuse same gesture for the initial play.
