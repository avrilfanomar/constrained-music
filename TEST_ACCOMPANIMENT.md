# Phase 5: Piano Accompaniment - Test Commands

This document provides test commands to verify all accompaniment features work correctly.

## Quick Start

Test the basic functionality with genre-based accompaniment:

```bash
# Classical period with Alberti bass
./scripts/run_picat.sh --midi picat/companion.pi demo genre=classical_period

# Baroque with arpeggiated bass
./scripts/run_picat.sh --midi picat/companion.pi demo genre=baroque

# Jazz with stride piano
./scripts/run_picat.sh --midi picat/companion.pi demo genre=traditional_jazz

# Folk with block chords
./scripts/run_picat.sh --midi picat/companion.pi demo genre=folk_traditional
```

Each generates a 2-track MIDI file:
- **Track 0: Melody (RH)** - right-hand melody
- **Track 1: Accompaniment (LH)** - left-hand bass + chords

## Test Suite

Run the full accompaniment test suite:

```bash
./scripts/run_picat.sh picat/test_accompaniment.pi
```

Expected output: **17/17 tests pass** covering:
- Harmonization algorithm (melody → chord progressions)
- 5 accompaniment patterns (block, alberti, arpeggiated, stride, waltz framework)
- Genre-to-pattern mapping
- Multi-track MIDI generation
- Voice register and range validation

## Pattern Showcase

Each pattern creates a distinct musical feel:

### Alberti Bass (Classical Period, Galant, High Classical)
```bash
./scripts/run_picat.sh --midi picat/companion.pi demo genre=classical_period
# Output: Fast, repeating Root-5th-3rd-5th pattern
```

### Arpeggiated Bass (Baroque, Romantic, Modal, Sturm und Drang)
```bash
./scripts/run_picat.sh --midi picat/companion.pi demo genre=baroque
# Output: Smooth, flowing bass-root-3rd-5th ascending pattern
```

### Stride Piano (Jazz, Blues)
```bash
./scripts/run_picat.sh --midi picat/companion.pi demo genre=traditional_jazz
# Output: Swinging bass on beats 1,3 + chord on 2,4
```

### Block Chords (Folk, Sacred, Children's, Minimalist, Contemporary)
```bash
./scripts/run_picat.sh --midi picat/companion.pi demo genre=folk_traditional
# Output: Simple, sustained chord on beat 1
```

## Pattern Overrides

Override the default pattern for a genre:

```bash
# Jazz melody with classical Alberti bass (unusual combination)
./scripts/run_picat.sh --midi picat/companion.pi demo genre=traditional_jazz accomp=alberti

# Folk melody with stride bass
./scripts/run_picat.sh --midi picat/companion.pi demo genre=folk_traditional accomp=stride

# Baroque melody with block chords (sparse sound)
./scripts/run_picat.sh --midi picat/companion.pi demo genre=baroque accomp=block

# Classical melody with arpeggiated bass
./scripts/run_picat.sh --midi picat/companion.pi demo genre=classical_period accomp=arpeggiated
```

## Disable Accompaniment

Generate melody only (legacy behavior):

```bash
# No accompaniment, single melody track
./scripts/run_picat.sh --midi picat/companion.pi demo genre=classical_period accomp=none

# Basic mode without genre (no accompaniment by default)
./scripts/run_picat.sh --midi picat/companion.pi demo
```

## Mood Transitions with Accompaniment

Generate mood transitions with dynamic accompaniment:

```bash
# Sad to energized with Classical Alberti throughout
./scripts/run_picat.sh --midi picat/companion.pi demo from=sad_depressed to=energized genre=classical_period

# Calm to joyful with longer duration
./scripts/run_picat.sh --midi picat/companion.pi demo from=calm_peaceful to=joyful duration=300 genre=baroque

# Anxious to peaceful with jazz stride
./scripts/run_picat.sh --midi picat/companion.pi demo from=anxious to=calm_peaceful genre=traditional_jazz
```

## MIDI Inspection

Verify MIDI structure:

```bash
# Check MIDI tracks and format
python3 << 'EOF'
import json
with open('session.json') as f:
    data = json.load(f)
voices = set(note.get('voice', 1) for note in data['notes'])
melody = sum(1 for n in data['notes'] if n.get('voice', 1) <= 9)
accomp = sum(1 for n in data['notes'] if n.get('voice', 1) >= 10)
print(f"Voices: {sorted(voices)}")
print(f"Melody notes: {melody}, Accompaniment notes: {accomp}")
EOF

# Inspect MIDI file header
python3 << 'EOF'
with open('session.mid', 'rb') as f:
    data = f.read()
    if data[:4] == b'MThd':
        num_tracks = int.from_bytes(data[10:12], 'big')
        ticks_per_q = int.from_bytes(data[12:14], 'big')
        print(f"Format 1 MIDI: {num_tracks} tracks, {ticks_per_q} ticks/quarter")
EOF
```

## All Genres

Test accompaniment with all 14 genres:

```bash
for genre in classical_period galant high_classical baroque romantic modal sturm_und_drang \
             folk_traditional sacred_chant children_songs traditional_jazz blues \
             contemporary minimalist; do
    echo "Testing $genre..."
    ./scripts/run_picat.sh --midi picat/companion.pi demo genre=$genre 2>&1 | grep -E "(Generated|Accompaniment)"
done
```

## Performance Notes

- **Melody generation**: ~1-3 seconds (CP solver)
- **Harmonization**: ~0.1-0.5 seconds (diatonic scoring)
- **Accompaniment rendering**: ~0.05-0.2 seconds (pattern expansion)
- **MIDI export**: ~0.5-1 second (file I/O)
- **Total**: ~2-5 seconds per generation

Accompaniment adds ~15-20% overhead (mostly from multi-track MIDI handling).

## Troubleshooting

### "Warning: No JSON output file found"
The companion.pi script failed to generate. Check:
- Valid genre name: `./scripts/run_picat.sh picat/companion.pi moods` lists all options
- Valid from/to moods or valid key=value arguments
- Picat is installed and in PATH

### "Converting session.json to MIDI..." but no player launches
Install a MIDI player:
- Linux: `sudo apt install timidity` or `sudo apt install fluidsynth`
- macOS: `brew install timidity`
- Or specify: `./scripts/run_picat.sh --play --player timidity picat/companion.pi demo`

### MIDI file sounds wrong or missing accompaniment
Check `session.json`:
```bash
python3 -c "import json; d=json.load(open('session.json')); print('Accompaniment notes:', sum(1 for n in d['notes'] if n.get('voice',1)>=10))"
```
Should show >0 accompaniment notes if genre was specified.

### Test suite fails
Clear cached Picat files:
```bash
rm -f picat/*.qi
./scripts/run_picat.sh picat/test_accompaniment.pi
```

## Implementation Files

- `picat/harmonizer.pi` - Melody-to-chord analysis (280 lines)
- `picat/accompaniment.pi` - Pattern rendering (200 lines)
- `picat/test_accompaniment.pi` - Test suite (260 lines)
- `scripts/midi_writer.py` - Multi-track MIDI export (180 lines)
- `picat/companion.pi` - Integration (updated)
- `picat/genre_profiles.pi` - Pattern configuration (updated)
