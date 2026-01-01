# Constrained Music

A constraint-based music generation system written in Picat. Uses constraint programming to synthesize melodic music
that respects musical theory rules while maintaining emotional expressiveness.

## Features

- **Constraint-Based Melody Generation**: Generate melodies using constraint programming with rules for intervals,
  contours, voice leading, and resolutions
- **Extensive Scale Support**: Major/minor, church modes (Dorian, Phrygian, Lydian, etc.), pentatonic, blues,
  whole-tone, and more
- **Emotional Music System**: Valence-Arousal mood model that maps emotional states to musical parameters
- **Smooth Transitions**: Plan musical journeys between emotional states with configurable easing functions
- **MIDI Export**: Generate playable MIDI files from constraint-solved compositions

## Project Structure

```
constrained-music/
├── picat/                    # Core Picat modules
│   ├── companion.pi         # Music Companion orchestrator, main entry point
│   ├── music_types.pi       # Musical primitives (pitch, duration, voice)
│   ├── scale_utils.pi       # Scale/mode definitions
│   ├── melody.pi            # Melody generation with constraints
│   ├── music_constraints.pi # Basic constraints (intervals, ranges)
│   ├── advanced.pi          # Voice leading, parallel fifths avoidance
│   ├── harmonic.pi          # Chord progressions and cadences
│   ├── rhythmic.pi          # Rhythm and meter constraints
│   ├── mood.pi              # Valence-Arousal mood model
│   ├── mood_mapping.pi      # Maps moods to musical parameters
│   ├── transition.pi        # Emotional transition planning
│   ├── midi_export.pi       # JSON export for MIDI conversion
│   └── test_music_types.pi  # Unit tests
│
└── scripts/
    ├── run_picat.sh         # Helper script to run Picat
    └── midi_writer.py       # Converts JSON to MIDI files
```

## Requirements

- **Picat 3.9+** - Download from [picat-lang.org](http://picat-lang.org/)
- **Python 3.6+**
- **midiutil** - `pip install midiutil`
- **timidity** (optional) - For audio playback

## Installation

```bash
# Clone the repository
git clone <repository-url>
cd constrained-music

# Set up Python environment
python -m venv .venv
source .venv/bin/activate
pip install midiutil

# Set Picat path
export PICATPATH=/path/to/constrained-music/picat
```

## Usage

Use the helper script `scripts/run_picat.sh` which sets up the correct module paths automatically.

### Generate a Simple Melody

```bash
./scripts/run_picat.sh picat/companion.pi melody_demo
```

### Run Demos

```bash
./scripts/run_picat.sh picat/companion.pi demo
```

### Generate MIDI File

```bash
# Generate melody and convert to MIDI
./scripts/run_picat.sh --midi picat/companion.pi demo randomness=0.9

# Generate, convert to MIDI, and play with timidity
./scripts/run_picat.sh --play picat/companion.pi demo randomness=0.9

# Custom output name
./scripts/run_picat.sh --midi --output mytrack picat/companion.pi demo
```

### Run Tests

```bash
./scripts/run_picat.sh picat/test_music_types.pi
```

### Script Options

| Option           | Description                                    |
|------------------|------------------------------------------------|
| `--midi`         | Convert output JSON to MIDI after running      |
| `--play`         | Convert to MIDI and play with timidity         |
| `--output <name>`| Specify output file base name                  |

### Clean Compiled Files

```bash
rm -f picat/*.qi
```

## How It Works

### Melody Generation

1. Define configuration (key, mode, voice range, tempo)
2. Create constraint variables for each pitch
3. Apply melodic constraints:
    - Maximum interval between consecutive notes
    - Start on stable scale degrees (1, 3, or 5)
    - End on tonic
    - Leap recovery (contrary motion after large intervals)
    - No consecutive repeated notes
4. Solve using CP solver with first-fail heuristic
5. Output melody notes

### Emotional Music System

The system uses a Valence-Arousal psychological model:

- **Valence**: -1 (sad) to +1 (happy)
- **Arousal**: -1 (calm) to +1 (energetic)

Mood presets include: `sad_depressed`, `anxious`, `angry`, `happy`, `excited`, `joyful`, `calm_peaceful`, `relaxed`,
`neutral`, and more.

Moods map to musical parameters:

| Parameter    | Low Arousal/Valence | High Arousal/Valence |
|--------------|---------------------|----------------------|
| Tempo        | 70 BPM              | 180 BPM              |
| Mode         | Minor/Phrygian      | Major/Lydian         |
| Note Density | 2 notes/bar         | 8 notes/bar          |
| Max Interval | 2 semitones         | 7 semitones          |
| Velocity     | 45                  | 100                  |

### Transition Planning

Generate smooth musical journeys between emotional states:

```
Start: sad_depressed → End: energized (300 seconds)
         ↓
   Plan segments with easing
         ↓
   Interpolate mood parameters
         ↓
   Generate melody per segment
         ↓
   Export complete piece
```

Easing functions: linear, ease-in, ease-out, ease-in-out, cubic variants.

## Musical Constraints

### Basic Constraints

- Interval limits (stepwise motion, skips, leaps)
- Voice range enforcement
- Contour control (ascending, descending patterns)

### Advanced Constraints

- No parallel perfect fifths
- No parallel octaves
- Leading tone resolution
- Seventh chord resolution

### Harmonic Constraints

- Valid chord progressions
- Cadence types (authentic, plagal, half, deceptive)

## Supported Scales

- Major / Minor (natural, harmonic, melodic)
- Church Modes: Ionian, Dorian, Phrygian, Lydian, Mixolydian, Aeolian, Locrian
- Pentatonic (major/minor)
- Blues
- Whole-Tone
- Chromatic
- Diminished

## License

All rights for this software belong to author, Andrii Andriichuk. No usage, apart from explicitly granted by author, is
allowed.
