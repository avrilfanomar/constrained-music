#!/bin/bash
# run_all_tests.sh - Run all Picat test files and report results

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(dirname "$SCRIPT_DIR")"
PICAT_DIR="$PROJECT_DIR/picat"

echo "=== Running All Test Suites ==="
echo ""

TOTAL_PASSED=0
TOTAL_FAILED=0
FAILED_TESTS=""

# Find all test files
for test_file in "$PICAT_DIR"/test_*.pi; do
    if [ -f "$test_file" ]; then
        test_name=$(basename "$test_file" .pi)
        echo "Running $test_name..."

        if "$SCRIPT_DIR/run_picat.sh" "$test_file" > /dev/null 2>&1; then
            echo "  PASSED"
            TOTAL_PASSED=$((TOTAL_PASSED + 1))
        else
            echo "  FAILED"
            TOTAL_FAILED=$((TOTAL_FAILED + 1))
            FAILED_TESTS="$FAILED_TESTS $test_name"
        fi
    fi
done

echo ""
echo "=== Summary ==="
echo "Test suites passed: $TOTAL_PASSED"
echo "Test suites failed: $TOTAL_FAILED"

if [ $TOTAL_FAILED -gt 0 ]; then
    echo ""
    echo "Failed tests:$FAILED_TESTS"
    exit 1
else
    echo ""
    echo "All test suites passed!"
    exit 0
fi
