## ADDED Requirements

### Requirement: Source emoji data from emoji-mart nature
The system SHALL source animal emojis from `@emoji-mart/data` by selecting the `nature` category (and filtering to the curated animal mapping).

#### Scenario: Extract nature category
- **GIVEN** the application loads emoji-mart data
- **WHEN** the nature category is requested
- **THEN** the system selects emojis from the category with `id === "nature"`

### Requirement: Curated content mapping
The system SHALL use a curated content mapping to supply the teaching word and phrase for each card.

#### Scenario: Content mapping shape
- **GIVEN** a `content.json` mapping exists
- **WHEN** a key is present (e.g. `"dog"`)
- **THEN** it provides a `word` (capitalized display word)
- **AND** it provides a short `phrase` (simple sentence)

### Requirement: Only show cards with content
The system SHALL only display emoji cards that have corresponding entries in the curated content mapping.

#### Scenario: Filter missing content
- **GIVEN** the emoji-mart animals list includes emoji IDs not present in `content.json`
- **WHEN** the system builds the list of flashcards
- **THEN** emojis without content mapping entries are excluded
