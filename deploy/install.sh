#!/usr/bin/env bash
# PA-Server: install or update on a fresh Ubuntu/Debian VPS, no Docker, no domain.
# The server answers on http://<server IP>/list (port 80).
#
# Run as root:
#   curl -fsSL https://raw.githubusercontent.com/Arc-Stuido-Playables/PA-Server/main/deploy/install.sh | bash
#
# Re-run the same command to update. Uploaded playables in /var/lib/pa-server are kept.
# Optional settings (password, upload limit) go to /etc/pa-server.env, see docs/DEPLOY-TIMEWEB.md.
set -euo pipefail

REPO="https://github.com/Arc-Stuido-Playables/PA-Server.git"
APP_DIR="/opt/pa-server"
DATA_DIR="/var/lib/pa-server"
PORT="${PORT:-80}"

log() { printf '==> %s\n' "$*"; }

# Everything runs inside main() so `curl | bash` reads the whole script first.
main() {
if [ "$(id -u)" -ne 0 ]; then
  echo "Запустите от root (или через sudo)." >&2
  exit 1
fi

export DEBIAN_FRONTEND=noninteractive

log "Системные пакеты"
apt-get update -qq
apt-get install -y -qq git curl ca-certificates >/dev/null

if ! command -v node >/dev/null 2>&1 || [ "$(node -p 'process.versions.node.split(".")[0]')" -lt 20 ]; then
  log "Установка Node.js 22"
  curl -fsSL https://deb.nodesource.com/setup_22.x | bash - >/dev/null
  apt-get install -y -qq nodejs >/dev/null
fi
log "Node $(node -v)"

if ! id pa-server >/dev/null 2>&1; then
  useradd --system --home-dir "$DATA_DIR" --shell /usr/sbin/nologin pa-server
fi
mkdir -p "$DATA_DIR"
chown pa-server:pa-server "$DATA_DIR"

if [ -d "$APP_DIR/.git" ]; then
  log "Обновление кода"
  git -C "$APP_DIR" fetch --depth 1 origin main
  git -C "$APP_DIR" reset --hard origin/main
else
  log "Загрузка кода"
  git clone --depth 1 "$REPO" "$APP_DIR"
fi

log "Зависимости"
(cd "$APP_DIR" && npm ci --omit=dev --no-audit --no-fund --loglevel=error)

touch /etc/pa-server.env

log "Сервис systemd"
cat > /etc/systemd/system/pa-server.service <<EOF
[Unit]
Description=PA-Server (Arc Studio playables)
After=network-online.target
Wants=network-online.target

[Service]
User=pa-server
WorkingDirectory=$APP_DIR
Environment=NODE_ENV=production
Environment=PORT=$PORT
Environment=DATA_DIR=$DATA_DIR
EnvironmentFile=-/etc/pa-server.env
ExecStart=/usr/bin/env node server.js
Restart=always
RestartSec=2
AmbientCapabilities=CAP_NET_BIND_SERVICE
NoNewPrivileges=true
ProtectSystem=full
ReadWritePaths=$DATA_DIR

[Install]
WantedBy=multi-user.target
EOF

systemctl daemon-reload
systemctl enable pa-server >/dev/null 2>&1
systemctl restart pa-server

if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow "$PORT/tcp" >/dev/null
fi

log "Проверка"
for _ in $(seq 1 30); do
  if curl -fsS "http://127.0.0.1:$PORT/healthz" >/dev/null 2>&1; then
    IP="$(curl -fsS --max-time 5 https://api.ipify.org 2>/dev/null || hostname -I | awk '{print $1}')"
    echo
    echo "Готово! Сервер плееблов: http://$IP/list"
    echo "Файлы хранятся в $DATA_DIR/files"
    exit 0
  fi
  sleep 1
done

echo "Сервер не ответил. Логи: journalctl -u pa-server -n 50" >&2
exit 1
}

main "$@"
