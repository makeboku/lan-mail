#!/usr/bin/env bash
#
# 一键生成并写入 D1 加密相关的 Cloudflare Worker Secrets
#
# 用法：
#   ./scripts/setup-secrets.sh
#   MAIL_ENCRYPTION_KEY=xxx MIGRATION_SECRET=yyy ./scripts/setup-secrets.sh
#
# 说明：
# - 未提供环境变量时会自动用 openssl 生成高强度随机密钥。
# - 会把密钥同时写入本地 .dev.vars（已被 .gitignore 忽略），方便 wrangler dev。
# - 密钥只会显示一次，请立即离线备份；丢失后已加密数据无法恢复。
set -euo pipefail

cd "$(dirname "$0")/.."

if ! command -v pnpm >/dev/null 2>&1; then
  echo "错误：未找到 pnpm，请先安装 Node.js >= 18 与 pnpm >= 8" >&2
  exit 1
fi

if ! command -v openssl >/dev/null 2>&1; then
  echo "错误：未找到 openssl，无法自动生成密钥。请手动设置环境变量后重试。" >&2
  exit 1
fi

MAIL_KEY="${MAIL_ENCRYPTION_KEY:-$(openssl rand -base64 32)}"
MIGRATION_KEY="${MIGRATION_SECRET:-$(openssl rand -base64 32)}"

if [ "${#MAIL_KEY}" -lt 16 ]; then
  echo "错误：MAIL_ENCRYPTION_KEY 至少需要 16 个字符" >&2
  exit 1
fi

if [ "${#MIGRATION_KEY}" -lt 16 ]; then
  echo "错误：MIGRATION_SECRET 至少需要 16 个字符" >&2
  exit 1
fi

echo "即将写入 Worker Secrets："
echo "  MAIL_ENCRYPTION_KEY"
echo "  MIGRATION_SECRET"
echo
echo "如果尚未登录 Cloudflare，wrangler 会自动打开浏览器授权。"
echo

printf '%s' "$MAIL_KEY" | pnpm exec wrangler secret put MAIL_ENCRYPTION_KEY
printf '%s' "$MIGRATION_KEY" | pnpm exec wrangler secret put MIGRATION_SECRET

umask 077
WORKER_URL_LINE=""
if [ -f .dev.vars ]; then
  WORKER_URL_LINE="$(grep -E '^WORKER_URL=' .dev.vars | tail -n 1 || true)"
fi
{
  echo "# 由 scripts/setup-secrets.sh 生成，请勿提交到仓库"
  echo "MAIL_ENCRYPTION_KEY=$MAIL_KEY"
  echo "MIGRATION_SECRET=$MIGRATION_KEY"
  if [ -n "$WORKER_URL_LINE" ]; then
    echo "$WORKER_URL_LINE"
  fi
} > .dev.vars
chmod 600 .dev.vars

echo
echo "============================================================"
echo "Secrets 已写入，且已保存到本地 .dev.vars（权限 600）。"
echo "请立即把下面两个密钥离线备份（密码管理器 / 加密U盘）："
echo
echo "MAIL_ENCRYPTION_KEY=$MAIL_KEY"
echo "MIGRATION_SECRET=$MIGRATION_KEY"
echo
echo "注意：MAIL_ENCRYPTION_KEY 丢失后，D1 中已加密数据将无法恢复。"
echo "============================================================"
