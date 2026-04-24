#!/bin/bash
# Sarah's Charting Tool — double-click this file to start

cd "$(dirname "$0")"

REPO_ZIP="https://github.com/infinitycyclery/sarah-s-charting-tool/archive/refs/heads/claude/sarahs-charting-tool-XzAug.zip"

# Pull latest updates from GitHub
echo "Checking for updates..."
if git rev-parse --git-dir > /dev/null 2>&1; then
    # Git repo present — use git pull
    git pull --quiet && echo "Up to date." || echo "Could not reach GitHub — using local version."
else
    # No .git (downloaded as zip) — fetch latest zip from GitHub
    TMPDIR_UPDATE=$(mktemp -d)
    if curl -sL --connect-timeout 10 "$REPO_ZIP" -o "$TMPDIR_UPDATE/update.zip" 2>/dev/null; then
        unzip -q "$TMPDIR_UPDATE/update.zip" -d "$TMPDIR_UPDATE/" 2>/dev/null
        EXTRACTED=$(find "$TMPDIR_UPDATE" -mindepth 1 -maxdepth 1 -type d | head -1)
        if [ -n "$EXTRACTED" ]; then
            # Copy everything except data/ venv/ .git/
            rsync -a --exclude=data/ --exclude=venv/ --exclude=.git/ "$EXTRACTED/" . 2>/dev/null
            echo "Updated to latest version."
        fi
    else
        echo "Could not reach GitHub — using local version."
    fi
    rm -rf "$TMPDIR_UPDATE"
fi

# First-time setup: create virtual environment and install Flask
if [ ! -d "venv" ]; then
    osascript -e 'display notification "Setting up for first time... this takes about 30 seconds." with title "Sarah'\''s Charting Tool"'
    python3 -m venv venv
    source venv/bin/activate
    pip install -q flask
else
    source venv/bin/activate
fi

# Start the server in background
python3 app.py &
SERVER_PID=$!

# Wait a moment then open browser
sleep 2
open http://localhost:8080

# Show a notification
osascript -e 'display notification "App is running at localhost:8080" with title "Sarah'\''s Charting Tool"'

# Keep this window open so the server stays running
echo ""
echo "  Sarah's Charting Tool is running."
echo "  Browser should have opened automatically."
echo ""
echo "  *** Close this window to stop the app. ***"
echo ""

# Wait for server process
wait $SERVER_PID
