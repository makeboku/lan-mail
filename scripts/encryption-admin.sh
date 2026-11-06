#!/usr/bin/env bash
#
# 历史明文数据加密迁移助手
#
# 用法：
#   WORKER_URL=https://你的域名 ./scripts/encryption-admin.sh status
#   WORKER_URL=https://你的域名 ./scripts/encryption-admin.sh migrate [每批条数]
#
# 也可以先把 WORKER_URL / MIGRATION_SECRET 写入 .dev.vars，再直接运行：
#   ./scripts/encryption-admin.sh status
#   ./scripts/encryption-admin.sh migrate 20
#
# 说明：
# - MIGRATION_SECRET 未配置时，管理接口会返回 401。
# - 迁移是分批的，需要重复执行 migrate，直到 remaining 全为 0。
set -euo pipefail

cd "$(dirname "$0")/.."

read_var() {
  local name="$1"
  if [ -n "${!name:-}" ]; then
    printf '%s' "${!name}"
    return 0
  fi
  if [ -f .dev.vars ]; then
    grep -E "^${name}=" .dev.vars | tail -n 1 | cut -d= -f2- || true
  fi
}

WORKER_URL="${WORKER_URL:-$(read_var WORKER_URL)}"
MIGRATION_SECRET="${MIGRATION_SECRET:-$(read_var MIGRATION_SECRET)}"

if [ -z "$WORKER_URL" ]; then
  echo "错误：请设置 WORKER_URL，例如：" >&2
  echo "  WORKER_URL=https://mail.example.com $0 ${1:-status}" >&2
  exit 1
fi
if [ -z "$MIGRATION_SECRET" ]; then
  echo "错误：请设置 MIGRATION_SECRET，或先运行 pnpm run secrets:setup" >&2
  exit 1
fi

WORKER_URL="${WORKER_URL%/}"
ACTION="${1:-status}"

case "$ACTION" in
  status)
    echo "==> GET $WORKER_URL/api/admin/encryption/status"
    curl -fsS -H "X-Migration-Secret: $MIGRATION_SECRET" \
      "$WORKER_URL/api/admin/encryption/status"
    echo
    ;;
  migrate)
    LIMIT="${2:-20}"
    echo "==> POST $WORKER_URL/api/admin/encryption/migrate (limit=$LIMIT)"
    curl -fsS -X POST \
      -H "X-Migration-Secret: $MIGRATION_SECRET" \
      -H "Content-Type: application/json" \
      -d "{\"limit\":$LIMIT}" \
      "$WORKER_URL/api/admin/encryption/migrate"
    echo
    echo "提示：重复执行本命令，直到 remaining 中所有数量为 0。"
    ;;
  *)
    echo "用法：$0 {status|migrate [limit]}" >&2
    exit 1
    ;;
esac
