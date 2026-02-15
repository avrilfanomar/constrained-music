# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## General instructions

Constantly update this file and/or [README.md](README.md) with new useful findings, when discovered.

## Project Overview

Constraint-based music generation system using Picat. Generates melodies using constraint programming (CP solver) that respect music theory rules while supporting emotional expression through a Valence-Arousal mood model.

## Build & Run Commands

```bash
# Run demos
./scripts/run_picat.sh picat/companion.pi demo              # Quick 60-second demo
./scripts/run_picat.sh picat/companion.pi melody_demo       # Melody generation demo
./scripts/run_picat.sh picat/companion.pi violin            # Violin mode with articulations

# Generate with options
./scripts/run_picat.sh picat/companion.pi from=sad_depressed to=energized duration=300
./scripts/run_picat.sh picat/companion.pi genre=classical_period randomness=0.3

# Generate MIDI output
./scripts/run_picat.sh --midi picat/companion.pi demo       # Creates demo.mid
./scripts/run_picat.sh --play picat/companion.pi demo       # Creates and plays with auto-detected player
./scripts/run_picat.sh --play --player vlc picat/companion.pi demo  # Use specific player

# Run tests
./scripts/run_picat.sh picat/test_music_types.pi

# Clean compiled files
rm -f picat/*.qi
```

## Architecture

### Core Flow

1. **companion.pi** - Main orchestrator entry point
   - Parses CLI arguments, plans mood transitions, coordinates generation
   - Calls `plan_transition()` to create segments, then generates melodies per segment

2. **melody.pi** - CP-based melody generation
   - Creates constraint variables for pitches, applies melodic constraints
   - Uses `solve([ff], Pitches)` with first-fail heuristic
   - Integrates with `constraint_selector.pi` for genre-specific constraints

3. **midi_export.pi** → **scripts/midi_writer.py**
   - Picat exports JSON with notes and tempo changes
   - Python converts JSON to MIDI using midiutil

### Module Layers

**Primitives:**
- `music_types.pi` - Pitch (MIDI numbers), duration (fractions), notes, voices
- `temporal.pi` - Time positions, meter handling
- `scale_utils.pi` - Scale/mode definitions and pitch calculations

**Constraints:**
- `music_constraints.pi` - Basic interval/range constraints
- `advanced.pi` - Voice leading, parallel fifths/octaves avoidance
- `harmonic.pi` - Chord progressions, cadences
- `rhythmic.pi` - Rhythm and meter constraints
- `soft_constraints.pi` - Weighted/relaxable constraints

**Mood System:**
- `mood.pi` - Valence-Arousal model (-1 to +1 each axis)
- `mood_mapping.pi` - Maps moods to musical parameters (tempo, mode, density)
- `transition.pi` - Plans smooth paths between emotional states with easing

**Genre/Style:**
- `genre_profiles.pi` - Genre-specific constraint configurations
- `constraint_registry.pi` - Central registry of all constraints
- `constraint_selector.pi` - Selects constraints based on genre and preferences

**Accompaniment:**
- `harmonizer.pi` - Melody-to-chord-progression analysis (diatonic scoring algorithm)
- `accompaniment.pi` - Chord-to-note rendering with genre-specific patterns

**Instrument-Specific:**
- `violin_types.pi` - Violin articulations, bowing, expression
- `violin_constraints.pi` - Violin-specific playing constraints

### Key Data Structures

```picat
% Note: pitch + duration + time position + voice + velocity
$note(Pitch, Duration, TimePos, VoiceId, Velocity)

% Pitch types
$pitch(midi, 60, 4)    % Middle C as MIDI number
$pitch(degree, 1, 4)   % Tonic in octave 4

% Duration as fraction
$duration(1, 4)        % Quarter note

% Time position
$time_pos(Bar, Beat, Subdivision)

% Voice with range
$voice(Id, Type, Channel, $range(LowMidi, HighMidi))

% Mood using Valence-Arousal
$mood(Valence, Arousal)  % Both -1.0 to +1.0
```

## Development Notes

