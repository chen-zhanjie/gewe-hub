#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8090}"
SAMPLE="${SAMPLE:-references/gewe-raw-samples/2026-07-05-production/TEXT/001__event_4__msg_6692899871431281247.json}"
APP_NAME="${APP_NAME:-GeWeHub SSE Smoke App}"
ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123456}"
DEBOUNCE_MS="${DEBOUNCE_MS:-123}"
MAX_WAIT_MS="${MAX_WAIT_MS:-456}"
RUN_ID="${SSE_SMOKE_RUN_ID:-$(date +%s%N)}"
SMOKE_FROM_USER="wxid_smoke_${RUN_ID}"

LOCAL_WEBHOOK_SECRET=""
if [ -f server/.env ]; then
  LOCAL_WEBHOOK_SECRET="$(grep -E '^WEBHOOK_SECRET=' server/.env | tail -n 1 | cut -d= -f2-)"
  LOCAL_WEBHOOK_SECRET="${LOCAL_WEBHOOK_SECRET%$'\r'}"
  LOCAL_WEBHOOK_SECRET="${LOCAL_WEBHOOK_SECRET#\"}"
  LOCAL_WEBHOOK_SECRET="${LOCAL_WEBHOOK_SECRET%\"}"
  LOCAL_WEBHOOK_SECRET="${LOCAL_WEBHOOK_SECRET#\'}"
  LOCAL_WEBHOOK_SECRET="${LOCAL_WEBHOOK_SECRET%\'}"
fi
SECRET="${WEBHOOK_SECRET:-${LOCAL_WEBHOOK_SECRET:-replace-with-random-secret}}"

COOKIE_JAR="$(mktemp)"
FIRST_PAYLOAD="$(mktemp)"
SECOND_PAYLOAD="$(mktemp)"
trap 'rm -f "$COOKIE_JAR" "$FIRST_PAYLOAD" "$SECOND_PAYLOAD"' EXIT

json_get() {
  node -e "const data=JSON.parse(require('fs').readFileSync(0,'utf8')); const path=process.argv[1].split('.'); let cur=data; for (const key of path) cur=cur?.[key]; process.stdout.write(cur == null ? '' : String(cur));" "$1"
}

make_payload() {
  local target="$1"
  local suffix="$2"
  SAMPLE="$SAMPLE" TARGET="$target" SUFFIX="$suffix" SMOKE_FROM_USER="$SMOKE_FROM_USER" node <<'NODE'
const fs = require("node:fs");
const sample = JSON.parse(fs.readFileSync(process.env.SAMPLE, "utf8"));
const stamp = Date.now();
const id = `smoke_${stamp}_${process.env.SUFFIX}`;
sample.newMsgId = id;
sample.msgId = `msg_${id}`;
sample.createTime = stamp;
sample.content = `SSE smoke ${process.env.SUFFIX}`;
if (!sample.isSelf) {
  sample.fromUser = process.env.SMOKE_FROM_USER;
}
sample.pushContent = `${sample.fromUser ?? "sender"} : ${sample.content}`;
fs.writeFileSync(process.env.TARGET, JSON.stringify(sample));
process.stdout.write(`msg_${id}`);
NODE
}

if [ "${SSE_SMOKE_DRY_RUN:-0}" = "1" ]; then
  DRY_RUN_DIR="${SSE_SMOKE_DRY_RUN_DIR:-$(mktemp -d)}"
  mkdir -p "$DRY_RUN_DIR"
  seed_path="$DRY_RUN_DIR/seed.json"
  first_path="$DRY_RUN_DIR/first.json"
  second_path="$DRY_RUN_DIR/second.json"
  seed_message_id="$(make_payload "$seed_path" seed)"
  first_message_id="$(make_payload "$first_path" first)"
  second_message_id="$(make_payload "$second_path" second)"
  SEED_ID="$seed_message_id" SEED_PATH="$seed_path" FIRST_ID="$first_message_id" FIRST_PATH="$first_path" SECOND_ID="$second_message_id" SECOND_PATH="$second_path" node -e 'console.log(JSON.stringify({seed:{messageId:process.env.SEED_ID,payloadPath:process.env.SEED_PATH},first:{messageId:process.env.FIRST_ID,payloadPath:process.env.FIRST_PATH},second:{messageId:process.env.SECOND_ID,payloadPath:process.env.SECOND_PATH}}))'
  exit 0
