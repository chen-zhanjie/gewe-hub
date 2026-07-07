#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:8090}"
RUN_ID="${SMOKE_TEST_RUN_ID:-$(date +%s%N)}"
SMOKE_FROM_USER="wxid_smoke_${RUN_ID}"
PAYLOAD="$(mktemp)"
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
ADMIN_USERNAME="${ADMIN_USERNAME:-admin}"
ADMIN_PASSWORD="${ADMIN_PASSWORD:-admin123456}"
SAMPLE="${SAMPLE:-references/gewe-raw-samples/2026-07-05-production/TEXT/001__event_4__msg_6692899871431281247.json}"
COOKIE_JAR="$(mktemp)"
trap 'rm -f "$COOKIE_JAR" "$PAYLOAD"' EXIT

make_payload() {
  local target="$1"
  SAMPLE="$SAMPLE" TARGET="$target" RUN_ID="$RUN_ID" SMOKE_FROM_USER="$SMOKE_FROM_USER" node <<'NODE'
const fs = require("node:fs");
const sample = JSON.parse(fs.readFileSync(process.env.SAMPLE, "utf8"));
const runId = process.env.RUN_ID;
const fromUser = process.env.SMOKE_FROM_USER;
const stamp = Date.now();
const newMsgId = `smoke_${runId}_${stamp}`;
const content = `GeWeHub smoke ${runId}`;

function setWrappedString(target, key, value) {
  if (target[key] && typeof target[key] === "object" && !Array.isArray(target[key]) && "string" in target[key]) {
    target[key].string = value;
    return;
  }
  target[key] = value;
}

if (sample.Data && typeof sample.Data === "object" && !Array.isArray(sample.Data)) {
  sample.Data.NewMsgId = newMsgId;
  sample.Data.MsgId = `msg_${newMsgId}`;
  sample.Data.CreateTime = stamp;
  setWrappedString(sample.Data, "Content", content);
  setWrappedString(sample.Data, "FromUserName", fromUser);
  if (!sample.Data.ToUserName) setWrappedString(sample.Data, "ToUserName", sample.Wxid ?? sample.wxid ?? "wxid_bot");
  sample.Data.PushContent = `${fromUser} : ${content}`;
  if (!sample.Wxid && sample.wxid) sample.Wxid = sample.wxid;
} else {
  sample.newMsgId = newMsgId;
  sample.msgId = `msg_${newMsgId}`;
  sample.createTime = stamp;
  sample.content = content;
  sample.fromUser = fromUser;
  sample.pushContent = `${fromUser} : ${content}`;
  if (!sample.toUser) sample.toUser = sample.wxid ?? "wxid_bot";
}

fs.writeFileSync(process.env.TARGET, JSON.stringify(sample));
process.stdout.write(`msg_${newMsgId}`);
NODE
}

MESSAGE_ID="$(make_payload "$PAYLOAD")"

if [ "${SMOKE_TEST_DRY_RUN:-0}" = "1" ]; then
  DRY_RUN_DIR="${SMOKE_TEST_DRY_RUN_DIR:-$(mktemp -d)}"
  mkdir -p "$DRY_RUN_DIR"
  dry_run_payload="$DRY_RUN_DIR/payload.json"
  cp "$PAYLOAD" "$dry_run_payload"
  MESSAGE_ID="$MESSAGE_ID" PAYLOAD_PATH="$dry_run_payload" node -e 'console.log(JSON.stringify({messageId: process.env.MESSAGE_ID, payloadPath: process.env.PAYLOAD_PATH}))'
  exit 0
fi

echo "== health =="
curl -fsS "$BASE_URL/api/health"
echo

echo "== replay sample =="
curl -fsS -X POST "$BASE_URL/webhook/gewe/$SECRET" \
  -H "Content-Type: application/json" \
  --data-binary "@$PAYLOAD"
echo

echo "== login =="
curl -fsS -c "$COOKIE_JAR" -H "Content-Type: application/json" \
  -d "{\"username\":\"$ADMIN_USERNAME\",\"password\":\"$ADMIN_PASSWORD\"}" \
  "$BASE_URL/api/auth/login"
echo

echo "== wait outbox =="
for _ in $(seq 1 10); do
  if [ -n "$MESSAGE_ID" ] && message="$(curl -fsS -b "$COOKIE_JAR" "$BASE_URL/api/messages/$MESSAGE_ID" 2>/dev/null)"; then
    printf '%s' "$message" | node -e 'let data=""; process.stdin.on("data", c => data += c); process.stdin.on("end", () => { const row = JSON.parse(data); console.log(JSON.stringify({ messageId: row.messageId, type: row.type, status: row.status, renderedText: row.renderedText, conversationId: row.conversationId }, null, 2)); });'
    conversation_id="$(printf '%s' "$message" | node -e 'let data=""; process.stdin.on("data", c => data += c); process.stdin.on("end", () => { const row = JSON.parse(data); process.stdout.write(row.conversationId ?? ""); });')"
    echo
    echo "== messages =="
    curl -fsS -b "$COOKIE_JAR" "$BASE_URL/api/conversations/$conversation_id/messages" \
      | node -e 'let data=""; process.stdin.on("data", c => data += c); process.stdin.on("end", () => { const rows = JSON.parse(data); console.log(JSON.stringify(rows.slice(0, 5).map((row) => ({ messageId: row.messageId, type: row.type, status: row.status, renderedText: row.renderedText })), null, 2)); });'
    echo
    exit 0
  fi
  sleep 1
done

echo "== message =="
[ -n "$MESSAGE_ID" ] && curl -fsS -b "$COOKIE_JAR" "$BASE_URL/api/messages/$MESSAGE_ID" \
  | node -e 'let data=""; process.stdin.on("data", c => data += c); process.stdin.on("end", () => { if (!data) return; const row = JSON.parse(data); console.log(JSON.stringify({ messageId: row.messageId, type: row.type, status: row.status, renderedText: row.renderedText }, null, 2)); });' || true
echo
echo "No message was generated for sample message id: ${MESSAGE_ID:-unknown}." >&2
exit 1
