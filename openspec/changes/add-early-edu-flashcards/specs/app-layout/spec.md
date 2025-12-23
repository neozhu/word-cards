## ADDED Requirements

### Requirement: Warm minimal responsive layout
The system SHALL render the learning experience as a single screen that remains usable on both mobile and desktop.

#### Scenario: Mobile full-height layout
- **GIVEN** the user opens the app on a mobile viewport
- **WHEN** the home screen is rendered
- **THEN** the content is vertically centered within the viewport
- **AND** the layout respects safe-area padding

#### Scenario: Desktop constrained container
- **GIVEN** the user opens the app on a desktop viewport
- **WHEN** the home screen is rendered
- **THEN** the learning container is centered with a maximum width of 430px
- **AND** the page background uses a warm beige/cream tone distinct from the container

### Requirement: Design tokens for warm/rounded style
The system SHALL apply the project’s warm, rounded, minimalist design tokens consistently.

#### Scenario: Card styling
- **GIVEN** a flashcard is visible
- **WHEN** it is rendered
- **THEN** it uses a white card background
- **AND** it uses super-rounded corners (`rounded-[40px]` or equivalent)
- **AND** it uses a subtle deep shadow (`shadow-[0_20px_50px_rgba(0,0,0,0.05)]` or equivalent)

#### Scenario: Typography and color
- **GIVEN** the primary word and phrase are visible
- **WHEN** they are rendered
- **THEN** the primary text uses a soft dark cocoa gray (not pure black)
- **AND** emphasis uses a warm coral accent color
