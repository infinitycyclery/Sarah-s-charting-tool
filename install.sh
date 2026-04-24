#!/bin/bash
# Sarah's Charting Tool — First-Time Setup
#
# HOW TO RUN THIS FILE:
#   1. Open Terminal (Cmd+Space → type "Terminal" → Enter)
#   2. Type:  bash  (with a space after it, do not press Enter yet)
#   3. Drag THIS FILE into the Terminal window
#   4. Press Enter

cd "$(dirname "$0")"

echo ""
echo "  Sarah's Charting Tool — Setup"
echo "  ─────────────────────────────"

# Fix permissions and quarantine
chmod +x "Open Charting Tool.command" run.sh
xattr -dr com.apple.quarantine . 2>/dev/null

# Connect to GitHub so the Update button works
if [ ! -d ".git" ]; then
    echo "  Connecting to GitHub for future updates..."
    git init -q
    git remote add origin https://github.com/infinitycyclery/Sarah-s-charting-tool.git
    git fetch -q origin
    git checkout -q -b main --track origin/main 2>/dev/null || \
        git reset -q --hard origin/main
    echo "  Connected."
else
    echo "  Already connected to GitHub."
fi

echo "  Done! You can now double-click 'Open Charting Tool.command' to start."
echo ""
