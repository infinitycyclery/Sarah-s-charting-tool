#!/bin/bash
# Sarah's Charting Tool — double-click this file to start

cd "$(dirname "$0")"

# Pull latest updates from GitHub
echo "Checking for updates..."
GITHUB_REPO="https://github.com/infinitycyclery/sarah-s-charting-tool.git"
if git rev-parse --git-dir > /dev/null 2>&1; then
    # Already a proper git repo — just pull
    git pull --quiet && echo "Up to date." || echo "Could not reach GitHub — using local version."
else
    # Downloaded as a ZIP — initialise git so future updates work
    echo "Connecting to GitHub for automatic updates..."
    git init --quiet
    git remote add origin "$GITHUB_REPO"
    if git fetch --quiet origin main 2>/dev/null && git reset --hard origin/main --quiet 2>/dev/null; then
        echo "Updated to latest version."
    else
        echo "Could not reach GitHub — using local version."
    fi
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
