#!/bin/bash
# run_picat.sh - Helper script to run Picat with correct module paths
#
# Usage:
#   ./scripts/run_picat.sh picat/companion.pi
#   ./scripts/run_picat.sh picat/companion.pi demo
#   ./scripts/run_picat.sh picat/test_music_types.pi
#
# Options:
#   --midi          Convert output JSON to MIDI after running
#   --play          Convert to MIDI and play with timidity
#   --lilypond      Generate LilyPond score (.ly) for sheet music
#   --sampler       Generate sampler-ready MIDI with CC automation
#   --library <lib> Sampler library style: spitfire, eastwest, generic
#   --all           Generate all outputs (MIDI, LilyPond, sampler)
#   --output <name> Output file base name (default: derived from args)
#   --player <p>    Specify MIDI player: timidity, fluidsynth, vlc, mpv
#   --import <file> Import a MIDI file to JSON + DAT format (no Picat run)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
export PICATPATH="$PROJECT_ROOT/picat"

# Parse options
CONVERT_MIDI=false
PLAY_MIDI=false
CONVERT_LILYPOND=false
CONVERT_SAMPLER=false
SAMPLER_LIBRARY="spitfire"
OUTPUT_NAME=""
MIDI_PLAYER=""
IMPORT_MIDI=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --midi)      CONVERT_MIDI=true; shift ;;
        --play)      CONVERT_MIDI=true; PLAY_MIDI=true; shift ;;
        --lilypond)  CONVERT_LILYPOND=true; shift ;;
        --sampler)   CONVERT_SAMPLER=true; shift ;;
        --library)   SAMPLER_LIBRARY="$2"; shift 2 ;;
        --output)    OUTPUT_NAME="$2"; shift 2 ;;
        --player)    MIDI_PLAYER="$2"; shift 2 ;;
        --import)    IMPORT_MIDI="$2"; shift 2 ;;
        --all)       CONVERT_MIDI=true; CONVERT_LILYPOND=true; CONVERT_SAMPLER=true; shift ;;
        *)           break ;;
    esac
done

# Find an available MIDI player
find_midi_player() {
    local players=(timidity fluidsynth vlc mpv)
    for player in "${players[@]}"; do
        if command -v "$player" &>/dev/null; then
            echo "$player"
            return 0
        fi
    done
    return 1
}

# Play a MIDI file
play_midi() {
    local midi_file="$1"
    local player="${MIDI_PLAYER:-}"

    if [ -z "$player" ]; then
        player=$(find_midi_player) || {
            echo "Error: No MIDI player found. Install one of: timidity, fluidsynth, vlc, mpv"
            echo ""
            echo "Installation suggestions:"
            echo "  Ubuntu/Debian: sudo apt install timidity"
            echo "  Fedora: sudo dnf install timidity++"
            echo "  macOS: brew install timidity"
            echo "  Or use --player to specify a custom player"
            return 1
        }
    fi

    echo "Playing $midi_file with $player..."

    case "$player" in
        timidity)
            timidity "$midi_file" --output-16bit
            ;;
        fluidsynth)
            local soundfont=""
            for sf in /usr/share/soundfonts/default.sf2 \
                      /usr/share/sounds/sf2/FluidR3_GM.sf2 \
                      /usr/share/soundfonts/FluidR3_GM.sf2 \
                      /usr/local/share/soundfonts/default.sf2; do
                if [ -f "$sf" ]; then
                    soundfont="$sf"
                    break
                fi
            done
            if [ -z "$soundfont" ]; then
                echo "Error: No soundfont found for fluidsynth"
                return 1
            fi
            fluidsynth -a alsa -m alsa_seq -l -i "$soundfont" "$midi_file"
            ;;
        vlc)
            vlc --play-and-exit "$midi_file" 2>/dev/null
            ;;
        mpv)
            mpv "$midi_file"
            ;;
        *)
            if command -v "$player" &>/dev/null; then
                "$player" "$midi_file"
            else
                echo "Error: Player '$player' not found"
                return 1
            fi
            ;;
    esac
}

