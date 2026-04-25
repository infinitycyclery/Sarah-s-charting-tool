#!/bin/bash
# Sarah's Charting Tool - Local Startup Script

cd "$(dirname "$0")"

# Clear macOS quarantine flag so iCloud sync doesn't block the app after updates
xattr -dr com.apple.quarantine . 2>/dev/null

# Check for Python 3
if ! command -v python3 &> /dev/null; then
    echo "Error: Python 3 is required. Install from https://python.org"
    exit 1
fi

# Create virtual environment if it doesn't exist
if [ ! -d "venv" ]; then
    echo "Setting up virtual environment..."
    python3 -m venv venv
    source venv/bin/activate
    pip install -q -r requirements.txt
    echo "Setup complete."
else
    source venv/bin/activate
fi

# Launch Ollama if it isn't already running
if ! pgrep -x "Ollama" > /dev/null 2>&1; then
    echo "Starting Ollama..."
    open -a Ollama 2>/dev/null || echo "Ollama app not found — AI features may be unavailable."
    for i in $(seq 1 15); do
        if curl -s http://localhost:11434/api/tags > /dev/null 2>&1; then
            echo "Ollama ready."
            break
        fi
        sleep 1
    done
else
    echo "Ollama already running."
fi

echo ""
echo "  Sarah's Charting Tool"
echo "  ─────────────────────────────────"
echo "  Open your browser to: http://localhost:8080"
echo "  Press Ctrl+C to stop the server"
echo ""

python3 app.py
