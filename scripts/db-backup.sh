#!/usr/bin/env bash
#
# 导出线上 D1 数据库备份（迁移/升级前必须执行）
#
# 用法：
#   ./scripts/db-backup.sh
#   ./scripts/db-backup.sh my-backup.sql
#   D1_DATABASE_NAME=你的库名 ./scripts/db-backup.sh
#
# 说明：
# - 默认从 wrangler.toml 读取 database_name，避免库名改了以后备份错库。
# - 默认输出到 d1-backup-<时间戳>.sql，已被 .gitignore 忽略。
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v pnpm >/dev/null 2>&1; then
  echo "错误：未找到 pnpm，请先安装 Node.js >= 18 与 pnpm >= 8" >&2
  exit 1
fi

DB_NAME="${D1_DATABASE_NAME:-}"
if [ -z "$DB_NAME" ] && [ -f wrangler.toml ]; then
  DB_NAME="$(sed -nE 's/^[[:space:]]*database_name[[:space:]]*=[[:space:]]*"([^"]+)".*/\1/p' wrangler.toml | head -n 1)"
fi

if [ -z "$DB_NAME" ]; then
  echo "错误：无法从 wrangler.toml 读取 database_name，请设置 D1_DATABASE_NAME 后重试。" >&2
  exit 1
fi

if printf '%s' "$DB_NAME" | grep -q '\${'; then
  echo "错误：wrangler.toml 中的 database_name 仍是 \${...} 占位符。" >&2
  echo "Wrangler 不支持变量插值，请先填入真实的 D1 数据库名称。" >&2
  exit 1
fi

OUTPUT="${1:-d1-backup-$(date +%Y%m%d-%H%M%S).sql}"

echo "==> 导出线上 D1 数据库：$DB_NAME"
pnpm exec wrangler d1 export "$DB_NAME" --remote --output "$OUTPUT"
echo
echo "备份完成：$OUTPUT"
echo "请把该文件保存到安全位置；它包含数据库明文/密文数据，不要提交到 Git。"