fi

wait_message() {
  local message_id="$1"
  local message=""
  for _ in $(seq 1 15); do
    if message="$(curl -fsS -b "$COOKIE_JAR" "$BASE_URL/api/messages/$message_id" 2>/dev/null)"; then
      printf '%s' "$message"
      return 0
    fi
    sleep 1
  done
  echo "Message was not generated: $message_id" >&2
  return 1
}

open_sse() {
  local token="$1"
  local last_event_id="${2:-}"
  if [ -n "$last_event_id" ]; then
    curl -sS --max-time 4 -H "Authorization: Bearer $token" -H "Last-Event-ID: $last_event_id" "$BASE_URL/api/apps/events" 2>/dev/null || true
  else
    curl -sS --max-time 4 -H "Authorization: Bearer $token" "$BASE_URL/api/apps/events" 2>/dev/null || true
  fi
}

parse_sse_json() {
  node -e '
let raw = "";
process.stdin.on("data", chunk => raw += chunk);
process.stdin.on("end", () => {
  const frames = raw.trim().split(/\n\n/).filter(Boolean).map((frame) => {
    const lines = frame.split(/\n/);
    const id = lines.find((line) => line.startsWith("id: "))?.slice(4);
    const event = lines.find((line) => line.startsWith("event: "))?.slice(7);
    const dataLine = lines.find((line) => line.startsWith("data: "))?.slice(6);
    return { id, event, data: dataLine ? JSON.parse(dataLine) : null };
  });
  process.stdout.write(JSON.stringify(frames));
});
'
}

find_event_for_message() {
  local frames_json="$1"
  local message_id="$2"
  FRAMES_JSON="$frames_json" MESSAGE_ID="$message_id" node <<'NODE'
const frames = JSON.parse(process.env.FRAMES_JSON || "[]");
const frame = frames.find((item) => item?.data?.payload?.messageId === process.env.MESSAGE_ID);
if (!frame) process.exit(1);
process.stdout.write(JSON.stringify(frame));
NODE
}

echo "== health =="
curl -fsS "$BASE_URL/api/health"
echo

echo "== login =="
curl -fsS -c "$COOKIE_JAR" -H "Content-Type: application/json" \
  -d "{\"username\":\"$ADMIN_USERNAME\",\"password\":\"$ADMIN_PASSWORD\"}" \
  "$BASE_URL/api/auth/login" >/dev/null
echo "ok"

echo "== replay seed sample =="
seed_message_id="$(make_payload "$FIRST_PAYLOAD" seed)"
curl -fsS -X POST "$BASE_URL/webhook/gewe/$SECRET" \
  -H "Content-Type: application/json" \
  --data-binary "@$FIRST_PAYLOAD" >/dev/null
seed_message="$(wait_message "$seed_message_id")"
conversation_id="$(printf '%s' "$seed_message" | json_get conversationId)"
account_id="$(printf '%s' "$seed_message" | json_get accountId)"
echo "{\"messageId\":\"$seed_message_id\",\"conversationId\":\"$conversation_id\"}"

echo "== ensure app =="
apps="$(curl -fsS -b "$COOKIE_JAR" "$BASE_URL/api/apps")"
app="$(APP_NAME="$APP_NAME" APPS="$apps" node <<'NODE'
const apps = JSON.parse(process.env.APPS || "[]");
const app = apps.find((item) => item.name === process.env.APP_NAME);
if (app) process.stdout.write(JSON.stringify(app));
NODE
)"
if [ -z "$app" ]; then
  app="$(curl -fsS -b "$COOKIE_JAR" -H "Content-Type: application/json" \
    -d "{\"name\":\"$APP_NAME\",\"defaultDebounceMs\":$DEBOUNCE_MS,\"defaultMaxWaitMs\":$MAX_WAIT_MS,\"deliverSelfMessages\":false}" \
    "$BASE_URL/api/apps")"
