# Change: Add early-education word flashcards

## Why
The repo is currently a default Next.js starter page and does not implement the intended “one card, one emoji, one word, one sentence” learning experience for 3–6 year olds.
This change introduces a minimal, warm, swipeable flashcard experience with on-demand English TTS.

## What Changes
- Add a single-page flashcard experience driven by animal emoji data and a small curated content mapping (word + phrase).
- Add a `/api/tts` route that returns audio for “word → pause → phrase” playback.
- Add motion interactions: tap-to-speak with elastic scale feedback; swipe-left/right to change cards.
- Apply the project’s warm/rounded/minimal design tokens and responsive layout constraints.

## Non-goals
- No accounts, login, or personalization.
- No spaced repetition scheduling or long-term progress persistence.
- No multi-page navigation, settings panels, or content search.

## Impact
- Affected areas:
  - UI shell: `app/layout.tsx`, `app/globals.css`, `app/page.tsx`
  - New client components: Flashcard UI + progress indicator + volume replay button
  - New API route: `/api/tts`
  - New content data: `content.json` (or equivalent module)
- New dependencies (expected): `@emoji-mart/data`, `framer-motion`, `lucide-react`, `ai` (Vercel AI SDK), Google Gemini client SDK.

## Assumptions & Open Questions
1. **Gemini model/version**: The spec references “Gemini Flash 2.5” and also “Gemini 1.5/2.0 Flash”. Proposal assumes a “Gemini Flash” TTS-capable model available via the chosen Google SDK.
2. **Voice selection**: Use a single warm English voice (e.g. `en-US-Standard-C`) and slower speed `0.9`.
3. **Audio caching**: Proposal assumes we can start without persistent caching; optional in-memory caching may be added later if needed.
4. **Content source of truth**: `content.json` is the curated mapping. Emoji data is used to select which animals are eligible.

## Acceptance (high level)
- On mobile: a centered card fills the viewport comfortably with safe-area padding.
- On desktop: a 430px container is centered on a beige background.
- Tap card or volume icon plays TTS for the current card (word, pause, phrase).
- Swipe left/right changes the card with the specified motion behaviour and thresholds.
