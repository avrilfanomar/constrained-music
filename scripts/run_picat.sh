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
    echo "  --midi           Convert output JSON to MIDI after running"
    echo "  --play           Convert to MIDI and play with timidity"
    echo "  --lilypond       Generate LilyPond score (.ly) for sheet music"
    echo "  --sampler        Generate sampler-ready MIDI with CC automation"
    echo "  --library <lib>  Sampler library style: spitfire, eastwest, generic"
    echo "  --all            Generate all outputs (MIDI, LilyPond, sampler)"
    echo "  --output <name>  Output file base name (default: derived from args)"
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

# Determine output name from first arg if not specified
if [ -z "$OUTPUT_NAME" ] && [ $# -gt 0 ]; then
    OUTPUT_NAME="$1"
fi

# Run Picat with the file and any additional arguments
cd "$PROJECT_ROOT"

# Clean compiled files to ensure fresh compilation
rm -f "$PROJECT_ROOT/picat/"*.qi

echo "Running: picat $FILE $*"
echo "PICATPATH: $PICATPATH"
echo ""
picat "$FILE" "$@"

# Find JSON file for post-processing
JSON_FILE=""
if [ -n "$OUTPUT_NAME" ]; then
    JSON_FILE="${OUTPUT_NAME}.json"
elif [ -f "session.json" ]; then
    JSON_FILE="session.json"
fi

# Convert to MIDI if requested
if [ "$CONVERT_MIDI" = true ] && [ -n "$JSON_FILE" ] && [ -f "$JSON_FILE" ]; then
    echo ""
    echo "Converting $JSON_FILE to MIDI..."
    "$PROJECT_ROOT/.venv/bin/python3" "$PROJECT_ROOT/scripts/midi_writer.py" "$JSON_FILE"

    # Play if requested
    if [ "$PLAY_MIDI" = true ]; then
        MIDI_FILE="${JSON_FILE%.json}.mid"
        if [ -f "$MIDI_FILE" ] && command -v timidity &> /dev/null; then
            echo "Playing $MIDI_FILE..."
            timidity "$MIDI_FILE" --output-16bit
        elif [ ! -f "$MIDI_FILE" ]; then
            echo "Warning: MIDI file not found: $MIDI_FILE"
        else
            echo "Warning: timidity not installed, cannot play MIDI"
        fi
    fi
fi

# Convert to LilyPond if requested
if [ "$CONVERT_LILYPOND" = true ] && [ -n "$JSON_FILE" ] && [ -f "$JSON_FILE" ]; then
    echo ""
    echo "Converting $JSON_FILE to LilyPond..."
    "$PROJECT_ROOT/.venv/bin/python3" "$PROJECT_ROOT/scripts/lilypond_writer.py" "$JSON_FILE"

    LY_FILE="${JSON_FILE%.json}.ly"
    if [ -f "$LY_FILE" ]; then
        echo "LilyPond file created: $LY_FILE"
        echo "To generate PDF: lilypond $LY_FILE"
    fi
fi

# Convert to sampler format if requested
if [ "$CONVERT_SAMPLER" = true ] && [ -n "$JSON_FILE" ] && [ -f "$JSON_FILE" ]; then
    echo ""
    echo "Converting $JSON_FILE to sampler format..."
    "$PROJECT_ROOT/.venv/bin/python3" "$PROJECT_ROOT/scripts/sampler_writer.py" \
        "$JSON_FILE" --format midi_cc --library "$SAMPLER_LIBRARY"
fi

# Report if no JSON file found for post-processing
if [ "$CONVERT_MIDI" = true ] || [ "$CONVERT_LILYPOND" = true ] || [ "$CONVERT_SAMPLER" = true ]; then
    if [ -z "$JSON_FILE" ] || [ ! -f "$JSON_FILE" ]; then
        echo ""
        echo "Warning: No JSON output file found for conversion"
        echo "Expected: session.json or session.json"
    fi
fi
