#!/bin/sh
set -eu

node /app/server/speak-auth.mjs &
AUTH_PID=$!

nginx -g "daemon off;" &
NGINX_PID=$!

cleanup() {
  trap - TERM INT
  kill "$AUTH_PID" "$NGINX_PID" 2>/dev/null || true
  wait "$AUTH_PID" 2>/dev/null || true
  wait "$NGINX_PID" 2>/dev/null || true
}

trap 'cleanup; exit 0' TERM INT

while kill -0 "$AUTH_PID" 2>/dev/null && kill -0 "$NGINX_PID" 2>/dev/null; do
  sleep 1
done

STATUS=1
if ! kill -0 "$AUTH_PID" 2>/dev/null; then
  echo "speak-auth process exited unexpectedly" >&2
  wait "$AUTH_PID" || STATUS=$?
fi
if ! kill -0 "$NGINX_PID" 2>/dev/null; then
  echo "nginx process exited unexpectedly" >&2
  wait "$NGINX_PID" || STATUS=$?
fi
cleanup
exit "$STATUS"
