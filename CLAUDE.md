# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

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
./scripts/run_picat.sh --play picat/companion.pi demo       # Creates and plays with timidity

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
