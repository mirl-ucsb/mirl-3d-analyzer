#!/bin/bash
# MIRL 3D Analyzer: double-click launcher
# Starts the database server and web server, then opens the app in your browser.

cd "$(dirname "$0")"

CONFIG_FILE=".mirl-storage-path"

# ── Figure out where to store the database ───────────────────────────────────
if [ -f "$CONFIG_FILE" ]; then
  STORAGE_PATH=$(cat "$CONFIG_FILE")
  echo "Using saved storage path: $STORAGE_PATH"
else
  echo ""
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo "  MIRL 3D Analyzer: first-time setup"
  echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
  echo ""
  echo "Where should the shared object database be stored?"
  echo ""
  echo "  • To use your UCSB shared drive: first connect to it in"
  echo "    Finder (Go → Connect to Server → smb://128.111.216.169)"
  echo "    then enter its /Volumes/... path below."
  echo ""
  echo "  • To store locally on this computer just press Enter."
  echo ""
  read -p "Storage path (or Enter for local): " INPUT_PATH

  if [ -z "$INPUT_PATH" ]; then
    STORAGE_PATH="$(pwd)/backend"
    echo "Storing locally in backend/"
  else
    STORAGE_PATH="$INPUT_PATH"
  fi

  echo "$STORAGE_PATH" > "$CONFIG_FILE"
  echo "Saved. Delete .mirl-storage-path to change this setting."
fi

# Verify the path exists
if [ ! -d "$STORAGE_PATH" ]; then
  echo ""
  echo "ERROR: Path not found: $STORAGE_PATH"
  echo "Make sure the drive is mounted in Finder first, then delete"
  echo ".mirl-storage-path and run this launcher again."
  read -p "Press Enter to exit..."
  exit 1
fi

# ── Install Python dependencies if needed ────────────────────────────────────
pip3 install flask flask-cors --quiet 2>/dev/null

# ── Kill any previous instances on these ports ───────────────────────────────
lsof -ti:5005 | xargs kill -9 2>/dev/null
lsof -ti:8000 | xargs kill -9 2>/dev/null

# ── Start servers ─────────────────────────────────────────────────────────────
echo ""
echo "Starting MIRL database server (storage: $STORAGE_PATH)..."
python3 backend/mirl-db-server.py --storage "$STORAGE_PATH" &
DB_PID=$!

echo "Starting MIRL web server on port 8000..."
python3 -m http.server 8000 --bind 127.0.0.1 &
WEB_PID=$!

sleep 2

echo "Opening browser..."
open http://localhost:8000

echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "  MIRL 3D Analyzer is running"
echo "  Web app:         http://localhost:8000"
echo "  Database server: http://localhost:5005"
echo "  Storage:         $STORAGE_PATH"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo ""
echo "Press Ctrl+C to stop."

trap "kill $DB_PID $WEB_PID 2>/dev/null; echo 'Servers stopped.'" EXIT
wait
