#!/usr/bin/env bash
set -euo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
DOCKER_BIN="${DOCKER_BIN:-/Applications/Docker.app/Contents/Resources/bin/docker}"
if [ ! -x "$DOCKER_BIN" ]; then
  DOCKER_BIN="$(command -v docker)"
fi

REMOTE_HOST="${REMOTE_HOST:-root@1panel.yunzxu.com}"
REMOTE_DIR="${REMOTE_DIR:-/opt/gewehub}"
IMAGE_NAME="${IMAGE_NAME:-gewehub:latest}"
PLATFORM="${PLATFORM:-linux/amd64}"
PUBLIC_BASE_URL="${PUBLIC_BASE_URL:-https://gewehub.yunzxu.com}"
WEB_ORIGIN="${WEB_ORIGIN:-https://gewehub.yunzxu.com}"
HOST_PORT="${HOST_PORT:-1870}"
MYSQL_HOST="${MYSQL_HOST:-1Panel-mysql-aQxp}"
MYSQL_DATABASE="${MYSQL_DATABASE:-gewehub}"
MYSQL_USER="${MYSQL_USER:-gewehub}"
MYSQL_PASSWORD="${MYSQL_PASSWORD:-${GEWEHUB_DATABASE_PASSWORD:-}}"
REDIS_HOST="${REDIS_HOST:-1Panel-redis-LoQW}"
REDIS_DATABASE="${REDIS_DATABASE:-0}"
REDIS_PASSWORD="${REDIS_PASSWORD:-${GEWEHUB_REDIS_PASSWORD:-}}"
ENV_SOURCE="${ENV_SOURCE:-$ROOT_DIR/server/.env}"
BUILD_DIR="$ROOT_DIR/runtime/deploy"
IMAGE_TAR="$BUILD_DIR/gewehub-latest-amd64.tar"
ENV_TMP="$BUILD_DIR/.env.production"

if [ -z "$MYSQL_PASSWORD" ]; then
  printf 'MYSQL_PASSWORD or GEWEHUB_DATABASE_PASSWORD is required\n' >&2
  exit 1
fi

if [ ! -f "$ENV_SOURCE" ]; then
  printf 'Env source not found: %s\n' "$ENV_SOURCE" >&2
  exit 1
fi

if [ -z "$REDIS_PASSWORD" ]; then
  REDIS_PASSWORD="$(
    ssh "$REMOTE_HOST" "docker inspect $REDIS_HOST --format '{{json .Config.Cmd}}'" |
      python3 -c 'import json, sys
cmd = json.load(sys.stdin)
try:
    print(cmd[cmd.index("--requirepass") + 1])
except (ValueError, IndexError):
    print("")
'
  )"
fi

if [ -n "$REDIS_PASSWORD" ]; then
  REDIS_URL="redis://:${REDIS_PASSWORD}@${REDIS_HOST}:6379/${REDIS_DATABASE}"
else
  REDIS_URL="redis://${REDIS_HOST}:6379/${REDIS_DATABASE}"
fi

DATABASE_URL="mysql://${MYSQL_USER}:${MYSQL_PASSWORD}@${MYSQL_HOST}:3306/${MYSQL_DATABASE}"

mkdir -p "$BUILD_DIR"

awk -F= '
  BEGIN {
    skip["DATABASE_URL"]=1
    skip["REDIS_URL"]=1
    skip["PUBLIC_BASE_URL"]=1
    skip["WEB_ORIGIN"]=1
    skip["FILE_STORAGE_DIR"]=1
    skip["PORT"]=1
    skip["NODE_ENV"]=1
  }
  /^[[:space:]]*#/ || /^[[:space:]]*$/ { next }
  {
    key=$1
    sub(/^[[:space:]]+/, "", key)
    sub(/[[:space:]]+$/, "", key)
    if (!(key in skip)) print
  }
' "$ENV_SOURCE" > "$ENV_TMP"
{
  printf 'DATABASE_URL=%s\n' "$DATABASE_URL"
  printf 'REDIS_URL=%s\n' "$REDIS_URL"
  printf 'PUBLIC_BASE_URL=%s\n' "$PUBLIC_BASE_URL"
  printf 'WEB_ORIGIN=%s\n' "$WEB_ORIGIN"
  printf 'FILE_STORAGE_DIR=%s\n' "/app/server/storage/files"
  printf 'PORT=%s\n' "3000"
  printf 'NODE_ENV=%s\n' "production"
} >> "$ENV_TMP"
chmod 600 "$ENV_TMP"

"$DOCKER_BIN" buildx build \
  --platform "$PLATFORM" \
  --build-arg "VITE_CALLBACK_BASE_URL=$PUBLIC_BASE_URL" \
  --build-arg "VITE_API_BASE_URL=" \
  -f "$ROOT_DIR/deploy/Dockerfile" \
  -t "$IMAGE_NAME" \
  --load \
  "$ROOT_DIR"

"$DOCKER_BIN" save "$IMAGE_NAME" -o "$IMAGE_TAR"

ssh "$REMOTE_HOST" "mkdir -p '$REMOTE_DIR/runtime/files' '$REMOTE_DIR/runtime/logs'"
scp "$IMAGE_TAR" "$REMOTE_HOST:$REMOTE_DIR/gewehub-latest-amd64.tar"
scp "$ROOT_DIR/deploy/docker-compose.prod.yml" "$REMOTE_HOST:$REMOTE_DIR/docker-compose.prod.yml"
scp "$ENV_TMP" "$REMOTE_HOST:$REMOTE_DIR/.env.production"

ssh "$REMOTE_HOST" "cd '$REMOTE_DIR' && \
  docker load -i gewehub-latest-amd64.tar && \
  docker compose -f docker-compose.prod.yml --env-file .env.production up -d && \
  docker ps --filter name=gewehub --format '{{.Names}} {{.Status}}' && \
  for i in \$(seq 1 40); do curl -fsS http://127.0.0.1:${HOST_PORT}/api/health >/dev/null && exit 0; sleep 3; done; \
  docker logs --tail 120 gewehub; exit 1"

ssh "$REMOTE_HOST" "set -e; cat > /opt/1panel/www/sites/gewehub.yunzxu.com/proxy/gewehub-sse.conf <<'NGINX'
location = /api/apps/events {
    proxy_pass http://127.0.0.1:${HOST_PORT};
    proxy_set_header Host \$host;
    proxy_set_header X-Real-IP \$remote_addr;
    proxy_set_header X-Forwarded-For \$proxy_add_x_forwarded_for;
    proxy_set_header REMOTE-HOST \$remote_addr;
    proxy_set_header X-Forwarded-Proto \$scheme;
    proxy_set_header X-Forwarded-Port \$server_port;
    proxy_http_version 1.1;
    proxy_set_header Connection \"\";
    proxy_buffering off;
    proxy_cache off;
    proxy_request_buffering off;
    gzip off;
    proxy_read_timeout 3700s;
    proxy_send_timeout 3700s;
    add_header X-Accel-Buffering no always;
    add_header Cache-Control \"no-cache\" always;
    add_header Strict-Transport-Security \"max-age=31536000\";
}
NGINX
docker exec 1Panel-openresty-Qju3 nginx -t
docker exec 1Panel-openresty-Qju3 nginx -s reload"

curl -fsS "$PUBLIC_BASE_URL/api/health" >/dev/null
printf 'GeWeHub deployed: %s\n' "$PUBLIC_BASE_URL"
