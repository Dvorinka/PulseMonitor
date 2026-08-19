#!/usr/bin/env bash
# PulseMonitor - Screenshot utility
#
# Captures screenshots of the dashboard for the README.
# Requires a running monitor and a browser.
#
# Usage:
#   ./scripts/screenshot.sh
#   ./scripts/screenshot.sh --url http://localhost:5656 --output docs/screenshots

set -euo pipefail

URL="${AGENT_MONITOR_URL:-http://localhost:5656}"
OUTPUT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)/docs/screenshots"

while [[ $# -gt 0 ]]; do
  case $1 in
    --url) URL="$2"; shift 2 ;;
    --output) OUTPUT_DIR="$2"; shift 2 ;;
    *) shift ;;
  esac
done

mkdir -p "$OUTPUT_DIR"

echo "Taking screenshots of $URL"
echo "Output: $OUTPUT_DIR"
echo ""

# Try different screenshot methods
if command -v gnome-screenshot &>/dev/null; then
  echo "Using gnome-screenshot (open the dashboard in your browser first)"
  echo "  1. Open $URL in Firefox/Chrome"
  echo "  2. Press the screenshot key or run:"
  echo "     gnome-screenshot -w -f $OUTPUT_DIR/dashboard-running.png"
elif command -v scrot &>/dev/null; then
  echo "Using scrot (open the dashboard in your browser first)"
  echo "  scrot -s $OUTPUT_DIR/dashboard-running.png"
elif command -v screencapture &>/dev/null; then
  echo "Using screencapture (macOS)"
  echo "  screencapture -o $OUTPUT_DIR/dashboard-running.png"
else
  echo "No screenshot tool found. Take screenshots manually:"
  echo "  1. Open $URL in your browser"
  echo "  2. Take a screenshot of the full dashboard"
  echo "  3. Save to $OUTPUT_DIR/dashboard-running.png"
  echo "  4. Take a screenshot of the sidebar"
  echo "  5. Save to $OUTPUT_DIR/dashboard-sidebar.png"
  echo "  6. Take a screenshot of the todo panel"
  echo "  7. Save to $OUTPUT_DIR/dashboard-todos.png"
fi

echo ""
echo "Expected files:"
echo "  $OUTPUT_DIR/dashboard-running.png"
echo "  $OUTPUT_DIR/dashboard-sidebar.png"
echo "  $OUTPUT_DIR/dashboard-todos.png"
