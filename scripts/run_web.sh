#!/bin/bash
# run_web.sh - Launch the Constrained Music Studio web interface
#
# Usage:
#   ./scripts/run_web.sh              # Start on port 8000
#   ./scripts/run_web.sh --port 3000  # Custom port
#   ./scripts/run_web.sh --dev        # Auto-reload on code changes (dev only)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_ROOT="$(dirname "$SCRIPT_DIR")"
WEB_DIR="$PROJECT_ROOT/web"

PORT=8000
RELOAD_ARGS=()
while [[ $# -gt 0 ]]; do
    case "$1" in
        --port) PORT="$2"; shift 2 ;;
        --dev)  RELOAD_ARGS=(--reload); shift ;;
        *) echo "Unknown option: $1"; exit 1 ;;
    esac
done

# Check Python
if ! command -v python3 &>/dev/null; then
    echo "Error: python3 is not installed"
    exit 1
fi

# Check Picat
if ! command -v picat &>/dev/null; then
    echo "Warning: picat is not in PATH. Generation will fail."
    echo "Install Picat from https://picat-lang.org/"
fi

# Create venv if needed and install deps
VENV_DIR="$PROJECT_ROOT/.venv"
if [ ! -d "$VENV_DIR" ]; then
    echo "Creating virtual environment..."
    python3 -m venv "$VENV_DIR"
fi

echo "Installing dependencies..."
"$VENV_DIR/bin/pip" install -q -r "$WEB_DIR/requirements.txt"

echo ""
echo "Starting Constrained Music Studio..."
echo "  URL: http://localhost:$PORT"
echo "  Press Ctrl+C to stop"
echo ""

# --reload restarts the worker on any .py edit, orphaning in-flight solver
# processes — opt in with --dev while developing.
cd "$PROJECT_ROOT"
"$VENV_DIR/bin/uvicorn" web.server:app --host 0.0.0.0 --port "$PORT" ${RELOAD_ARGS[@]+"${RELOAD_ARGS[@]}"}
