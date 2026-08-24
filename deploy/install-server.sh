#!/bin/bash
# daily-ai-briefing 服务器端安装脚本
# 用 Python Flask(不装 Node),零缓存、零 SQLite。
# 用法: MINIMAX_API_KEY=... bash /tmp/daily-ai-briefing-install.sh

set -euo pipefail

APP_DIR="/opt/daily-ai-briefing"
APP_PORT="${APP_PORT:-3535}"
LOG_FILE="/var/log/daily-ai-briefing.log"

log() { echo "[install] $*"; }
fail() { echo "[install] ❌ $*" >&2; exit 1; }

log "=== 1. 检查 Python 3 ==="
if ! command -v python3 >/dev/null 2>&1; then
  fail "python3 不存在,服务器需要有 Python 3.8+"
fi
PY_VERSION=$(python3 -c "import sys; print(f'{sys.version_info.major}.{sys.version_info.minor}')")
log "Python ${PY_VERSION} 已装"
PY_MAJOR=$(echo "$PY_VERSION" | cut -d. -f1)
PY_MINOR=$(echo "$PY_VERSION" | cut -d. -f2)
if [ "$PY_MAJOR" -lt 3 ] || { [ "$PY_MAJOR" -eq 3 ] && [ "$PY_MINOR" -lt 8 ]; }; then
  fail "Python 3.8+ 必需,当前 $PY_VERSION"
fi

log "=== 2. 检查 Flask ==="
if ! python3 -c "import flask" 2>/dev/null; then
  log "Flask 没装,从 dnf 装"
  dnf install -y python3-flask || fail "Flask 装失败"
fi
FLASK_VER=$(python3 -c "import flask; print(flask.__version__)")
log "Flask ${FLASK_VER} 已就绪"

log "=== 3. 创建 app 目录 ==="
mkdir -p "$APP_DIR/public"
mkdir -p "$(dirname "$LOG_FILE")"

log "=== 4. 检查代码(由 workflow 提前 scp) ==="
if [ ! -f "$APP_DIR/app.py" ]; then
  fail "$APP_DIR/app.py 不存在,workflow 应该 scp 了"
fi
ls -la "$APP_DIR"

log "=== 5. 写 .env(只放非敏感默认 + 接收外部 key)==="
ENV_FILE="$APP_DIR/.env"
cat > "$ENV_FILE" <<EOF
PORT=$APP_PORT
HOST=0.0.0.0
MINIMAX_API_KEY=${MINIMAX_API_KEY:-}
MINIMAX_BASE_URL=${MINIMAX_BASE_URL:-https://api.minimaxi.com/v1}
MINIMAX_MODEL=${MINIMAX_MODEL:-MiniMax-M3}
APP_BASE_URL=${APP_BASE_URL:-http://119.29.189.103:3535}
GITHUB_CLIENT_ID=${GITHUB_CLIENT_ID:-}
GITHUB_CLIENT_SECRET=${GITHUB_CLIENT_SECRET:-}
GOOGLE_CLIENT_ID=${GOOGLE_CLIENT_ID:-}
GOOGLE_CLIENT_SECRET=${GOOGLE_CLIENT_SECRET:-}
FLASK_SECRET=${FLASK_SECRET:-}
EOF
chmod 600 "$ENV_FILE"
log "写入 .env (chmod 600)"

log "=== 6. 写 systemd service ==="
SERVICE_FILE="/etc/systemd/system/daily-ai-briefing.service"
cat > "$SERVICE_FILE" <<EOF
[Unit]
Description=Daily AI Briefing (Python Flask)
After=network.target

[Service]
Type=simple
User=root
WorkingDirectory=$APP_DIR
EnvironmentFile=$ENV_FILE
ExecStart=/usr/bin/python3 $APP_DIR/app.py
Restart=on-failure
RestartSec=5
StandardOutput=append:$LOG_FILE
StandardError=append:$LOG_FILE

[Install]
WantedBy=multi-user.target
EOF

log "=== 7. 重载 systemd + 启动 ==="
systemctl daemon-reload
systemctl enable daily-ai-briefing
systemctl restart daily-ai-briefing

log "=== 8. 健康检查 ==="
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

log "=== 9. 监听端口 ==="
(ss -tlnp 2>/dev/null || netstat -tlnp 2>/dev/null) | grep -E ":$APP_PORT\b" || log "⚠️ 端口 $APP_PORT 未在监听"

log ""
log "============================================"
log "✅ 部署完成"
log "本地访问: http://127.0.0.1:$APP_PORT/"
log "公网访问: http://119.29.189.103:$APP_PORT/"
log "日志:     $LOG_FILE"
log "服务:     systemctl {status|restart|stop} daily-ai-briefing"
log "============================================"
