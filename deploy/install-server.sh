#!/bin/bash
# daily-ai-briefing 服务器端安装脚本
# 由 GitHub Actions 推过来后 SSH 跑,幂等。
# 用法: bash /tmp/daily-ai-briefing-install.sh

set -euo pipefail

APP_DIR="/opt/daily-ai-briefing"
APP_PORT="${APP_PORT:-3535}"
LOG_FILE="/var/log/daily-ai-briefing.log"
NODE_VERSION_MIN=22

log() { echo "[install] $*"; }
fail() { echo "[install] ❌ $*" >&2; exit 1; }

log "=== 1. 检查 Node.js ==="
need_install=0
if ! command -v node >/dev/null 2>&1; then
  log "node 不存在,需要装"
  need_install=1
else
  current_major="$(node -v | sed -E 's/^v([0-9]+).*/\1/')"
  if [ "$current_major" -lt "$NODE_VERSION_MIN" ]; then
    log "node $(node -v) 太旧,需要装 v${NODE_VERSION_MIN}+"
    need_install=1
  else
    log "node $(node -v) 已装,跳过"
  fi
fi

if [ "$need_install" = "1" ]; then
  log "尝试 dnf 装 nodejs..."
  if ! dnf install -y nodejs 2>/tmp/dnf-nodejs.err; then
    log "dnf 仓库没找到 nodejs,改用 NodeSource 官方源"
    log "(node:sqlite 需要 Node 22+,dqn 安装如果版本太老就会触发这一步)"
    dnf module reset -y nodejs 2>/dev/null || true
    curl -fsSL https://rpm.nodesource.com/setup_22.x -o /tmp/ns-setup.sh \
      || fail "下载 NodeSource setup 失败(检查出网)"
    bash /tmp/ns-setup.sh
    dnf install -y nodejs
  fi
  node -v
  npm -v
fi

log "=== 2. 创建 app 目录 ==="
mkdir -p "$APP_DIR/data"
mkdir -p "$APP_DIR/public"
mkdir -p "$(dirname "$LOG_FILE")"

log "=== 3. 检查代码(由 workflow 提前 scp) ==="
if [ ! -f "$APP_DIR/server/index.js" ]; then
  fail "$APP_DIR/server/index.js 不存在,workflow 应该 scp 了"
fi
ls -la "$APP_DIR"

log "=== 4. 写 .env(chmod 600,含 MINIMAX_API_KEY 等)==="
ENV_FILE="$APP_DIR/.env"
if [ ! -f "$ENV_FILE" ] || [ ! -s "$ENV_FILE" ]; then
  if [ -n "${MINIMAX_API_KEY:-}" ]; then
    {
      echo "PORT=$APP_PORT"
      echo "NODE_ENV=production"
      echo "MINIMAX_API_KEY=$MINIMAX_API_KEY"
      echo "MINIMAX_BASE_URL=${MINIMAX_BASE_URL:-https://api.minimaxi.com/v1}"
    } > "$ENV_FILE"
    chmod 600 "$ENV_FILE"
    log "写入 .env (chmod 600)"
  else
    log "⚠️ MINIMAX_API_KEY 未注入,只写端口和 base url"
    {
      echo "PORT=$APP_PORT"
      echo "NODE_ENV=production"
      echo "MINIMAX_BASE_URL=https://api.minimaxi.com/v1"
    } > "$ENV_FILE"
    chmod 600 "$ENV_FILE"
  fi
else
  log ".env 已存在,跳过(避免覆盖)"
fi

log "=== 5. 写 systemd service ==="
SERVICE_FILE="/etc/systemd/system/daily-ai-briefing.service"
cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Daily AI Briefing (Express)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_FILE
ExecStart=/usr/bin/node server/index.js
Restart=on-failure
RestartSec=5
StandardOutput=append:$LOG_FILE
StandardError=append:$LOG_FILE

[Install]
WantedBy=multi-user.target
EOF

log "=== 6. 重载 systemd + 启动 ==="
systemctl daemon-reload
systemctl enable daily-ai-briefing
systemctl restart daily-ai-briefing

log "=== 7. 健康检查 ==="
sleep 3
if curl -sf "http://127.0.0.1:$APP_PORT/api/health" >/tmp/health.json; then
  log "✅ /api/health 200 OK"
  cat /tmp/health.json
  echo
else
  log "❌ /api/health 失败,日志:"
  systemctl status daily-ai-briefing --no-pager || true
  tail -50 "$LOG_FILE" || true
  fail "服务未起来,看上面日志"
fi

log "=== 8. 监听端口 ==="
(ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null) | grep -E ":$APP_PORT\b" || log "⚠️ 端口 $APP_PORT 未在监听"

log ""
log "============================================"
log "✅ 部署完成"
log "本地访问: http://127.0.0.1:$APP_PORT/"
log "公网访问: http://119.29.189.103:$APP_PORT/"
log "日志:     $LOG_FILE"
log "服务:     systemctl {status|restart|stop} daily-ai-briefing"
log "============================================"
