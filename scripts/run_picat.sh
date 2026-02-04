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

set -euo pipefail

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Set Picat module search path
export PICATPATH="$PROJECT_ROOT/picat"

# Parse options
CONVERT_MIDI=false
PLAY_MIDI=false
CONVERT_LILYPOND=false
CONVERT_SAMPLER=false
SAMPLER_LIBRARY="spitfire"
OUTPUT_NAME=""
MIDI_PLAYER=""

while [[ $# -gt 0 ]]; do
    case "$1" in
        --midi)
            CONVERT_MIDI=true
            shift
            ;;
        --play)
            CONVERT_MIDI=true
            PLAY_MIDI=true
            shift
            ;;
        --lilypond)
            CONVERT_LILYPOND=true
            shift
            ;;
        --sampler)
            CONVERT_SAMPLER=true
            shift
            ;;
        --library)
            SAMPLER_LIBRARY="$2"
            shift 2
            ;;
        --output)
            OUTPUT_NAME="$2"
            shift 2
            ;;
        --player)
            MIDI_PLAYER="$2"
            shift 2
            ;;
        --all)
            CONVERT_MIDI=true
            CONVERT_LILYPOND=true
            CONVERT_SAMPLER=true
            shift
            ;;
        *)
            break
            ;;
    esac
done

# Function to find available MIDI player
find_midi_player() {
    # Check in order of preference
    local players=("timidity" "fluidsynth" "vlc" "mpv" "aplay")
    for player in "${players[@]}"; do
        if command -v "$player" &> /dev/null; then
            echo "$player"
            return 0
        fi
    done
    return 1
}

# Function to play MIDI file with available player
play_midi() {
    local midi_file="$1"
    local player="${MIDI_PLAYER:-}"

    # If no player specified, find one
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
            # FluidSynth requires a soundfont
            local soundfont=""
            # Try common soundfont locations
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
                echo "Warning: No soundfont found for fluidsynth"
                echo "Install a soundfont package or set SOUNDFONT environment variable"
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
        aplay)
            # aplay can't play MIDI directly, needs conversion
            echo "Error: aplay cannot play MIDI files directly"
            return 1
            ;;
        *)
            # Try running the specified player directly
            if command -v "$player" &> /dev/null; then
                "$player" "$midi_file"
            else
                echo "Error: Player '$player' not found"
                return 1
            fi
            ;;
    esac
}

# Check if Picat is installed
if ! command -v picat &> /dev/null; then
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