fi
app_id="$(printf '%s' "$app" | json_get id)"
app_token="$(printf '%s' "$app" | json_get token)"
echo "{\"appId\":\"$app_id\"}"

echo "== bind conversation and app remark =="
curl -fsS -b "$COOKIE_JAR" -H "Content-Type: application/json" \
  -d "{\"appId\":\"$app_id\",\"deliveryFilter\":\"all\",\"debounceMs\":$DEBOUNCE_MS,\"maxWaitMs\":$MAX_WAIT_MS}" \
  "$BASE_URL/api/conversations/$conversation_id/bind" >/dev/null
curl -fsS -b "$COOKIE_JAR" -H "Content-Type: application/json" \
  -d "{\"accountId\":\"$account_id\",\"remark\":\"Smoke应用账号备注\",\"tags\":[\"smoke\"]}" \
  "$BASE_URL/api/apps/$app_id/account-remarks" >/dev/null
echo "ok"

echo "== replay first SSE message =="
first_message_id="$(make_payload "$FIRST_PAYLOAD" first)"
curl -fsS -X POST "$BASE_URL/webhook/gewe/$SECRET" \
  -H "Content-Type: application/json" \
  --data-binary "@$FIRST_PAYLOAD" >/dev/null
wait_message "$first_message_id" >/dev/null

first_frames="$(open_sse "$app_token" | parse_sse_json)"
first_event="$(find_event_for_message "$first_frames" "$first_message_id")"
first_event_id="$(printf '%s' "$first_event" | json_get id)"
FIRST_EVENT="$first_event" DEBOUNCE_MS="$DEBOUNCE_MS" MAX_WAIT_MS="$MAX_WAIT_MS" node <<'NODE'
const frame = JSON.parse(process.env.FIRST_EVENT);
const payload = frame.data.payload;
if (payload.account?.remark !== "Smoke应用账号备注") throw new Error("account remark missing from SSE payload");
if (payload.metadata?.debounceMs !== Number(process.env.DEBOUNCE_MS)) throw new Error("debounce metadata mismatch");
if (payload.metadata?.maxWaitMs !== Number(process.env.MAX_WAIT_MS)) throw new Error("maxWait metadata mismatch");
console.log(JSON.stringify({ eventId: frame.id, messageId: payload.messageId, remark: payload.account.remark, metadata: payload.metadata }));
NODE

echo "== ack first event =="
ack_result="$(curl -fsS -X POST "$BASE_URL/api/apps/events/ack" \
  -H "Authorization: Bearer $app_token" \
  -H "Content-Type: application/json" \
  -d "{\"eventIds\":[\"$first_event_id\"]}")"
printf '%s\n' "$ack_result"
acked="$(printf '%s' "$ack_result" | json_get acked)"
if [ "$acked" != "1" ]; then
  echo "ACK did not confirm first event: $ack_result" >&2
  exit 1
fi

echo "== replay second SSE message and reconnect with Last-Event-ID =="
second_message_id="$(make_payload "$SECOND_PAYLOAD" second)"
curl -fsS -X POST "$BASE_URL/webhook/gewe/$SECRET" \
  -H "Content-Type: application/json" \
  --data-binary "@$SECOND_PAYLOAD" >/dev/null
wait_message "$second_message_id" >/dev/null

reconnect_frames="$(open_sse "$app_token" "$first_event_id" | parse_sse_json)"
if printf '%s' "$reconnect_frames" | grep -q "$first_event_id"; then
  echo "ACKed event was replayed unexpectedly: $first_event_id" >&2
  exit 1
fi
second_event="$(find_event_for_message "$reconnect_frames" "$second_message_id")"
printf '%s\n' "$second_event" | node -e 'const frame=JSON.parse(require("fs").readFileSync(0,"utf8")); console.log(JSON.stringify({eventId: frame.id, messageId: frame.data.payload.messageId}));'

echo "SSE smoke test passed."
