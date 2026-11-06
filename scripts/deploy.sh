#!/usr/bin/env bash
#
# 一键部署：安装依赖 -> 部署 Worker -> 检查/配置加密 Secrets
#
# 用法：
#   ./scripts/deploy.sh                 # 正常部署（会检查 Secrets）
#   ./scripts/deploy.sh --skip-secrets  # 跳过 Secrets 检查（CI 场景）
#   SKIP_SECRET_CHECK=1 ./scripts/deploy.sh
#
# 说明：
# - wrangler.toml 的 [build] 已配置 "pnpm run build"，wrangler deploy 会自动构建前端。
# - 首次部署时 Worker 还不存在，无法提前写入 Secret，所以先部署、再检查/写入 Secret。
# - 未配置 MAIL_ENCRYPTION_KEY 时程序仍可运行，但敏感字段会以明文写入 D1。
set -euo pipefail

cd "$(dirname "$0")/.."

SKIP_SECRET_CHECK="${SKIP_SECRET_CHECK:-0}"
if [ "${1:-}" = "--skip-secrets" ]; then
  SKIP_SECRET_CHECK=1
fi

if ! command -v pnpm >/dev/null 2>&1; then
  echo "错误：未找到 pnpm，请先安装 Node.js >= 18 与 pnpm >= 8" >&2
  exit 1
fi

echo "==> [1/3] 安装依赖"
pnpm install

echo "==> [2/3] 构建并部署"
pnpm run deploy

if [ "$SKIP_SECRET_CHECK" != "1" ]; then
  echo "==> [3/3] 检查加密 Secrets"
  SECRET_LIST="$(pnpm exec wrangler secret list 2>/dev/null || true)"
  if ! printf '%s' "$SECRET_LIST" | grep -q '"MAIL_ENCRYPTION_KEY"'; then
    echo "警告：线上尚未配置 MAIL_ENCRYPTION_KEY，当前 D1 敏感字段仍为明文。"
    if [ -t 0 ]; then
      read -r -p "是否现在生成并配置加密密钥？[Y/n] " answer
      case "${answer:-Y}" in
        [Yy]|[Yy][Ee][Ss])
          bash scripts/setup-secrets.sh
          echo "Secret 已写入，通常无需重新部署；若状态未更新，再执行一次 pnpm run deploy。"
          ;;
        *)
          echo "已跳过。稍后可运行：pnpm run secrets:setup"
          ;;
      esac
    else
      echo "非交互环境已跳过。稍后可运行：pnpm run secrets:setup"
    fi
  else
    echo "已检测到 MAIL_ENCRYPTION_KEY。"
  fi
else
  echo "==> [3/3] 已跳过 Secrets 检查"
fi

echo
echo "部署完成。后续步骤："
echo "  1. 在 Cloudflare 控制台为 Worker 绑定自定义域名"
echo "  2. 配置 Email Routing：Catch-all -> Send to Worker"
echo "  3. 旧库首次启用加密后，备份并分批迁移历史数据："
echo "     pnpm run db:backup"
echo "     WORKER_URL=https://你的域名 pnpm run encryption:status"
echo "     WORKER_URL=https://你的域名 pnpm run encryption:migrate"