# Check for arguments
if [ $# -eq 0 ]; then
    echo "Constrained Music Generation - Picat Runner"
    echo ""
    echo "Usage: $0 [options] <picat_file.pi> [args...]"
    echo ""
    echo "Options:"
    echo "  --midi             Convert output JSON to MIDI after running"
    echo "  --play             Convert to MIDI and play with available player"
    echo "  --player <player>  Specify MIDI player: timidity, fluidsynth, vlc, mpv, afplay"
    echo "  --lilypond         Generate LilyPond score (.ly) for sheet music"
    echo "  --sampler          Generate sampler-ready MIDI with CC automation"
    echo "  --library <lib>    Sampler library style: spitfire, eastwest, generic"
    echo "  --all              Generate all outputs (MIDI, LilyPond, sampler)"
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
    echo "Available modes:"
    echo "  picat/companion.pi           - Standard MIDI generation"
    echo "  picat/companion.pi violin    - Violin mode with articulations"
    exit 0
fi

# Get the file to run
FILE="$1"
shift

# If file path doesn't start with /, make it relative to project root
if [[ "$FILE" != /* ]]; then
    FILE="$PROJECT_ROOT/$FILE"
fi

# Check if file exists
if [ ! -f "$FILE" ]; then
    echo "Error: File not found: $FILE"
    exit 1
fi

# Determine output name from Picat arguments if not specified via --output
# Look for output=... in the Picat args
if [ -z "$OUTPUT_NAME" ]; then
    for arg in "$@"; do
        if [[ "$arg" == output=* ]]; then
            OUTPUT_NAME="${arg#output=}"
            OUTPUT_NAME="${OUTPUT_NAME%.json}"  # Remove .json if present
            break
        fi
    done
fi

# Fall back to first arg or default
if [ -z "$OUTPUT_NAME" ] && [ $# -gt 0 ]; then
    # Check if first arg is a command like 'demo', use it as output name
    first_arg="$1"
    if [[ ! "$first_arg" == *=* ]]; then
        OUTPUT_NAME="$first_arg"
    else
        OUTPUT_NAME="session"
    fi
fi

# Run Picat with the file and any additional arguments
cd "$PROJECT_ROOT"

# Clean compiled files to ensure fresh compilation
rm -f "$PROJECT_ROOT/picat/"*.qi

# Check if output= is already in the args
HAS_OUTPUT_ARG=false
for arg in "$@"; do
    if [[ "$arg" == output=* ]]; then
        HAS_OUTPUT_ARG=true
        break
    fi
done

# If we determined an OUTPUT_NAME and output= is not in args, pass it to Picat
PICAT_ARGS=("$@")
if [ -n "$OUTPUT_NAME" ] && [ "$HAS_OUTPUT_ARG" = false ]; then
    PICAT_ARGS+=("output=${OUTPUT_NAME}.json")
fi

echo "Running: picat $FILE ${PICAT_ARGS[*]}"
echo "PICATPATH: $PICATPATH"
echo ""
picat "$FILE" "${PICAT_ARGS[@]}"

# Find JSON files for post-processing
# Supports multiple outputs from count=N option (session_1.json, session_2.json, etc.)
find_json_files() {
    local base_name="$1"
    local files=()

    # Check for numbered files (from count=N option)
    for f in "${base_name}"_*.json; do
        if [ -f "$f" ]; then
            files+=("$f")
        fi
    done

    # If no numbered files, check for single file
    if [ ${#files[@]} -eq 0 ]; then
        if [ -f "${base_name}.json" ]; then
            files=("${base_name}.json")
        fi
    fi

    echo "${files[@]}"
}

# Determine base name for output files
# First try the expected output name, then fall back to session.json
OUTPUT_BASE=""
if [ -n "$OUTPUT_NAME" ]; then
    # Check if files with OUTPUT_NAME were actually created
    OUTPUT_BASE="${OUTPUT_NAME%.json}"  # Remove .json if present
    if [ ! -f "${OUTPUT_BASE}.json" ] && ! ls "${OUTPUT_BASE}"_*.json &>/dev/null 2>&1; then
        # Expected output not found, check for session.json (preset functions may hard-code this)
        if [ -f "session.json" ] || ls session_*.json &>/dev/null 2>&1; then
            OUTPUT_BASE="session"
        else
            OUTPUT_BASE=""  # No output found
        fi
    fi
elif [ -f "session.json" ] || ls session_*.json &>/dev/null 2>&1; then
    OUTPUT_BASE="session"
fi

# Get list of JSON files to process
JSON_FILES=()
if [ -n "$OUTPUT_BASE" ]; then
    mapfile -t JSON_FILES < <(find_json_files "$OUTPUT_BASE" | tr ' ' '\n' | sort -V)
fi

# Convert to MIDI if requested
if [ "$CONVERT_MIDI" = true ] && [ ${#JSON_FILES[@]} -gt 0 ]; then
    echo ""
    if [ ${#JSON_FILES[@]} -gt 1 ]; then
        echo "Converting ${#JSON_FILES[@]} JSON files to MIDI..."
    fi

    for JSON_FILE in "${JSON_FILES[@]}"; do
        if [ -f "$JSON_FILE" ]; then
            echo "Converting $JSON_FILE to MIDI..."
            "$PROJECT_ROOT/.venv/bin/python3" "$PROJECT_ROOT/scripts/midi_writer.py" "$JSON_FILE"
        fi
    done

    # Play first MIDI file if requested
    if [ "$PLAY_MIDI" = true ]; then
        FIRST_JSON="${JSON_FILES[0]}"
        MIDI_FILE="${FIRST_JSON%.json}.mid"
        if [ -f "$MIDI_FILE" ]; then
            play_midi "$MIDI_FILE"
        else
            echo "Warning: MIDI file not found: $MIDI_FILE"
        fi
    fi
fi

# Convert to LilyPond if requested
if [ "$CONVERT_LILYPOND" = true ] && [ ${#JSON_FILES[@]} -gt 0 ]; then
    echo ""
    if [ ${#JSON_FILES[@]} -gt 1 ]; then
        echo "Converting ${#JSON_FILES[@]} JSON files to LilyPond..."
    fi

    for JSON_FILE in "${JSON_FILES[@]}"; do
        if [ -f "$JSON_FILE" ]; then
            echo "Converting $JSON_FILE to LilyPond..."
            "$PROJECT_ROOT/.venv/bin/python3" "$PROJECT_ROOT/scripts/lilypond_writer.py" "$JSON_FILE"

            LY_FILE="${JSON_FILE%.json}.ly"
            if [ -f "$LY_FILE" ]; then
                echo "LilyPond file created: $LY_FILE"
            fi
        fi
    done
    echo "To generate PDFs: lilypond *.ly"
fi

# Convert to sampler format if requested
if [ "$CONVERT_SAMPLER" = true ] && [ ${#JSON_FILES[@]} -gt 0 ]; then
    echo ""
    if [ ${#JSON_FILES[@]} -gt 1 ]; then
        echo "Converting ${#JSON_FILES[@]} JSON files to sampler format..."
    fi

    for JSON_FILE in "${JSON_FILES[@]}"; do
        if [ -f "$JSON_FILE" ]; then
            echo "Converting $JSON_FILE to sampler format..."
            "$PROJECT_ROOT/.venv/bin/python3" "$PROJECT_ROOT/scripts/sampler_writer.py" \
                "$JSON_FILE" --format midi_cc --library "$SAMPLER_LIBRARY"
        fi
    done
fi

# Report if no JSON file found for post-processing
if [ "$CONVERT_MIDI" = true ] || [ "$CONVERT_LILYPOND" = true ] || [ "$CONVERT_SAMPLER" = true ]; then
    if [ ${#JSON_FILES[@]} -eq 0 ]; then
        echo ""
        echo "Warning: No JSON output file found for conversion"
        echo "Expected: session.json or session_*.json"
    fi
fi
