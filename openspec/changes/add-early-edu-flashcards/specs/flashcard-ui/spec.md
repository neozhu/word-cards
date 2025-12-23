## ADDED Requirements

### Requirement: Flashcard presents emoji, word, and phrase
The system SHALL present a single flashcard at a time, containing one emoji, one word, and one sentence.

#### Scenario: Card content
- **GIVEN** a flashcard is active
- **WHEN** it is rendered
- **THEN** an emoji is displayed prominently
- **AND** the English word is displayed in large text
- **AND** a short phrase is displayed below the word

### Requirement: Tap to speak with elastic feedback
The system SHALL speak the word and phrase when the user taps the card, and provide a tactile visual response.

#### Scenario: Tap triggers TTS and scale
- **GIVEN** a flashcard is active
- **WHEN** the user taps/clicks the card
- **THEN** TTS playback is triggered for the current word and phrase
- **AND** the card animates to `scale: 0.95` and rebounds with a spring-like feel

### Requirement: Swipe to switch cards
The system SHALL allow the user to switch cards by swiping horizontally.

#### Scenario: Swipe changes card
- **GIVEN** a flashcard is active
- **WHEN** the user drags horizontally more than 100px
- **THEN** the current card animates off-screen
- **AND** the next card enters from the opposite side

#### Scenario: Swipe elasticity
- **GIVEN** the user drags the card horizontally
- **WHEN** the drag is in progress
- **THEN** the drag elasticity is limited (equivalent to `dragElastic: 0.2`)

### Requirement: Minimal progress indicator and replay control
The system SHALL include only minimal UI affordances: a subtle progress indicator and a replay control.

#### Scenario: Progress indicator
- **GIVEN** there are N cards available
- **WHEN** the user views a card at index i
- **THEN** a thin progress bar or dot indicator shows progress i/N

#### Scenario: Replay button
- **GIVEN** a card is active
- **WHEN** the user taps the volume icon
- **THEN** the current card’s TTS plays again
