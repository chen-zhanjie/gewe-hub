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
PUBLIC_BASE_URL="https://gewehub.yunzxu.com"
HOST_PORT="1870"
BUILD_DIR="$ROOT_DIR/runtime/deploy"
IMAGE_TAR="$BUILD_DIR/gewehub-latest-amd64.tar"

mkdir -p "$BUILD_DIR"

REMOTE_DIR_B64="$(printf '%s' "$REMOTE_DIR" | base64 | tr -d '\n')"
ssh "$REMOTE_HOST" "REMOTE_DIR_B64='$REMOTE_DIR_B64' python3 -" <<'PY'
import base64
import os
import pathlib
import re

remote_dir = base64.b64decode(os.environ["REMOTE_DIR_B64"]).decode()
p = pathlib.Path(remote_dir) / ".env.production"
if not p.is_file():
    raise SystemExit(f"Production env missing on remote host: {p}")

values = {}
for raw_line in p.read_text().splitlines():
    line = raw_line.strip()
    if not line or line.startswith("#") or "=" not in line:
        continue
    key, value = line.split("=", 1)
    values[key.strip()] = value.strip()

required = {
    "DATABASE_URL",
    "REDIS_URL",
    "GEWE_BASE_URL",
    "GEWE_TOKEN",
    "WEBHOOK_SECRET",
    "ADMIN_USERNAME",
    "ADMIN_PASSWORD_HASH",
    "SESSION_SECRET",
}
missing = sorted(key for key in required if not values.get(key))
if missing:
    raise SystemExit("Production env missing or empty required keys: " + ", ".join(missing))

raw_hash = values["ADMIN_PASSWORD_HASH"]
quoted = len(raw_hash) >= 2 and raw_hash[0] == raw_hash[-1] and raw_hash[0] in {"'", '"'}
admin_hash = raw_hash[1:-1] if quoted else raw_hash
if not quoted:
    raise SystemExit("ADMIN_PASSWORD_HASH must be quoted in production env to prevent Compose interpolation")
if not re.fullmatch(r"\$2[aby]\$\d{2}\$.{53}", admin_hash):
    raise SystemExit("ADMIN_PASSWORD_HASH is not a valid bcrypt hash")

print(f"Production env preserved: {p}")
PY

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