- Picat modules use `module name.` declaration and `import` for dependencies
- Compiled `.qi` files are cached; delete them when debugging module changes
- Constraint programming uses Picat's `cp` module with `#=`, `#<`, `::` domain constraints
- `solve([ff], Vars)` uses first-fail heuristic for search

### PICATPATH Usage

PICATPATH tells Picat where to find module files. Without it, `import` statements fail with `existence_error(module,X),compile`.

```bash
# Option 1: Use run_picat.sh (recommended - handles PICATPATH automatically)
./scripts/run_picat.sh picat/companion.pi demo

# Option 2: Run from picat/ directory with PICATPATH="."
cd picat && PICATPATH="." picat companion.pi demo

# Option 3: Set PICATPATH to absolute path
PICATPATH="/home/user/repo/constrained-music/picat" picat /tmp/test.pi

# Option 4: Run directly from project root
picat picat/companion.pi demo  # Works because companion.pi is in picat/
```

For test files outside `picat/` directory, you must set PICATPATH:
```bash
# This FAILS - module not found:
picat /tmp/test_soft.pi

# This WORKS:
cd picat && PICATPATH="." picat /tmp/test_soft.pi
```

### Testing

```bash
# Run ALL test suites at once
./scripts/run_all_tests.sh

# Or run individual test suites:
./scripts/run_picat.sh picat/test_constraint_validation.pi  # Masterpiece validation
./scripts/run_picat.sh picat/test_generation.pi             # Generation regression tests
./scripts/run_picat.sh picat/test_music_types.pi            # Unit tests for primitives
./scripts/run_picat.sh picat/test_validation.pi             # Input validation tests
./scripts/run_picat.sh picat/test_intervals.pi              # Interval calculation tests
./scripts/run_picat.sh picat/test_styles.pi                 # Style-based generation tests
./scripts/run_picat.sh picat/test_form.pi                   # Form structure tests
./scripts/run_picat.sh picat/test_mood.pi                   # Mood model tests
./scripts/run_picat.sh picat/test_mood_mapping.pi           # Mood-to-params mapping tests
./scripts/run_picat.sh picat/test_genre_profiles.pi         # Genre configuration tests
./scripts/run_picat.sh picat/test_diagnostics.pi            # Constraint conflict detection tests
./scripts/run_picat.sh picat/test_transition.pi             # Mood transition planning tests
./scripts/run_picat.sh picat/test_variation.pi              # Variation generation tests
./scripts/run_picat.sh picat/test_accompaniment.pi          # Accompaniment & harmonizer tests
```

The **constraint validation test suite** (`test_constraint_validation.pi`) validates that famous musical masterpieces satisfy the implemented constraints:
- Tests folk melodies (Twinkle Twinkle, Amazing Grace, etc.) for basic melodic constraints
- Tests Bach SATB chorales for voice leading rules (no parallel fifths/octaves, no voice crossing)
- Tests Bach, Mozart, and Beethoven melodies for period-appropriate constraints
- Reports soft constraint violation baselines for comparison with generated music
- Tests the context-aware augmented second constraint
- Tests structural constraints (antecedent-consequent, phrase rhyme, cadences, motivic repetition, peak approach/exit) against masterpieces

### Augmented Second Constraints

The system provides two variants for handling augmented seconds:

1. **`no_three_semitone_intervals`** (formerly `no_augmented_seconds`): Catches ALL 3-semitone intervals including minor thirds. Use when you want to forbid any 3-semitone melodic motion. The legacy `no_augmented_seconds` name still works as an alias.

2. **`no_augmented_seconds_in_scale`**: Context-aware constraint that only forbids TRUE augmented seconds (3 semitones between adjacent scale degrees). For example, in C harmonic minor, Ab→B is forbidden (degrees 6→7), but C→Eb is allowed (degrees 1→3, a minor third leap). Requires `mode=Mode` in constraint params.

