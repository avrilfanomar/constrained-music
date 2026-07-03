#!/bin/bash
# batch_render.sh - Render N variations, convert to MIDI, evaluate, and rank
#
# Usage:
#   ./scripts/batch_render.sh N [companion args...]
#
# Examples:
#   ./scripts/batch_render.sh 5 demo randomness=0.4
#   ./scripts/batch_render.sh 3 from=sad_depressed to=energized randomness=0.3 refine=3
#
# Output goes to out/batch_<timestamp>/: piece_i.json, piece_i.mid, and an
# evaluation ranking against data/masterpieces.json (see scripts/evaluate.py).

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"

N="${1:?usage: batch_render.sh N [companion args...]}"
shift

STAMP="$(date +%Y%m%d_%H%M%S)"
OUTDIR="$PROJECT_ROOT/out/batch_$STAMP"
mkdir -p "$OUTDIR"

echo "=== Batch render: $N pieces -> $OUTDIR ==="
echo ""

# companion count=N writes piece_1.json .. piece_N.json next to output=
"$SCRIPT_DIR/run_picat.sh" picat/companion.pi "$@" count="$N" output="$OUTDIR/piece.json"

# count=1 writes an unnumbered file; normalize to piece_1.json
if [ "$N" = "1" ] && [ -f "$OUTDIR/piece.json" ]; then
    mv "$OUTDIR/piece.json" "$OUTDIR/piece_1.json"
fi

shopt -s nullglob
JSON_FILES=("$OUTDIR"/piece_*.json)
if [ ${#JSON_FILES[@]} -eq 0 ]; then
    echo "Error: no piece_*.json produced in $OUTDIR" >&2
    exit 1
fi

# Convert each JSON to MIDI
PYTHON="$PROJECT_ROOT/.venv/bin/python3"
[ -x "$PYTHON" ] || PYTHON=python3
for f in "${JSON_FILES[@]}"; do
    "$PYTHON" "$PROJECT_ROOT/scripts/midi_writer.py" "$f" "${f%.json}.mid" >/dev/null
done

echo ""
echo "=== Evaluation vs masterpiece corpus ==="
"$PYTHON" "$PROJECT_ROOT/scripts/evaluate.py" "${JSON_FILES[@]}"

echo ""
echo "MIDI files: $OUTDIR/piece_*.mid"
