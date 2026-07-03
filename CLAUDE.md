# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## General instructions

Constantly update this file and/or [README.md](README.md) with new useful findings, when discovered.

## Project Overview

Constraint-based music generation system using Picat. Generates melodies using constraint programming (CP solver) that respect music theory rules while supporting emotional expression through a Valence-Arousal mood model.

## Build & Run Commands

```bash
# Run demos
./scripts/run_picat.sh picat/companion.pi demo
./scripts/run_picat.sh picat/companion.pi from=sad_depressed to=energized duration=300
./scripts/run_picat.sh picat/companion.pi genre=classical_period randomness=0.3 rhythm=on meter=3/4

# MIDI output
./scripts/run_picat.sh --midi picat/companion.pi demo       # Creates demo.mid
./scripts/run_picat.sh --play picat/companion.pi demo       # Creates and plays
./scripts/run_picat.sh --import song.mid                    # Creates song.json + song.dat

# Variations
./scripts/run_picat.sh picat/variation.pi continue piece=mozart_k545_theme split=50
./scripts/run_picat.sh picat/variation.pi transform piece=twinkle_twinkle genre=baroque technique=inversion

# Run tests
./scripts/run_all_tests.sh
./scripts/run_picat.sh picat/test_music_types.pi

# Evaluation loop (Phase 3)
./scripts/batch_render.sh 5 demo randomness=0.4   # render N pieces + rank vs corpus
python3 scripts/evaluate.py session.json           # score one piece
./scripts/run_picat.sh picat/export_pieces.pi      # regenerate data/masterpieces.json

# Clean compiled files
rm -f picat/*.qi
```

## Architecture

### Core Flow

1. **companion.pi** - Main orchestrator: parses CLI args, plans mood transitions, calls `plan_transition()` per segment
2. **melody.pi** - CP-based melody generation: `solve([ff], Pitches)` with first-fail heuristic
3. **midi_export.pi** → **scripts/midi_writer.py** - JSON export → MIDI via midiutil

### Module Map

| Module | Purpose |
|--------|---------|
| `music_types.pi` | Pitch, duration, note, voice types |
| `temporal.pi` | Time positions, meter, cadential_ritardando |
| `scale_utils.pi` | Scale/mode definitions |
| `music_constraints.pi` | Basic interval/range hard constraints |
| `advanced.pi` | Parallel fifths/octaves avoidance |
| `harmonic.pi` | Chord progressions, cadences |
| `rhythmic.pi` | Rhythm and meter constraints |
| `soft_constraints.pi` | Weighted/relaxable constraints (dispatch + reify) |
| `mood.pi` / `mood_mapping.pi` | Valence-Arousal model → musical params |
| `transition.pi` | Mood transition path planning |
| `emotional_constraints.pi` | Mood-driven weights + 5 emotion-specific constraints |
| `genre_profiles.pi` | Genre constraint configs (hard list + soft weights + params) |
| `constraint_registry.pi` | Informational registry (not dispatch) |
| `constraint_selector.pi` | Selects constraints by genre + mood |
| `chord_generator.pi` | CP chord progressions; constrain melody to chord tones |
| `harmonizer.pi` | Post-hoc melody→chord analysis (diatonic scoring) |
| `accompaniment.pi` | Chord→notes: alberti, arpeggiated, stride, block, waltz |
| `form.pi` | Form structure (binary/ternary/rondo); section contrast genres |
| `refiner.pi` | Multi-start best-of-N refinement with weight boosting |
| `humanize.pi` | Timing/velocity jitter + phrase-level dynamics plans |
| `ornaments.pi` | Grace notes, mordents, turns (post-processing) |
| `motif.pi` | Motif extraction, contour constraint, thematic recall |
| `visualizer.pi` | Constraint violation report (score_all_constraints) |
| `variation.pi` / `variation_engine.pi` | Continue/transform pieces |
| `midi_import.pi` | Read .dat → $note() (from midi_reader.py output) |
| `violin_types.pi` / `violin_constraints.pi` | Violin articulations |

### Key Data Structures

```picat
$note(Pitch, Duration, TimePos, VoiceId, Velocity)
$pitch(midi, 60, 4)        % MIDI number + octave
$pitch(degree, 1, 4)       % Scale degree + octave
$duration(1, 4)            % Quarter note (fraction)
$time_pos(Bar, Beat, Sub)  % Sub: 0.0..1.0
$voice(Id, Type, Channel, $range(LowMidi, HighMidi))
$mood(Valence, Arousal)    % Both -1.0 to +1.0
$meter(3, 4)               % Beats, beat unit
```

## Development Notes

- Compiled `.qi` files are cached — `rm -f picat/*.qi` when debugging module changes
- `apply_soft` dispatch clauses must come BEFORE the catch-all clause
- New soft constraints need: (1) `apply_soft` dispatch, (2) `reify_*` impl, (3) `supported_soft_constraints()` entry, (4) genre profile weights
- Static scorers in `test_constraint_validation.pi` mirror reified CP constraints in `soft_constraints.pi`