**Usage in melody.pi**:
```picat
% Legacy (catches all 3-semitone intervals)
apply_hard_constraint_by_id(no_augmented_seconds, Notes, Root, Params, Len)

% Context-aware (needs mode in Params)
apply_hard_constraint_by_id(no_augmented_seconds_in_scale, Notes, Root, [mode=harmonic_minor|...], Len)
```

Genre profiles currently use the legacy constraint for backward compatibility.

### Input Validation

The `validation.pi` module provides validators for all input parameters:

```picat
import validation.

% Validate individual parameters
validation.validate_duration(60)         % Must be positive
validation.validate_randomness(0.5)      % Must be in [0.0, 1.0]
validation.validate_key_root(60)         % Must be 0-127
validation.validate_mood($mood(0.5, 0.3)) % Valence/arousal in [-1.0, 1.0]
validation.validate_tempo(120)           % Must be 20-300
validation.validate_num_bars(16)         % Must be 1-256

% Validate all companion inputs at once
validation.validate_companion_inputs(StartMood, EndMood, Duration, OutputPath, Randomness)
```

Validation errors are thrown as `$validation_error(field, value, message)` structures.

### Constraint Conflict Detection

The `diagnostics.pi` module detects obvious constraint conflicts before solving:

- min_range > voice range
- max_range too narrow for melody length
- min_range > max_range
- required unique pitches > available scale notes
- max_interval too small to achieve min_range

Conflicts are printed as warnings before generation attempts.

### Interval Dynamic Constraints

Two soft constraints improve interval selection for more dynamic, varied melodies:

1. **`prefer_smaller_intervals`**: Penalizes intervals proportionally to their size beyond a threshold (default 2 semitones). A 3-semitone interval costs 1, a 5-semitone costs 3, etc. This creates graduated preference for smaller intervals rather than binary stepwise/non-stepwise.

2. **`no_repetitive_intervals`**: Penalizes consecutive identical intervals (same size AND direction). Prevents "boring" patterns like scale runs (C-D-E-F-G, all +2) or arpeggios (C-E-G-B, all +4). Forces melodic contour changes.

Both are soft constraints with genre-specific weights:
- Higher weights for folk, children's songs, sacred chant (stepwise preferred)
- Lower weights for jazz, romantic, blues (expressive leaps allowed)
- Very low `no_repetitive_intervals` for minimalist (repetition is the style)

The leap threshold (`base_interval_category(leap)` in `intervals.pi`) is set to 4 semitones, meaning major thirds and above trigger leap recovery constraints.

### Melodic Motion Constraints

Three soft constraints based on Classical period music theory (see `docs/classical_constraint_ideas.md`):

1. **`large_leap_recovery`**: Leaps of 8+ semitones (minor 6th and above) require stepwise motion on both sides. If a large leap enters a note, the exit must be stepwise (≤2 semitones), and vice versa. This enforces the classical rule that octave leaps need careful preparation and resolution.

2. **`consonant_leaps_only`**: Penalizes non-consonant leaps. When an interval exceeds 2 semitones (is a leap), it should be consonant:
   - Allowed: 3 (m3), 4 (M3), 5 (P4), 7 (P5), 8 (m6), 9 (M6), 12 (P8)
   - Penalized: 6 (tritone), 10 (m7), 11 (M7), >12 (beyond octave)

   Mozart's melodies characteristically use consonant leaps.

3. **`peak_approach_exit`**: The melodic climax (highest note) should be approached from below (ascending motion) and left by descending stepwise motion (1-2 semitones down). This creates the classic arch contour with a highlighted peak.

Genre-specific weights:
- Classical period, baroque, folk: High weights (70-85) for classical melodic rules
- Romantic, modal: Moderate weights (45-60) for expressive flexibility
- Jazz, contemporary: Low weights (20-40) for bebop lines and modern idioms
- Sacred chant, children's songs: High weights (60-90) for simple, singable melodies

### Refinement Constraints

1. **`register_consistency`**: Penalizes consecutive intervals > 12 semitones (octave). Large register jumps break melodic coherence. Applied to classical_period(55), baroque(45), folk(60), sacred_chant(70), children_songs(70), minimalist(65).

