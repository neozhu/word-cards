## ADDED Requirements

### Requirement: TTS API endpoint
The system SHALL provide a server endpoint at `/api/tts` that produces English speech audio.

#### Scenario: Successful TTS response
- **GIVEN** the client requests TTS for a `word` and `phrase`
- **WHEN** the server processes the request
- **THEN** the server returns playable audio content

#### Scenario: Invalid input
- **GIVEN** the client omits required text
- **WHEN** the server receives the request
- **THEN** it returns an error response without crashing

### Requirement: Word then phrase playback strategy
The system SHALL speak the word first, pause, and then speak the phrase.

#### Scenario: Playback order
- **GIVEN** a user triggers TTS playback
- **WHEN** the playback starts
- **THEN** the system speaks the word
- **AND** waits 0.5 seconds
- **AND** speaks the phrase

### Requirement: Voice and speed defaults
The system SHALL default to a warm English voice and a slightly slower speaking rate.

#### Scenario: Defaults applied
- **GIVEN** no explicit voice parameters are provided by the client
- **WHEN** TTS is generated
- **THEN** the system uses an English voice (e.g. `en-US-Standard-C` or equivalent)
- **AND** uses a speed around 0.9
