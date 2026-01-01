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
        --output)
            OUTPUT_NAME="$2"
            shift 2
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
    echo "  --output <name>  Output file base name (default: derived from args)"
    echo ""
    echo "Examples:"
    echo "  $0 picat/companion.pi demo"
    echo "  $0 --midi picat/companion.pi demo randomness=0.5"
    echo "  $0 --play picat/companion.pi moods"
    echo "  $0 picat/test_music_types.pi"
    echo ""
    echo "Available files:"
    echo "  picat/companion.pi      - Main entry point"
    echo "  picat/simple_melody.pi  - Example usage"
    echo "  picat/test_music_types.pi - Unit tests"
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
echo "Running: picat $FILE $*"
echo "PICATPATH: $PICATPATH"
echo ""
picat "$FILE" "$@"

# Convert to MIDI if requested
if [ "$CONVERT_MIDI" = true ] && [ -n "$OUTPUT_NAME" ]; then
    JSON_FILE="${OUTPUT_NAME}.json"
    if [ -f "$JSON_FILE" ]; then
        echo ""
        echo "Converting $JSON_FILE to MIDI..."
        "$PROJECT_ROOT/.venv/bin/python3" "$PROJECT_ROOT/scripts/midi_writer.py" "$JSON_FILE"

        # Play if requested
        if [ "$PLAY_MIDI" = true ]; then
            MIDI_FILE="${OUTPUT_NAME}.mid"
            if [ -f "$MIDI_FILE" ] && command -v timidity &> /dev/null; then
                echo "Playing $MIDI_FILE..."
                timidity "$MIDI_FILE" --output-16bit
            elif [ ! -f "$MIDI_FILE" ]; then
                echo "Warning: MIDI file not found: $MIDI_FILE"
            else
                echo "Warning: timidity not installed, cannot play MIDI"
            fi
        fi
    else
        echo "Warning: JSON output not found: $JSON_FILE"
    fi
fi
