# Tasks: Add early-education word flashcards

## 1. Setup
- [x] Add required dependencies: `@emoji-mart/data`, `framer-motion`, `lucide-react`, Google Cloud TTS SDK (`@google-cloud/text-to-speech`)
- [x] Add environment variables documentation (README or `.env.example`) for Google credentials

## 2. Data
- [x] Add curated `content.json` mapping (seed with ~10 common animals)
- [x] Implement runtime selector that filters emoji-mart `nature` category to only keys present in `content.json`

## 3. UI Shell
- [x] Update layout and global styles to match warm/rounded/minimal tokens
- [x] Implement responsive container: mobile full-height; desktop max width 430px with beige page background

## 4. Flashcard UI
- [x] Build `Flashcard` client component
- [x] Tap interaction: trigger TTS + scale to 0.95 with elastic rebound
- [x] Swipe interaction: drag x; threshold 100px; dragElastic 0.2; card exits and next enters from opposite side
- [x] Add progress indicator (thin bar or dots) at top
- [x] Add bottom replay icon button (Lucide `Volume2`) to replay TTS

## 5. TTS API
- [x] Add `/api/tts` route that accepts `{ word, phrase }` and returns audio
- [x] Client playback strategy: play word, wait 0.5s, then play phrase
- [x] Handle error states (API failure, missing text) with safe no-op UX (no extra modals)

## 6. Validation
- [x] `pnpm lint`
- [x] `pnpm build`
- [ ] Manual checks: mobile tap-to-speak, swipe switching, desktop 430px container, API returns playable audio (requires valid TTS credentials)