2. **`no_short_note_isolation`**: Rhythmic constraint that penalizes isolated short notes (≤2 ticks) surrounded by longer notes (≥4 ticks). Prevents choppy mid-phrase articulations. Simplified alternative to true rest placement.

3. **`motivic_fragmentation`**: Checks if interval patterns from the first quarter of the melody appear in the second half (sentence-style fragmentation). Returns 0 violations if ANY first-quarter interval is reused, 1 otherwise. Complements `rhythmic_acceleration` and `motivic_repetition`.

### Style Packages

Three Classical sub-style genre profiles:

- **`galant`**: Early Classical. Very high stepwise (90), high consonant leaps (85), max_interval=4, max_range=12. Light, decorative melodies.
- **`high_classical`**: Mature Mozart/Haydn. Maximum structural constraints — antecedent_consequent(75), phrase_rhyme(75), phrase_arch_contour(75), motivic_fragmentation(60). max_interval=5.
- **`sturm_und_drang`**: Dramatic passages. Reduced stepwise (55), lower register_consistency (40), no `no_augmented_seconds` hard constraint. max_interval=7. Wider intervals and more expressive freedom.

```bash
./scripts/run_picat.sh picat/companion.pi demo genre=galant
./scripts/run_picat.sh picat/companion.pi demo genre=high_classical
./scripts/run_picat.sh picat/companion.pi demo genre=sturm_und_drang
```

### Phase 4: Expression & Polish Modules

Phase 4 adds post-processing and analysis features that improve output quality without changing the CP solver.

**Expression (Post-Processing):**
- `humanize.pi` - Performance humanization (D4) and dynamic velocity curves (D1)
  - `humanize_notes(Notes, Intensity)` - Adds ±timing jitter (less on downbeats) and ±velocity variation. Intensity 0.0=identity, 1.0=maximum.
  - `apply_velocity_curves(Notes, VelBase, VelVar)` - Parabolic velocity arch peaking at climax (highest pitch), with cadential diminuendo in last 20%.
  - `humanize_with_dynamics(Notes, VelBase, VelVar, Intensity)` - Combined: curves first, then micro-humanization.

**Motif Memory (Cross-Segment Coherence):**
- `motif.pi` - Extracts and applies motif patterns across segments (C1)
  - `extract_motif(Melody, MotifLen)` - Extracts signed interval pattern from opening notes (default 4 intervals = 5 notes).
  - `apply_contour_constraint(Pitches, MotifIntervals, Weight, Cost)` - CP constraint matching direction pattern (up/down/same), allowing transposition.
  - Integrated into genre and form generation loops: first segment's motif is extracted and passed to subsequent segments.

**Analysis:**
- `visualizer.pi` - Constraint violation visualizer (G1)
  - `score_all_constraints(Pitches, Root)` - Returns list of 26 (constraint_name, violation_count) tuples.
  - `print_violation_report(Pitches, Root, GenreId)` - Formatted report with categories (Melodic Motion, Contour & Structure, Tonal & Harmonic, Cadence & Period, Motivic). Indicators: `[.]`=clean, `[*]`=1-2 violations, `[!]`=3+ violations.
  - Automatically printed after genre-based generation.

### Phase 5: Piano Accompaniment

Adds a left-hand piano accompaniment (bass line + chord patterns) to the generated melody, transforming single-voice output into a two-handed piano arrangement. This is purely post-processing — the melody pipeline stays untouched.

**Architecture:**
```
melody.pi (unchanged) → harmonizer.pi → accompaniment.pi
         ↓                    ↓                 ↓
   melody notes        chord progression   accompaniment notes
         ↓                                       ↓
              companion.pi merges both note lists
                           ↓
                midi_writer.py (multi-track: melody=Track 0, accomp=Track 1)
```