# Handle --import mode (no Picat needed)
if [ -n "$IMPORT_MIDI" ]; then
    if [ ! -f "$IMPORT_MIDI" ]; then
        echo "Error: MIDI file not found: $IMPORT_MIDI"
        exit 1
    fi
    # Determine output path
    if [ -n "$OUTPUT_NAME" ]; then
        OUT_JSON="${OUTPUT_NAME}.json"
    else
        OUT_JSON="${IMPORT_MIDI%.mid}.json"
        OUT_JSON="${OUT_JSON%.midi}.json"
    fi
    echo "Importing MIDI: $IMPORT_MIDI -> $OUT_JSON"
    "$PROJECT_ROOT/.venv/bin/python3" "$PROJECT_ROOT/scripts/midi_reader.py" "$IMPORT_MIDI" "$OUT_JSON"
    exit $?
fi

# Check if Picat is installed
if ! command -v picat &>/dev/null; then
    echo "Error: Picat is not installed or not in PATH"
    echo ""
    echo "Please install Picat from: https://picat-lang.org/"
    echo ""
    echo "Installation options:"
    echo "  1. Download from http://picat-lang.org/download.html"
    echo "  2. Extract and add to PATH"
    echo "  3. On some systems: apt-get install picat"
    exit 1
fi

# Show usage if no arguments
if [ $# -eq 0 ]; then
    echo "Constrained Music Generation - Picat Runner"
    echo ""
    echo "Usage: $0 [options] <picat_file.pi> [args...]"
    echo ""
    echo "Options:"
    echo "  --midi             Convert output JSON to MIDI after running"
    echo "  --play             Convert to MIDI and play with available player"
    echo "  --player <player>  Specify MIDI player: timidity, fluidsynth, vlc, mpv"
    echo "  --lilypond         Generate LilyPond score (.ly) for sheet music"
    echo "  --sampler          Generate sampler-ready MIDI with CC automation"
    echo "  --library <lib>    Sampler library style: spitfire, eastwest, generic"
    echo "  --all              Generate all outputs (MIDI, LilyPond, sampler)"
    echo "  --import <file>    Import MIDI file to JSON + DAT (no Picat run)"
    echo "  --output <name>    Output file base name (default: derived from args)"
    echo ""
    echo "Examples:"
    echo "  $0 picat/companion.pi demo"
    echo "  $0 --midi picat/companion.pi demo randomness=0.5"
    echo "  $0 --play picat/companion.pi moods"
    echo "  $0 picat/companion.pi violin from=calm_peaceful to=energized"
    echo "  $0 --all picat/companion.pi violin"
    echo "  $0 --lilypond picat/companion.pi violin"
    echo ""
    echo "MIDI import:"
    echo "  $0 --import song.mid                   Import MIDI to JSON + DAT"
    echo "  $0 --import song.mid --output imported  Custom output name"
    echo ""
    echo "Available modes:"
    echo "  picat/companion.pi           - Standard MIDI generation"
    echo "  picat/companion.pi violin    - Violin mode with articulations"
    exit 0
fi

# Get the file to run
FILE="$1"
shift

# Make relative paths absolute from project root
if [[ "$FILE" != /* ]]; then
    FILE="$PROJECT_ROOT/$FILE"
fi

if [ ! -f "$FILE" ]; then
    echo "Error: File not found: $FILE"
    exit 1
fi

# Determine output name: explicit --output > output=arg > first non-kv arg > "session"
if [ -z "$OUTPUT_NAME" ]; then
    for arg in "$@"; do
        if [[ "$arg" == output=* ]]; then
            OUTPUT_NAME="${arg#output=}"
            OUTPUT_NAME="${OUTPUT_NAME%.json}"
            break
        fi
    done
fi

if [ -z "$OUTPUT_NAME" ] && [ $# -gt 0 ] && [[ "$1" != *=* ]]; then
    OUTPUT_NAME="$1"
fi

# Run Picat
cd "$PROJECT_ROOT"
rm -f "$PROJECT_ROOT/picat/"*.qi

# Build Picat args, appending output= if not already present
PICAT_ARGS=("$@")
if [ -n "$OUTPUT_NAME" ]; then
    HAS_OUTPUT_ARG=false
    for arg in "$@"; do
        if [[ "$arg" == output=* ]]; then
            HAS_OUTPUT_ARG=true
            break
        fi
    done
    if [ "$HAS_OUTPUT_ARG" = false ]; then
        PICAT_ARGS+=("output=${OUTPUT_NAME}.json")
    fi
fi

echo "Running: picat $FILE ${PICAT_ARGS[*]}"
echo "PICATPATH: $PICATPATH"
echo ""
picat "$FILE" "${PICAT_ARGS[@]}"

# --- Post-processing ---

NEEDS_POST=$( [[ "$CONVERT_MIDI" = true || "$CONVERT_LILYPOND" = true || "$CONVERT_SAMPLER" = true ]] && echo true || echo false )
if [ "$NEEDS_POST" = false ]; then
    exit 0
fi

# Collect JSON output files
collect_json_files() {
    local base="$1"
    local found=()
    # Check for numbered files first (from count=N)
    while IFS= read -r -d '' f; do
        found+=("$f")
    done < <(find . -maxdepth 1 -name "${base}_*.json" -print0 2>/dev/null | sort -zV)
    # Fall back to single file
    if [ ${#found[@]} -eq 0 ] && [ -f "${base}.json" ]; then
        found=("${base}.json")
    fi
    printf '%s\n' "${found[@]}"
}

# Try OUTPUT_NAME first, fall back to "session"
JSON_FILES=()
for base in "${OUTPUT_NAME:-}" "session"; do
    [ -z "$base" ] && continue
    base="${base%.json}"
    mapfile -t JSON_FILES < <(collect_json_files "$base" | grep -v '^$')
    [ ${#JSON_FILES[@]} -gt 0 ] && break
done

if [ ${#JSON_FILES[@]} -eq 0 ]; then
    echo ""
    echo "Warning: No JSON output file found for conversion"
    echo "Expected: ${OUTPUT_NAME:-session}.json or ${OUTPUT_NAME:-session}_*.json"
    exit 0
fi

# Helper: run a Python converter on all JSON files
run_converter() {
    local script="$1"
    shift
    echo ""
    if [ ${#JSON_FILES[@]} -gt 1 ]; then
        echo "Converting ${#JSON_FILES[@]} JSON files with $(basename "$script")..."
    fi
    for json_file in "${JSON_FILES[@]}"; do
        echo "Converting $json_file..."
        "$PROJECT_ROOT/.venv/bin/python3" "$PROJECT_ROOT/scripts/$script" "$json_file" "$@"
    done
}

if [ "$CONVERT_MIDI" = true ]; then
    run_converter midi_writer.py

    if [ "$PLAY_MIDI" = true ]; then
        if [ ${#JSON_FILES[@]} -gt 0 ]; then
            MIDI_FILE="${JSON_FILES[0]%.json}.mid"
            if [ -z "$MIDI_FILE" ] || [ "$MIDI_FILE" = ".mid" ]; then
                echo "Warning: Invalid MIDI file path (skipping playback)"
            elif [ -f "$MIDI_FILE" ]; then
                play_midi "$MIDI_FILE"
            else
                echo "Note: MIDI file not yet accessible at $MIDI_FILE"
            fi
        else
            echo "Warning: No JSON files to play"
        fi
    fi
fi

if [ "$CONVERT_LILYPOND" = true ]; then
    run_converter lilypond_writer.py
    echo "To generate PDFs: lilypond *.ly"
fi

if [ "$CONVERT_SAMPLER" = true ]; then
    run_converter sampler_writer.py --format midi_cc --library "$SAMPLER_LIBRARY"
fi
