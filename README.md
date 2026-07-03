# Constrained Music

A constraint-based music generation system written in Picat. Uses constraint programming to synthesize melodic music
that respects musical theory rules while maintaining emotional expressiveness.

## Features

- **Constraint-Based Melody Generation**: Generate melodies using constraint programming with rules for intervals,
  contours, voice leading, and resolutions
- **Soft Constraints with Optimization**: Relaxable constraints with weighted costs - minimize violations instead of
  hard failure
- **Genre-Based Constraint Profiles**: Pre-configured constraint sets for classical, baroque, jazz, folk, and more
- **Constraint Registry**: Central catalogue of 35+ musical constraints with metadata for dynamic selection
- **Extensive Scale Support**: Major/minor, church modes (Dorian, Phrygian, Lydian, etc.), pentatonic, blues,
  whole-tone, and more
- **Emotional Music System**: Valence-Arousal mood model that maps emotional states to musical parameters
- **Smooth Transitions**: Plan musical journeys between emotional states with configurable easing functions
- **MIDI Export**: Generate playable MIDI files from constraint-solved compositions

## Project Structure

```
constrained-music/
├── picat/                      # Core Picat modules
│   ├── companion.pi            # Music Companion orchestrator, main entry point
│   ├── music_types.pi          # Musical primitives (pitch, duration, voice)
│   ├── temporal.pi             # Time positions, meter handling
│   ├── scale_utils.pi          # Scale/mode definitions
│   ├── intervals.pi            # Interval calculations
│   ├── melody.pi               # Melody generation with constraints
│   │
│   ├── music_constraints.pi    # Basic constraints (intervals, ranges)
│   ├── advanced.pi             # Voice leading, parallel fifths avoidance
│   ├── harmonic.pi             # Chord progressions and cadences
│   ├── rhythmic.pi             # Rhythm and meter constraints
│   ├── soft_constraints.pi     # Reified constraints for cost optimization
│   │
│   ├── constraint_registry.pi  # Central catalogue of all constraints
│   ├── genre_profiles.pi       # Genre-specific constraint configurations
│   ├── constraint_selector.pi  # Dynamic constraint selection engine
│   │
│   ├── mood.pi                 # Valence-Arousal mood model
│   ├── mood_mapping.pi         # Maps moods to musical parameters
│   ├── transition.pi           # Emotional transition planning
│   │
│   ├── form.pi                 # Musical form structures (binary, ternary, rondo)
│   ├── validation.pi           # Input validation
│   ├── diagnostics.pi          # Constraint conflict detection
│   │
│   ├── violin_types.pi         # Violin articulations, bowing, expression
│   ├── violin_constraints.pi   # Violin-specific playing constraints
│   │
│   ├── midi_export.pi          # JSON export for MIDI conversion
│   │
│   ├── pieces_*.pi             # Reference pieces for validation (Bach, Mozart, etc.)
│   └── test_*.pi               # Test suites
│
├── web/                        # Web interface (Constrained Music Studio)
│   ├── server.py               # FastAPI backend with REST API
│   ├── requirements.txt        # Python dependencies (fastapi, uvicorn)
│   └── static/                 # Frontend assets
│       ├── index.html          # Main UI
│       ├── css/                # Styling
│       └── js/                 # Interactive components (mood pad, piano roll, etc.)
│
└── scripts/
    ├── run_picat.sh            # Helper script to run Picat
    ├── run_web.sh              # Launch web interface
    └── midi_writer.py          # Converts JSON to MIDI files
```

## Requirements

