#!/bin/sh
set -eu

export FILE_STORAGE_DIR="${FILE_STORAGE_DIR:-/app/server/storage/files}"
mkdir -p "$FILE_STORAGE_DIR" "$(dirname "$FILE_STORAGE_DIR")/logs"

node node_modules/prisma/build/index.js migrate deploy

nginx_pid=""
node dist/main.js &
server_pid="$!"

cleanup() {
  kill "$server_pid" 2>/dev/null || true
  if [ -n "$nginx_pid" ]; then
    kill "$nginx_pid" 2>/dev/null || true
  fi
}
trap cleanup INT TERM

nginx -g 'daemon off;' &
nginx_pid="$!"

set +e
wait -n "$server_pid" "$nginx_pid"
status="$?"
set -e
cleanup
exit "$status"
