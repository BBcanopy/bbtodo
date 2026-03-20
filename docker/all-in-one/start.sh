#!/usr/bin/env bash
set -euo pipefail

cd /app/server
node dist/index.js &
server_pid=$!

cleanup() {
  kill "$server_pid" "${nginx_pid:-}" 2>/dev/null || true
}

trap cleanup EXIT INT TERM

nginx -g 'daemon off;' &
nginx_pid=$!

wait -n "$server_pid" "$nginx_pid"
status=$?

kill "$server_pid" "$nginx_pid" 2>/dev/null || true
wait "$server_pid" 2>/dev/null || true
wait "$nginx_pid" 2>/dev/null || true

exit "$status"