- **Picat 3.9+** - Download from [picat-lang.org](http://picat-lang.org/)
- **Python 3.6+**
- **midiutil** - `pip install midiutil`
- **timidity** (optional) - For audio playback

### Additional for Web Interface

- **fastapi** - `pip install fastapi`
- **uvicorn** - `pip install uvicorn`

(The `run_web.sh` script automatically installs these from `web/requirements.txt`)

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

## Web Interface

The project includes **Constrained Music Studio**, a web-based UI for interactive music generation without command-line interaction.

### Launch the Web Interface

```bash
./scripts/run_web.sh              # Start on default port 8000
./scripts/run_web.sh --port 3000  # Custom port
```

Then open your browser to `http://localhost:8000`

### Features

**Compose Tab:**
- **Visual Mood Pad**: Click to set start/end points on the Valence-Arousal emotional space
- **Genre Selection**: Choose from 12+ genre presets with visual cards (Classical, Baroque, Jazz, Folk, etc.)
- **Parameter Controls**:
  - Duration (10-300 seconds)
  - Randomness (0.0-1.0)
  - Intensity (Light, Standard, Strict)
- **Advanced Settings**:
  - Musical form (Binary, Ternary, Rondo, Through-composed)
  - Accompaniment patterns (Alberti bass, Arpeggiated, Stride, Block, Waltz)
  - Variable rhythm toggle
  - Segment and piece-level refinement (multi-start optimization)
  - **Constraint Panel**: Fine-tune individual constraint weights for each genre
- **Real-time Generation**: Generates JSON notes + MIDI playback directly in browser
- **Piano Roll Visualization**: See the generated melody and accompaniment visually

**Vary a Piece Tab:**
- **Piece Browser**: Select from built-in reference pieces (Mozart K545, Twinkle Twinkle, etc.)
- **Variation Modes**:
  - **Extend**: Keep opening, generate new continuation (configurable split point and output length)
  - **Rework**: Apply variation techniques (Inversion, Retrograde, Augmentation, Diminution)
- **Genre Override**: Transform pieces into different styles

### REST API

The web server provides REST endpoints for programmatic access:

- `GET /api/config` - Retrieve mood presets, genres, constraints metadata
- `POST /api/generate` - Generate music from mood/genre parameters (returns JSON + base64 MIDI)
- `POST /api/variation` - Create variations of existing pieces

See `web/server.py` for full API schema.

## Usage

Use the helper script `scripts/run_picat.sh` which sets up the correct module paths automatically.

### Generate a Simple Melody

```bash
./scripts/run_picat.sh picat/companion.pi melody_demo
```

### Run Demos

```bash
./scripts/run_picat.sh picat/companion.pi demo
./scripts/run_picat.sh picat/companion.pi demo randomness=0.5
```

### Generate a Transition

```bash
# Basic transition (requires from and to parameters)
./scripts/run_picat.sh picat/companion.pi from=sad_depressed to=energized duration=300

# With randomness for variation
./scripts/run_picat.sh picat/companion.pi from=calm_peaceful to=happy randomness=0.5

# Using VA coordinates instead of presets
./scripts/run_picat.sh picat/companion.pi from_va=-0.7,-0.3 to_va=0.5,0.8 duration=600

# Generate 5 different variations with same criteria
./scripts/run_picat.sh picat/companion.pi from=calm_peaceful to=happy count=5 randomness=0.3
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

### Available Commands

| Command       | Description                                        |
|---------------|----------------------------------------------------|
| `demo`        | Quick 60-second demo (sad_depressed to energized)  |
| `melody_demo` | Demo melody generation with different modes        |
| `violin`      | Generate in violin mode with articulations         |
| `test`        | Quick functionality test                           |
| `path`        | Show transition path without generating music      |
| `moods`       | List available mood presets                        |
| `genres`      | List available genres with constraint info         |
| `help`, `-h`  | Show help message                                  |

### Script Options

| Option           | Description                                    |
|------------------|------------------------------------------------|
| `--midi`         | Convert output JSON to MIDI after running      |
| `--play`         | Convert to MIDI and play with timidity         |
| `--output <name>`| Specify output file base name                  |

### Companion Options

**Required** (one of each pair):

| Option              | Description                                      |
|---------------------|--------------------------------------------------|
| `from=<mood>`       | Starting emotional state (preset name)           |
| `to=<mood>`         | Ending emotional state (preset name)             |
| `from_va=V,A`       | Starting mood as valence,arousal (e.g., -0.7,-0.3) |
| `to_va=V,A`         | Ending mood as valence,arousal (e.g., 0.5,0.8)   |

**Optional**:

| Option              | Description                                      |
|---------------------|--------------------------------------------------|
| `duration=<secs>`   | Total duration in seconds (default: 300)         |
| `output=<path>`     | Output JSON file (default: session.json)         |
| `randomness=<0-1>`  | Variation level (0=deterministic, 1=max)         |
| `count=<n>`         | Generate N different outputs (default: 1)        |
| `genre=<id>`        | Use genre profile (classical_period, baroque...) |
| `intensity=<level>` | Constraint strictness (light, standard, strict)  |
| `form=<type>`       | Form structure (binary, ternary, rondo, through) |
| `disable=<id>`      | Disable a constraint (can use multiple times)    |
| `weight:<id>=<n>`   | Override constraint weight (0-100)               |

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

## Soft Constraints & Optimization

Traditional hard constraints either pass or fail. The soft constraint system converts constraints into **violation
counts** that can be weighted and minimized, enabling:

- Graceful degradation when constraints conflict
- Genre-specific weighting (e.g., leap recovery more important in classical than jazz)
- User-configurable strictness via `intensity` parameter

### How It Works

```
apply_soft(constraint_id, Notes, RootPitch, Weight, Cost)
  → Cost = Weight × ViolationCount
```

Each constraint returns 0 (satisfied) or a positive count. The solver minimizes total cost.

### Available Soft Constraints

| Constraint | Description |
|------------|-------------|
| `leap_recovery` | After leap ≥5 semitones, move opposite direction |
| `mostly_stepwise` | Prefer intervals ≤2 semitones |
| `no_consecutive_same_direction_leaps` | Avoid two consecutive leaps same direction |
| `approach_climax_by_step` | Highest note approached stepwise |
| `leave_climax_contrary` | Descend after highest note |
| `balanced_motion` | Equal ascending/descending intervals |
| `leading_tone_resolution` | Scale degree 7 resolves to tonic |
| `phrase_ends_stable` | End on stable tone (1, 3, or 5) |
| `single_climax` | One clear highest point in middle third |
| `arch_contour` | Rise then fall melodic shape |
| `tonic_anchoring` | Tonic appears regularly |
| `sequence_encouraged` | At least one melodic sequence |

## Genre Profiles

The genre system provides pre-configured constraint sets for different musical styles. Each genre specifies:

- **Hard constraints**: Must be satisfied (e.g., `no_augmented_seconds`)
- **Soft constraints**: Weighted preferences (e.g., `leap_recovery` at weight 80)
- **Parameter overrides**: Style-specific limits (e.g., `max_interval=5`)

### Available Genres

| Genre | Description | Key Constraints |
|-------|-------------|-----------------|
| `classical_period` | Mozart, Haydn | Balanced phrases, strict voice leading |
| `baroque` | Bach, Handel | Sequences, continuous motion |
| `romantic` | Chopin, Brahms | Wide range, expressive leaps |
| `traditional_jazz` | Bebop, Standards | Extended intervals, chromatic approaches |
| `folk_traditional` | Traditional melodies | Stepwise, simple range, arch contour |
| `sacred_chant` | Gregorian | Stepwise, modal, narrow range |
| `children_songs` | Simple songs | Very stepwise, limited range |
| `minimalist` | Reich, Glass | Pattern repetition, gradual change |
| `modal` | Debussy, Ravel | Color over function |
| `blues` | Blues idiom | Blue notes, call-response |

### Usage Example

```bash
# Generate with classical period constraints
./scripts/run_picat.sh picat/companion.pi from=calm_peaceful to=energized genre=classical_period randomness=0.3

# Folk style with strict intensity
./scripts/run_picat.sh picat/companion.pi from=sad_depressed to=happy genre=folk_traditional intensity=strict

# Using VA coordinates instead of presets
./scripts/run_picat.sh picat/companion.pi from_va=-0.5,0.2 to_va=0.7,0.8 genre=baroque

# With form structure
./scripts/run_picat.sh picat/companion.pi from=calm_peaceful to=energized form=ternary genre=classical_period
```

### Constraint Registry

The constraint registry (`constraint_registry.pi`) catalogues 35+ constraints with metadata:

```picat
constraint_def(Id, Category, Type, DefaultWeight, ApplicableGenres, Description)
```

**Categories:**
- `melodic` - Interval patterns, motion, range
- `harmonic` - Resolutions, leading tones
- `voice_leading` - Parallel motion, spacing
- `phrase_structure` - Cadences, contours
- `motivic` - Sequences, patterns
- `idiomatic` - Style-specific rules

Query constraints programmatically:

```picat
constraints_for_genre(baroque)        % All constraints for baroque
hard_constraints_for_genre(classical) % Only hard constraints
soft_constraints_for_genre(folk)      % Soft with weights
```

## Supported Scales

- Major / Minor (natural, harmonic, melodic)
- Church Modes: Ionian, Dorian, Phrygian, Lydian, Mixolydian, Aeolian, Locrian
- Pentatonic (major/minor)
- Blues
- Whole-Tone
- Chromatic
- Diminished
