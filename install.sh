#!/bin/bash
# Sarah's Charting Tool — First-Time Setup
# Run this once after unzipping: bash install.sh

cd "$(dirname "$0")"

echo ""
echo "  Sarah's Charting Tool — Setup"
echo "  ─────────────────────────────"

chmod +x "Open Charting Tool.command" run.sh
xattr -dr com.apple.quarantine . 2>/dev/null

echo "  Done! You can now double-click 'Open Charting Tool.command' to start."
echo ""