**Modules:**
- `harmonizer.pi` — Analyzes melody per bar, selects best-fitting diatonic chord via scoring algorithm (+3 root match on strong beat, +2 chord tone, +1 weak match, -1 non-chord tone). Applies cadence overrides (V-I classical, ii-V-I jazz). Outputs `$chord_assignment(Bar, Degree, Quality, RootPitchClass, BassNote)` with smooth bass voice leading.
- `accompaniment.pi` — Renders chord progressions into `$note()` structures using genre-appropriate patterns. VoiceId=10 (left-hand piano). Bass register: MIDI 36-55 (C2-G3), chord voicing: 48-67 (C3-G4).
- `test_accompaniment.pi` — 17 tests covering harmonization, pattern rendering, genre mapping, and integration.

**5 Accompaniment Patterns:**

| Pattern | Description | Genre Usage |
|---------|-------------|-------------|
| `block` | All chord notes on beat 1, sustained | folk, sacred, children, minimalist, contemporary |
| `alberti` | Root-5th-3rd-5th quarter notes | classical_period, galant, high_classical |
| `arpeggiated` | Bass-Root-3rd-5th ascending | baroque, romantic, modal, sturm_und_drang |
| `waltz` | Bass on 1, chord on 2-3 (3/4 time) | (future) |
| `stride` | Bass on 1,3 + chord on 2,4 | jazz, blues |

**Usage:**
```bash
# Accompaniment is automatic with genre-based generation
./scripts/run_picat.sh --play picat/companion.pi demo genre=classical_period  # Alberti bass
./scripts/run_picat.sh --play picat/companion.pi demo genre=baroque           # Arpeggiated
./scripts/run_picat.sh --play picat/companion.pi demo genre=traditional_jazz  # Stride

# Override accompaniment pattern
./scripts/run_picat.sh picat/companion.pi demo genre=classical_period accomp=stride

# Disable accompaniment
./scripts/run_picat.sh picat/companion.pi demo genre=classical_period accomp=none
```

**Multi-track MIDI:** `midi_writer.py` groups notes by voice field — voices ≤9 map to Track 0 "Melody (RH)", voice ≥10 maps to Track 1 "Accompaniment (LH)". Backward compatible: single-voice JSON produces single-track MIDI.

### Variation Generation

Generate variations of well-known classical music works via `variation.pi`:

**Continuation mode** — keep the first part of a piece, generate the rest via CP constraints:
```bash
./scripts/run_picat.sh picat/variation.pi continue piece=mozart_k545_theme split=50
./scripts/run_picat.sh picat/variation.pi continue piece=bach_invention1_subject split=8n genre=romantic
```

**Transform mode** — apply genre transfer or classical techniques:
```bash
# Genre transfer (preserves contour, applies new genre constraints)
./scripts/run_picat.sh picat/variation.pi transform piece=twinkle_twinkle genre=baroque

# Classical techniques
./scripts/run_picat.sh picat/variation.pi transform piece=mozart_k545_theme technique=inversion
./scripts/run_picat.sh picat/variation.pi transform piece=beethoven_ode_to_joy technique=retrograde
./scripts/run_picat.sh picat/variation.pi transform piece=beethoven_ode_to_joy technique=augmentation
./scripts/run_picat.sh picat/variation.pi transform piece=beethoven_ode_to_joy technique=diminution

# Combined: technique + genre transfer
./scripts/run_picat.sh picat/variation.pi transform piece=mozart_k545_theme technique=inversion genre=baroque

# MIDI output
./scripts/run_picat.sh --midi picat/variation.pi continue piece=mozart_k545_theme split=50
```

**Split format**: `split=50` = first 50%, `split=8n` = first 8 notes.

**Architecture**:
- `variation.pi` — CLI entry point, piece lookup, orchestration
- `variation_engine.pi` — Core logic: `continue_melody` (CP), `genre_transfer` (CP with contour similarity), `invert_melody`, `retrograde_melody`, `snap_to_scale`
- `test_variation.pi` — 17 tests covering all modes

Genre transfer uses a contour similarity soft constraint (weight 50) that penalizes deviating from the original melody's directional pattern, so the result preserves the melodic shape while respecting the target genre's rules.

### File Organization

The piece files (`pieces_bach.pi`, `pieces_mozart.pi`, etc.) are in `picat/` and imported directly.
