#!/bin/sh
set -eu

export PORT="${PORT:-3001}"
node /app/backend/dist/src/main.js &
BACKEND_PID="$!"

export PORT="${FRONTEND_PORT:-3000}"
cd /app/frontend
node server.js &
FRONTEND_PID="$!"

trap 'kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true; wait' INT TERM

wait -n "$BACKEND_PID" "$FRONTEND_PID"
EXIT_CODE="$?"
kill "$BACKEND_PID" "$FRONTEND_PID" 2>/dev/null || true
wait 2>/dev/null || true
exit "$EXIT_CODE"
