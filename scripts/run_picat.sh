#!/bin/bash
# run_picat.sh - Helper script to run Picat with correct module paths
#
# Usage:
#   ./scripts/run_picat.sh picat/companion.pi
#   ./scripts/run_picat.sh picat/companion.pi demo
#   ./scripts/run_picat.sh picat/test_music_types.pi

# Get the directory where this script is located
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

# Set Picat module search path
# Picat looks for modules in directories listed in PICATPATH
export PICATPATH="$PROJECT_ROOT/picat"

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
    echo "Usage: $0 <picat_file.pi> [args...]"
    echo ""
    echo "Examples:"
    echo "  $0 picat/companion.pi"
    echo "  $0 picat/companion.pi demo"
    echo "  $0 picat/companion.pi moods"
    echo "  $0 picat/companion.pi test"
    echo "  $0 picat/companion.pi melody_demo"
    echo "  $0 picat/simple_melody.pi"
    echo "  $0 picat/test_music_types.pi"
    echo ""
    echo "Available files:"
    echo "  picat/companion.pi - Main entry point"
    echo "  picat/simple_melody.pi - Example usage"
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

# Run Picat with the file and any additional arguments
cd "$PROJECT_ROOT"
echo "Running: picat $FILE $@"
echo "PICATPATH: $PICATPATH"
echo ""
picat "$FILE" "$@"