### PICATPATH

PICATPATH tells Picat where to find modules. `run_picat.sh` handles it automatically.

```bash
# Manual options:
cd picat && PICATPATH="." picat companion.pi demo
PICATPATH="/abs/path/to/picat" picat /tmp/test.pi
```

### Testing

```bash
./scripts/run_all_tests.sh

./scripts/run_picat.sh picat/test_constraint_validation.pi  # Masterpiece validation
./scripts/run_picat.sh picat/test_generation.pi
./scripts/run_picat.sh picat/test_music_types.pi
./scripts/run_picat.sh picat/test_validation.pi
./scripts/run_picat.sh picat/test_intervals.pi
./scripts/run_picat.sh picat/test_styles.pi
./scripts/run_picat.sh picat/test_form.pi
./scripts/run_picat.sh picat/test_mood.pi
./scripts/run_picat.sh picat/test_mood_mapping.pi
./scripts/run_picat.sh picat/test_genre_profiles.pi
./scripts/run_picat.sh picat/test_diagnostics.pi
./scripts/run_picat.sh picat/test_transition.pi
./scripts/run_picat.sh picat/test_variation.pi
./scripts/run_picat.sh picat/test_accompaniment.pi
./scripts/run_picat.sh picat/test_emotional.pi
./scripts/run_picat.sh picat/test_rhythm.pi
./scripts/run_picat.sh picat/test_refine.pi
./scripts/run_picat.sh picat/test_harmony_melody.pi
./scripts/run_picat.sh picat/test_section_styles.pi
```

## Features Reference

### Augmented Second Constraints (two variants)
- `no_three_semitone_intervals` / `no_augmented_seconds` — forbids ALL 3-semitone intervals
- `no_augmented_seconds_in_scale` — forbids only true aug2 between adjacent scale degrees (requires `mode=Mode` in params)

### Quality Defaults (genre + rhythm on)
CLI defaults to `genre=classical_period` and `rhythm=on`, so all generation routes through the genre path (chord-first harmony, soft-constraint optimization, ornaments, dynamics). `genre=none` / `rhythm=off` restore the legacy basic generator / uniform durations.

### Single Source of Harmonic Truth (chord plan)
`companion.pi` plans each segment's chord progression up front and passes it to the melody solver via `progression=Degrees` in preferences (`melody.segment_progression()` uses it; only generates locally as a legacy fallback). The collected `$chord_span(StartBar, NumBars, KeyRoot, Mode, Degrees)` plan drives `generate_accompaniment_from_plan()`, so accompaniment plays the exact chords the melody was constrained against (including transposed section keys in form mode; returning section labels reuse the same progression). Legacy callers without a plan get melody-fitted chords via `harmonizer.harmonize_melody()`.

### Anytime Optimization (`melody.solve_minimizing`)
Soft-constraint optimization always runs regardless of randomness (`constraint_selector.solve_strategy` never satisfices; `skip_soft_optimization` always fails). The CP solve uses the `report()` hook to record each improving solution; when the 5s budget expires, the best-found solution is kept instead of discarded (plain `time_out(solve(min(...)))` loses everything, and the budget expires on most segments). Pitch and duration costs are minimized sequentially — no constraint couples them, so this is exact and much faster than the joint solve.

### Variable Rhythm (`rhythm=on`, default)
Tick system: 16 ticks = whole note. Bar-filling CP constraint sums note durations to `ticks_per_bar`. `no_rhythmic_monotony` prevents all-same-duration. Genre-specific rhythm weights in `genre_profiles.pi`.

### Variable Time Signatures (`meter=N/M`)
`$meter(N,M)` flows through preferences → `melody.pi` computes `ticks_per_bar_for_meter()`. Written to MIDI via `midi_writer.py addTimeSignature()`.
```bash
./scripts/run_picat.sh picat/companion.pi demo genre=classical_period rhythm=on meter=3/4
```

### Intra-Segment Tempo Changes
Default: last 2 bars of segments ≥4 bars slow to 80% (cadential ritardando). `rit=off` disables. Functions: `temporal.cadential_ritardando()`, `temporal.accelerando()`.

### Post-Generation Refinement (`refine=N`, `refine_piece=N`)
Multi-start best-of-N; each round boosts weights of top-3 worst-violated constraints. `on` = 3 rounds.
```bash
./scripts/run_picat.sh picat/companion.pi demo genre=classical_period refine=5 randomness=0.3
```

### Section-Aware Constraint Switching (`contrast=off`)
B/C sections in form-based generation automatically use a contrasting genre (e.g., `classical_period` → `sturm_und_drang`). Defined in `form.contrast_genre()`. Disable with `contrast=off`.

