#!/bin/bash
# Sarah's Charting Tool - Local Startup Script

cd "$(dirname "$0")"

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

echo ""
echo "  Sarah's Charting Tool"
echo "  ─────────────────────────────────"
echo "  Open your browser to: http://localhost:8080"
echo "  Press Ctrl+C to stop the server"
echo ""

python3 app.py