### Chord-First Melody
The chord progression is planned in `companion.pi` before melody solving (see "Single Source of Harmonic Truth"). Melody downbeats are hard-constrained to chord tones; beat 3 likewise — in rhythm mode via `apply_chord_tone_constraints_ticked` (reified on actual start ticks, since "the bar's 3rd note" has no fixed beat with CP durations). Phrase structure: antecedent ends open (deg 2/5/7), consequent ends on tonic. Soft constraints: `register_target`, `sequential_repetition`, `weak_beat_justified`, `no_zigzag` (penalizes step-reversals → scalar runs), `leap_presence` (≥1 skip per 8 intervals).

### Register Arc / Piece Climax
`companion.choose_climax_segment` picks the climax segment (highest mood-driven voice; ties → golden-ratio index) and an absolute piece-climax pitch. Each segment gets `register_center` (arc position mapped into its voice range), a hard tessitura window (center−5 .. center+11, capped at `register_ceiling` = climax−2 for non-climax segments, extended to `climax_target` for the climax segment), a soft centering cost, and (climax segment) reach-the-top + don't-plateau costs — all in `melody.apply_register_arc`. This is what makes pieces rise to a single high point; without the hard window, min-value labeling pins melodies to the bottom of the voice range.

### Solver Defaults
CLI default `randomness=0.2`; any randomness ≥0.05 turns on `rand_val` labeling (variety), optimization always on. Anytime budgets: 9s pitch solve, 4s rhythm solve (`solve_minimizing/5`).

### Piano Accompaniment (`accomp=pattern`)
Patterns: `alberti` (classical), `arpeggiated` (baroque/romantic), `stride` (jazz), `block` (folk/sacred), `none`. Multi-track MIDI: voices ≤9 = Track 0 (melody), voice ≥10 = Track 1 (accompaniment).

### Pedal Markings (CC64)
Auto-applied: `midi_export.generate_pedal_events()` creates pedal-down-per-bar events. Written as CC64 by `midi_writer.py`.

### Ornaments (`ornaments=0.0..1.0`)
Post-processing: `ornaments.add_ornaments(Notes, Genre, Density)`. Grace notes for baroque/classical/romantic. Default density 0.3.

### Phrase-Level Dynamic Arcs
`humanize.make_standard_plan(NumBars, VelBase)` → `apply_dynamics_plan()`. Transition types: `crescendo`, `diminuendo`, `subito`, `sforzando`. Auto-applied in `run_companion_with_genre` and `run_companion_with_form` (ornaments too).

### Thematic Recall (ABA/rondo)
`motif.apply_thematic_recall(OrigPitches, NewPitches, 0.8)` — ≥80% exact pitch match for returning sections. `companion.py` maintains `SectionPitchMap`; injects `recall_pitches=Pitches` into preferences automatically.

### MIDI Import (`--import file.mid`)
Two-stage: `midi_reader.py` (mido) → `.json` + `.dat`; `midi_import.pi` reads `.dat` → `$note()` list.
```bash
./scripts/run_picat.sh --import song.mid
```
In Picat: `Notes = midi_import.import_dat("song.dat")` or `midi_import.import_midi("song.mid")`.

### Variation Generation
```bash
./scripts/run_picat.sh picat/variation.pi continue piece=mozart_k545_theme split=50
./scripts/run_picat.sh picat/variation.pi transform piece=beethoven_ode_to_joy technique=retrograde genre=baroque
```
Techniques: `inversion`, `retrograde`, `augmentation`, `diminution`. `split=50` = 50%, `split=8n` = 8 notes.

### Style Packages
- `galant` — light, decorative, max_interval=4
- `high_classical` — max structural constraints (Mozart/Haydn)
- `sturm_und_drang` — dramatic, wider intervals, no aug2 constraint
- `romantic_piano` — max_interval=14, `compound_interval_recovery` constraint

### Secondary Dominants
`chord_generator.pi` degrees: 8=bVI, 9=bII (Neapolitan). Available in romantic/jazz/blues genres. Resolution constraints enforced as hard CP.

### Emotional Constraints
`emotional_constraints.pi`: mood-driven weight multipliers + 5 constraints (`descending_motion`, `ascending_motion`, `narrow_range`, `contour_smoothness`, `expressive_leaps`) activated by Valence/Arousal thresholds.

### Input Validation / Diagnostics
`validation.pi` — `validate_companion_inputs(...)`, throws `$validation_error(field, value, msg)`.
`diagnostics.pi` — detects constraint conflicts (min_range > voice range, etc.) before solving.

### Evaluation Loop (masterpiece distance)
`scripts/evaluate.py session.json` scores a generated piece against `data/masterpieces.json` (regenerate via `picat/export_pieces.pi` after editing `picat/famous_pieces/`): interval-distribution JSD + z-scored melodic stats (stepwise/leap ratios, contour turn rate, 4-gram self-similarity...) plus fixed-target intra-piece checks (harmony agreement melody↔accompaniment, rhythm entropy, bar-rhythm repetition, climax uniqueness). Lower distance = closer to the corpus. `scripts/batch_render.sh N [args...]` renders N variations to `out/batch_*/`, converts to MIDI, and prints a ranking — the A/B listening loop. `demo` accepts `output=` and `count=` like the `from=/to=` path.
